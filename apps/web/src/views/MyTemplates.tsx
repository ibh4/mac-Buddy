import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { MealTemplate, SavedMeal } from '../types';
import { formatDate } from '../components/Common';
import { Loading, Empty } from '../components/Common';
import ProductImage from '../components/ProductImage';

export default function MyTemplates({
  status,
  onOpen,
  onNavigate,
  onChanged,
  showToast,
}: {
  status: any;
  onOpen: (id: string) => void;
  onNavigate: (v: 'history') => void;
  onChanged: () => void;
  showToast: (m: string) => void;
}) {
  const [list, setList] = useState<MealTemplate[]>([]);
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [ts, ms] = await Promise.all([api.listTemplates(), api.savedMeals().catch(() => [] as SavedMeal[])]);
      setList(ts);
      setMeals(ms);
      // 商品图：地址来自 MCP 返回的官方图片；取不到就显示“示意图”
      const first = ms.find((m) => m.storeCode);
      if (first?.storeCode) {
        const codes = Array.from(new Set(ms.flatMap((m) => m.items.map((i) => i.productCode))));
        const img = await api.productImages(codes, first.storeCode, first.orderType || 1, first.beType || 1).catch(() => ({ images: {} as Record<string, string>, demo: true }));
        setImages(img.images || {});
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createBlank = async () => {
    const name = window.prompt('给这份“老样子”起个名字：', '我的老样子');
    if (!name) return;
    try {
      const r = await api.createTemplate(name.trim(), '', false, { items: [] });
      onChanged();
      onOpen(r.template.id);
    } catch (e: any) {
      showToast('创建失败：' + e.message);
    }
  };

  const del = async (t: MealTemplate) => {
    if (!confirm(`确定删除「${t.name}」及其所有版本？`)) return;
    await api.deleteTemplate(t.id);
    showToast('已删除');
    load();
    onChanged();
  };

  if (loading) return <div className="page"><Loading text="加载我的老样子…" /></div>;
  if (err) return <div className="page"><div className="banner warn">{err}</div><button className="btn btn-ghost" onClick={load}>重试</button></div>;

  return (
    <div className="page">
      <div className="section-title">我的老样子</div>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={createBlank}>＋ 新建餐单</button>
        <button className="btn btn-ghost" onClick={() => onNavigate('history')}>从历史订单保存</button>
      </div>

      {list.length === 0 ? (
        <Empty title="还没有老样子" desc="从一份常点的餐开始，或把历史订单存成模板。">
          <button className="btn btn-primary" onClick={createBlank}>＋ 新建餐单</button>
          <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => onNavigate('history')}>从历史订单保存</button>
        </Empty>
      ) : (
        <div className="grid">
          {list.map((t) => {
            const m = meals.find((x) => x.id === t.id);
            const head = m?.items?.[0];
            return (
              <div className="card card hover tpl-card" key={t.id} onClick={() => onOpen(t.id)} style={{ cursor: 'pointer' }}>
                <div className="tpl-top">
                  {/* 图片卡片：图 + 名称，图缺失时显示示意图，绝不只靠图传达信息 */}
                  <ProductImage url={head ? images[head.productCode] : undefined} name={head?.productName || t.name} size={64} demo={status?.mode !== 'real'} combo />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3>{t.favorite ? '★ ' : ''}{t.name}</h3>
                    <div className="meta">
                      共 {t.versionCount ?? 0} 个版本 · 最近 {formatDate(t.updatedAt)}
                    </div>
                  </div>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); del(t); }}>🗑</button>
                </div>
                {m && m.items.length > 0 && (
                  <div className="summary">{m.items.map((i) => i.productName).join(' + ')}</div>
                )}
                <div className="chips">
                  <span className="tag">{t.versionCount ?? 0} 版本</span>
                  {t.favorite && <span className="tag pink">常用</span>}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onOpen(t.id); }}>
                    打开
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
