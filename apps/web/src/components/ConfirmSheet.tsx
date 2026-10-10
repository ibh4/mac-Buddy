import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { MealItem, AvailabilityResult, MealNutrition } from '../types';
import { ProductLine } from './ProductImage';

// 下单前看一眼：把所有“待确认的事实”集中在一屏，确认后才允许下单。
//  - 门店 / 就餐方式 / 当前时间（是否支持预约以接口能力为准，不支持就不给预约选项）；
//  - 商品图 + 名称 + 规格 + 数量，以及与“老样子”相比改了什么；
//  - 真实金额与构成（核价失败就明说，不显示假金额）；
//  - 自设参考值是否满足（未设置就不做健康评分）；
//  - 还有哪些不确定项（不可售、报价过期、缺必填、不支持的替换）；
//  - 出现两件完全相同的商品会提示“确认需要两份吗”，绝不静默删掉；
//  - 餐品/门店/就餐方式/关键参数变化就重新核价并要求重新确认；
//  - 只有点“确认下单”才会创建订单，且没有任何强制等待计时。

export interface CheckItem {
  level: 'warn' | 'info';
  text: string;
}

export default function ConfirmSheet({
  items,
  storeCode,
  storeName,
  orderType,
  beType,
  baseItems,
  locks,
  nutrition,
  images,
  demo,
  onBack,
  onConfirm,
  showToast,
}: {
  items: MealItem[];
  storeCode: string;
  storeName?: string;
  orderType: number;
  beType: number;
  /** 老样子的原始内容，用于展示“改了什么” */
  baseItems?: MealItem[];
  locks: string[];
  nutrition: MealNutrition | null;
  images: Record<string, string>;
  demo: boolean;
  onBack: () => void;
  onConfirm: (quoteId: string, amount: number) => void;
  showToast: (m: string) => void;
}) {
  const [avail, setAvail] = useState<AvailabilityResult | null>(null);
  const [price, setPrice] = useState<{ amount: number; demo: boolean; priceUnavailable?: boolean; priceMessage?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setConfirmed(false);
      try {
        const [a, p] = await Promise.all([
          api.checkAvailability({ items, storeCode, orderType, beType }, storeCode, orderType, beType).catch(() => null),
          api.pricePreview(items, storeCode, orderType, beType).catch(() => null),
        ]);
        if (!alive) return;
        setAvail(a);
        setPrice(p);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // 餐品/门店/就餐方式变化时重新核价并要求重新确认
  }, [JSON.stringify(items), storeCode, orderType, beType]);

  // 待确认项：只陈述事实，不替用户做决定
  const checks: CheckItem[] = [];
  const countMap = new Map<string, number>();
  for (const it of items) countMap.set(it.productCode, (countMap.get(it.productCode) || 0) + 1);
  for (const it of items) {
    if ((countMap.get(it.productCode) || 0) > 1 || it.quantity > 1) {
      checks.push({ level: 'warn', text: `「${it.productName}」共 ${items.filter((x) => x.productCode === it.productCode).reduce((s, x) => s + x.quantity, 0)} 份：确认需要两份吗？（不会替你删掉任何一份）` });
      break;
    }
  }
  if (avail && !avail.unavailable && !avail.allSellable) {
    const bad = avail.items.filter((i) => !i.sellable).map((i) => i.productName);
    if (bad.length) checks.push({ level: 'warn', text: `当前门店可能不可售：${bad.join('、')}` });
  }
  if (avail?.unavailable) checks.push({ level: 'info', text: '当前门店菜单暂不可用（可能不在营业时间），可售性无法核实。' });
  if (price?.priceUnavailable) checks.push({ level: 'warn', text: `金额暂不可用：${price.priceMessage || '接口未返回价格'}` });
  if (nutrition?.modificationUnknown) checks.push({ level: 'info', text: '含特制选项，特制后的营养变化未知。' });
  if (nutrition?.partial) checks.push({ level: 'info', text: `营养为已知部分合计（${nutrition.coverage.matched}/${nutrition.coverage.total} 项已匹配）。` });
  if (demo) checks.push({ level: 'info', text: '演示模式：不会创建任何真实订单，也不产生支付链接。' });

  const changed = baseItems ? diffSummary(baseItems, items) : '';

  return (
    <div className="card confirm-sheet">
      <h3>下单前看一眼</h3>

      <div className="confirm-grid">
        <div>
          <span className="muted small">门店</span>
          <b>{storeName || storeCode || '未选择'}</b>
        </div>
        <div>
          <span className="muted small">就餐方式</span>
          <b>{orderType === 2 ? '外送（麦乐送）' : '到店'}</b>
          <span className="muted small">{beType === 5 ? ' · 得来速' : beType === 1 ? ' · 到店自取' : ''}</span>
        </div>
        <div>
          <span className="muted small">下单时间</span>
          <b>立即下单</b>
          <span className="muted small">（是否支持预约以接口能力为准，不支持则不给该选项）</span>
        </div>
      </div>

      <div className="confirm-items">
        {items.map((it, i) => (
          <div key={`${it.productCode}-${i}`} className="confirm-item">
            <ProductLine url={images[it.productCode]} name={it.productName} quantity={it.quantity} demo={demo} combo={!!it.comboItemList?.length} />
            <span className="small muted">{locks.includes(it.productCode) ? '已锁定' : '可替换'}</span>
            {it.comboItemList?.length ? (
              <span className="small muted">
                含：{it.comboItemList.map((c) => `${c.name}×${c.quantity}`).join('、')}
              </span>
            ) : null}
            {it.couponCode && <span className="chip">已挂券 {it.couponCode}</span>}
          </div>
        ))}
      </div>

      {changed && <p className="caliber small">与老样子的差别：{changed}</p>}

      <div className="confirm-price">
        {price?.priceUnavailable ? (
          <b className="na">金额暂不可用</b>
        ) : (
          <>
            <b>¥{(price?.amount ?? 0).toFixed(2)}</b>
            <span className="muted small">（本次核价结果{price?.demo ? ' · 演示数据' : ''}）</span>
          </>
        )}
      </div>

      {nutrition && nutrition.energyRef && (
        <p className="caliber small">
          自设参考 {nutrition.energyRef.ref} kcal：{nutrition.energyRef.over ? '这一餐超出' : '这一餐未超出'}。
          （仅与你自设的参考值比较，不做健康评分）
        </p>
      )}

      {checks.length > 0 && (
        <div className="check-list">
          {checks.map((c, i) => (
            <p key={i} className={`check ${c.level}`}>
              {c.level === 'warn' ? '需留意：' : '说明：'}
              {c.text}
            </p>
          ))}
        </div>
      )}

      <label className="confirm-check">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>我已核对门店、餐品、数量与金额</span>
      </label>

      <div className="btn-row">
        <button className="btn btn-ghost" onClick={onBack}>
          再改改
        </button>
        <button
          className="btn btn-primary"
          disabled={!confirmed || loading || !!price?.priceUnavailable}
          onClick={() => {
            if (price?.priceUnavailable) {
              showToast('金额暂不可用，无法下单');
              return;
            }
            onConfirm('', price?.amount ?? 0);
          }}
        >
          确认下单
        </button>
      </div>
      <p className="caliber small">只有点“确认下单”才会创建订单；这里没有任何强制等待计时。</p>
    </div>
  );
}

/** 简单描述“改了什么”：只按商品编码与数量比对，不做营养或价格推断。 */
function diffSummary(base: MealItem[], next: MealItem[]): string {
  const sig = (list: MealItem[]) =>
    list.map((i) => `${i.productCode}×${i.quantity}`).sort().join('、');
  const a = sig(base);
  const b = sig(next);
  if (a === b) return '与老样子完全一致';
  const baseMap = new Map(base.map((i) => [i.productCode, i]));
  const nextMap = new Map(next.map((i) => [i.productCode, i]));
  const parts: string[] = [];
  for (const [code, ni] of nextMap) {
    const bi = baseMap.get(code);
    if (!bi) parts.push(`新增 ${ni.productName}×${ni.quantity}`);
    else if (bi.quantity !== ni.quantity) parts.push(`${ni.productName} ${bi.quantity}→${ni.quantity}`);
  }
  for (const [code, bi] of baseMap) {
    if (!nextMap.has(code)) parts.push(`去掉 ${bi.productName}`);
  }
  return parts.join('；') || '内容有调整';
}
