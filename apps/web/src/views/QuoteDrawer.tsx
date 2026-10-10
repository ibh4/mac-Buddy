import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { MealTemplate, MealVersion, AvailabilityResult, QuoteSnapshot } from '../types';
import { formatYuan, formatDate } from '../components/Common';

const BE_TYPES = [
  { beType: 1, label: '到店自取', orderType: 1 },
  { beType: 5, label: '得来速', orderType: 1 },
  { beType: 2, label: '麦乐送到家', orderType: 2 },
];

export default function QuoteDrawer({
  open,
  onClose,
  template,
  version,
  items,
  status,
  onOrdered,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  template: MealTemplate;
  version: MealVersion;
  items: any[];
  status: any;
  onOrdered?: (order: any) => void;
  showToast: (m: string) => void;
}) {
  const [beType, setBeType] = useState(1);
  const orderType = BE_TYPES.find((b) => b.beType === beType)!.orderType;
  const [stores, setStores] = useState<any[]>([]);
  const [storeCode, setStoreCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [avail, setAvail] = useState<AvailabilityResult | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [quote, setQuote] = useState<QuoteSnapshot | null>(null);
  const [priceUnavailable, setPriceUnavailable] = useState(false);
  const [priceMessage, setPriceMessage] = useState<string | undefined>(undefined);
  const [takeWayList, setTakeWayList] = useState<any[]>([]);
  const [takeWayCode, setTakeWayCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [verifyInfo, setVerifyInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const signature = useMemo(
    () => `${storeCode}|${orderType}|${beType}|${items.map((i) => i.productCode + ':' + i.quantity).join(',')}`,
    [storeCode, orderType, beType, items]
  );

  useEffect(() => {
    if (!open) return;
    setQuote(null);
    setOrder(null);
    setAvail(null);
    setErr(null);
    setPriceUnavailable(false);
    setPriceMessage(undefined);
    setTakeWayCode('');
    setTakeWayList([]);
    setStoreCode('');
    api
      .stores(beType)
      .then((r) => setStores(r.stores || []))
      .catch(() => setStores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, beType]);

  // 门店/餐品变化 → 旧报价立即失效
  useEffect(() => {
    if (quote) setQuote(null);
    if (order) setOrder(null);
    setAvail(null);
    setVerifyInfo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (!open) return null;

  const checkAvailability = async () => {
    if (!storeCode) return showToast('请先选择门店');
    setAvailLoading(true);
    setErr(null);
    try {
      const r = await api.checkAvailability({ items } as any, storeCode, orderType, beType);
      setAvail(r);
      if (!r.allSellable) showToast('有餐品在当前门店不可售，请处理后再核价');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setAvailLoading(false);
    }
  };

  const doQuote = async () => {
    if (!storeCode) return showToast('请先选择门店');
    if (avail && !avail.allSellable) return showToast('存在不可售餐品，无法核价');
    setErr(null);
    setPriceUnavailable(false);
    setPriceMessage(undefined);
    try {
      const r = await api.quote({ versionId: version.id, storeCode, storeName, orderType, beType, items });
      setQuote(r.quote);
      setPriceUnavailable(!!r.priceUnavailable);
      setPriceMessage(r.priceMessage);
      const tw = r.takeWayList || [];
      setTakeWayList(tw);
      setTakeWayCode(orderType === 1 && tw.length ? tw[0].code : '');
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const doOrder = async () => {
    if (!quote) return showToast('请先核价');
    if (orderType === 1 && !takeWayCode) return showToast('请选择取餐方式（堂食/外带）');
    if (submitting) return; // 防重复提交
    setSubmitting(true);
    setErr(null);
    try {
      const r = await api.createOrder({
        quoteId: quote.id,
        items,
        storeCode,
        storeName,
        orderType,
        beType,
        takeWayCode: orderType === 1 ? takeWayCode : undefined,
      });
      setOrder(r);
      if (r.demo) showToast('演示模式：未创建真实订单');
      else if (r.attempt.status === 'unknown') showToast('下单结果不明，请稍后核实');
      else showToast('订单已提交');
      onOrdered?.(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async () => {
    if (!order?.attempt?.remoteOrderId) return;
    try {
      const r = await api.verifyOrder(order.attempt.remoteOrderId);
      setVerifyInfo('核实结果：' + JSON.stringify(r.data?.orderStatus ?? r.data ?? r));
    } catch (e: any) {
      setVerifyInfo('核实失败：' + e.message);
    }
  };

  const canOrder = !!quote && !priceUnavailable && !!avail?.allSellable && !(orderType === 1 && !takeWayCode);

  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2>核对后下单</h2>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <p className="muted small">餐单：{template.name} · 版本：{version.changeSummary}</p>

        {status?.mode === 'demo' && <div className="banner info">演示模式：使用虚构数据，不会产生真实订单或支付链接。</div>}

        <div className="field">
          <label>就餐方式</label>
          <div className="row">
            {BE_TYPES.map((b) => (
              <button
                key={b.beType}
                className="chip-btn"
                style={beType === b.beType ? { background: 'var(--yellow)', color: 'var(--text)', fontWeight: 700 } : {}}
                onClick={() => setBeType(b.beType)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>选择门店</label>
          <select
            className="select"
            value={storeCode}
            onChange={(e) => {
              const s = stores.find((x) => x.storeCode === e.target.value);
              setStoreCode(e.target.value);
              setStoreName(s?.storeName || '');
            }}
          >
            <option value="">— 请选择门店 —</option>
            {stores.map((s) => (
              <option key={s.storeCode} value={s.storeCode}>{s.storeName}</option>
            ))}
          </select>
          {status?.mode === 'real' && stores.length === 0 && (
            <p className="muted small">（暂无收藏门店；可在“连接设置”了解如何按城市搜索附近门店）</p>
          )}
        </div>

        <button className="btn btn-ghost btn-block" onClick={checkAvailability} disabled={availLoading || !storeCode}>
          {availLoading ? '检查中…' : '检查可售性'}
        </button>

        {avail && (
          <div className="panel" style={{ marginTop: 12 }}>
            <h2 style={{ fontSize: 15 }}>可售性</h2>
            {avail.items.map((it) => (
              <div key={it.productCode} className="checkout-line">
                <span>{it.productName} ×{items.find((x) => x.productCode === it.productCode)?.quantity}</span>
                <span style={{ color: it.sellable ? '#2f7d32' : 'var(--red)', fontWeight: 700 }}>
                  {it.sellable ? '可售' : '不可售'}
                </span>
              </div>
            ))}
            {!avail.allSellable && <p className="clarify" style={{ marginTop: 8 }}>有餐品不可售（历史编码可能已变更），请返回修改或替换后再核价。</p>}
          </div>
        )}

        <div className="divider" />
        <h2 style={{ fontSize: 16 }}>餐品清单</h2>
        {items.map((it) => (
          <div className="checkout-line" key={it.productCode}>
            <span>{it.productName} {it.modification?.values?.length ? '（特制）' : ''}</span>
            <span>×{it.quantity}</span>
          </div>
        ))}
        {version.snapshot.historicalAmount != null && (
          <p className="muted small" style={{ marginTop: 6 }}>
            历史参考金额：{formatYuan(version.snapshot.historicalAmount)}（仅供参考，非当前报价）
          </p>
        )}

        <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={doQuote} disabled={!storeCode}>
          核价（calculate-price）
        </button>

        {quote && (
          <div className="panel" style={{ marginTop: 12 }}>
            <h2 style={{ fontSize: 15 }}>当前报价</h2>
            {priceUnavailable ? (
              <div className="banner warn">
                <b>价格暂不可用</b>
                <p className="small" style={{ margin: '4px 0 0' }}>{priceMessage || '当前商品暂无法单独核价，请检查餐品或门店后重试。'}</p>
              </div>
            ) : (
              <>
                <div className="checkout-total"><span>应付</span><span className="amt">{formatYuan(quote.amount)}</span></div>
                <p className="muted small">报价时间：{formatDate(quote.quotedAt)} · 门店 {quote.storeName || quote.storeCode}</p>
                {orderType === 1 && <p className="muted small">门店或餐单若变化，本报价会立即失效，需重新核价。</p>}
                {orderType === 1 && takeWayList.length > 0 && (
                  <div className="field" style={{ marginTop: 8 }}>
                    <label>取餐方式</label>
                    <div className="row">
                      {takeWayList.map((t) => (
                        <button
                          key={t.code}
                          className="chip-btn"
                          style={takeWayCode === t.code ? { background: 'var(--yellow)', color: 'var(--text)', fontWeight: 700 } : {}}
                          onClick={() => setTakeWayCode(t.code)}
                        >
                          {t.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {err && <div className="banner warn" style={{ marginTop: 12 }}>{err}</div>}

        {!order && canOrder && (
          <button className="btn btn-red btn-block" style={{ marginTop: 14 }} onClick={doOrder} disabled={submitting}>
            {submitting ? '提交中…（请勿重复点击）' : '确认下单'}
          </button>
        )}

        {order && <OrderResult order={order} onVerify={verify} verifyInfo={verifyInfo} />}
      </div>
    </div>
  );
}

function OrderResult({ order, onVerify, verifyInfo }: { order: any; onVerify: () => void; verifyInfo: string | null }) {
  const a = order.attempt;
  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <h2 style={{ fontSize: 15 }}>下单结果</h2>
      <div className="checkout-line"><span>状态</span><span style={{ fontWeight: 700 }}>{a.status === 'confirmed' ? '已确认' : a.status === 'unknown' ? '结果不明' : a.status}</span></div>
      {a.remoteOrderId && <div className="checkout-line"><span>订单号</span><span>{a.remoteOrderId}</span></div>}
      {a.note && <p className="muted small">{a.note}</p>}
      {order.demo && <div className="banner info">演示模式：未产生真实订单，也无支付链接。</div>}
      {!order.demo && order.paymentUrl && (
        <a className="btn btn-primary btn-block" style={{ marginTop: 8 }} href={order.paymentUrl} target="_blank" rel="noreferrer">
          前往支付（由你完成）
        </a>
      )}
      {!order.demo && a.status === 'unknown' && (
        <div className="banner warn" style={{ marginTop: 8 }}>
          下单结果不明：系统未收到明确成功回执，<b>未自动重新下单</b>。请稍后在麦当劳 App 核实，或联系客服查询订单号。
        </div>
      )}
      {!order.demo && a.remoteOrderId && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={onVerify}>
          核实订单状态
        </button>
      )}
      {verifyInfo && <p className="muted small" style={{ marginTop: 6 }}>{verifyInfo}</p>}
    </div>
  );
}
