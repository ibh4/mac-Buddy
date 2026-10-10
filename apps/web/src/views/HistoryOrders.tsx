import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Loading, Empty } from '../components/Common';

export default function HistoryOrders({
  onImported,
  onNavigate,
  showToast,
}: {
  onImported: (templateId: string) => void;
  onNavigate: (v: 'my') => void;
  showToast: (m: string) => void;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.historyOrders();
      setOrders(r.orders || []);
      setDemo(r.demo);
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

  const importIt = async (orderId: string) => {
    try {
      const r = await api.importOrder(orderId);
      showToast('已保存为老样子');
      onImported(r.template.id);
    } catch (e: any) {
      showToast('保存失败：' + e.message);
    }
  };

  if (loading) return <div className="page"><Loading text="加载历史订单…" /></div>;
  if (err) return <div className="page"><div className="banner warn">{err}</div><button className="btn btn-ghost" onClick={load}>重试</button></div>;

  return (
    <div className="page page-narrow">
      <div className="section-title">最近订单</div>
      {demo && <div className="banner info">演示模式：以下为虚构订单，仅用于体验“从历史订单保存”。</div>}

      {orders.length === 0 ? (
        <Empty title="没有历史订单" desc="可以手动创建第一份“老样子”，或稍后在真实模式下从麦当劳账户导入。">
          <button className="btn btn-primary" onClick={() => onNavigate('my')}>＋ 手动创建</button>
        </Empty>
      ) : (
        <div className="stack">
          {orders.map((o) => (
            <div className="card" key={o.orderId}>
              <div className="row">
                <div>
                  <div style={{ fontWeight: 700 }}>{o.storeName}</div>
                  <div className="muted small">{o.createTime} · {o.orderStatus}</div>
                </div>
                <span className="spacer" />
                <div style={{ fontWeight: 800, color: 'var(--red)' }}>{o.realTotalAmount ? '¥' + o.realTotalAmount : ''}</div>
              </div>
              <div className="summary" style={{ margin: '10px 0' }}>
                {o.products.map((p: any) => `${p.productName}×${p.quantity}`).join('、')}
              </div>
              <div className="row">
                <span className="tag">{o.products.length} 件</span>
                <span className="spacer" />
                <button className="btn btn-primary btn-sm" onClick={() => importIt(o.orderId)}>保存为老样子</button>
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>
                历史商品编码仅作来源参考，实际下单前会重新核价与匹配。
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
