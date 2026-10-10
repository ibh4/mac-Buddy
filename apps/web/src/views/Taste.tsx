import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Loading, ErrorState, Empty } from '../components/Common';
import type { FootprintOverview } from '../types';

// 我的口味：默认只给“看得懂的结论”，图表与统计口径收进展开区。
//  - 常点餐品 / 已确认偏好 / 简统计，三块直接呈现；
//  - 图表与口径说明放在“展开查看统计”里，避免一进来就是密集仪表盘；
//  - 所有结论都带来源（你说过的 / 从订单推断）与覆盖口径，样本少就明说样本少；
//  - 不把推断写成事实，也不按疾病/人群给饮食建议。

export default function Taste({ showToast }: { showToast: (m: string) => void }) {
  const [data, setData] = useState<FootprintOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setErr(null);
      setData(await api.footprintOverview('all'));
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sync = async () => {
    try {
      const r = await api.footprintSync();
      showToast(`已同步 ${r.synced} 条${r.demo ? '（演示数据）' : ''}`);
      await load();
    } catch (e: any) {
      showToast(e.message || '同步失败');
    }
  };

  if (loading) return <Loading text="正在整理你的口味…" />;
  if (err) return <ErrorState desc={err} onRetry={load} />;
  if (!data) return <Empty title="还没有可分析的数据" desc="同步历史订单后，这里会给出你的口味结论。" />;

  const p = data.profile;
  const a = data.analytics;

  return (
    <div className="page">
      <div className="page-head">
        <h1>我的口味</h1>
        <button className="btn btn-ghost btn-sm" onClick={sync}>
          同步订单
        </button>
      </div>

      {data.hasDemoData && (
        <p className="caliber">当前包含演示数据，结论仅作界面演示，不代表你的真实口味。</p>
      )}

      <div className="grid">
        <div className="card">
          <h3>常点餐品</h3>
          {a.topProducts.length === 0 ? (
            <p className="muted small">还没有足够的订单数据。</p>
          ) : (
            <ul className="plain-list">
              {a.topProducts.slice(0, 6).map((t) => (
                <li key={t.code}>
                  <b>{t.name}</b>
                  <span className="muted small"> · {t.orderCount} 次 / 共 {t.buyCount} 件</span>
                </li>
              ))}
            </ul>
          )}
          {a.samplesLow && <p className="caliber small">样本较少，结论供参考。</p>}
        </div>

        <div className="card">
          <h3>已确认的偏好</h3>
          {p.explicit.favorites.length === 0 && p.explicit.exclusions.length === 0 ? (
            <p className="muted small">还没有你明确确认过的偏好。</p>
          ) : (
            <>
              {p.explicit.favorites.length > 0 && (
                <p className="small">
                  <b>喜欢：</b>
                  {p.explicit.favorites.join('、')}
                </p>
              )}
              {p.explicit.exclusions.length > 0 && (
                <p className="small">
                  <b>不要：</b>
                  {p.explicit.exclusions.join('、')}
                </p>
              )}
              {p.explicit.forOthers.length > 0 && (
                <p className="muted small">其中有给别人点的：{p.explicit.forOthers.join('、')}</p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>口味结论</h3>
        {p.conclusions.length === 0 ? (
          <p className="muted small">暂时还得不出结论。</p>
        ) : (
          <ul className="concl-list">
            {p.conclusions.map((c, i) => (
              <li key={i}>
                <b>{c.statement}</b>
                <span className="muted small">
                  {' '}
                  来源：{c.source === 'explicit' ? '你确认过' : '订单推断'}
                  {c.coverage ? ` · 覆盖 ${c.coverage}` : ''} · 支撑 {c.supportCount} 条
                </span>
                <p className="caliber small">{c.correctionHint}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="card stat">
          <span className="muted small">订单数</span>
          <b>{a.orderCount}</b>
        </div>
        <div className="card stat">
          <span className="muted small">到店 / 外送</span>
          <b>
            {a.dineInCount} / {a.deliveryCount}
          </b>
        </div>
        <div className="card stat">
          <span className="muted small">平均单次</span>
          <b>¥{a.avgPerOrder.toFixed(2)}</b>
        </div>
      </div>

      <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '收起统计' : '展开查看统计'}
      </button>

      {open && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>统计与口径</h3>
          <div className="bars">
            {a.categoryDist.map((c) => {
              const max = Math.max(1, ...a.categoryDist.map((x) => x.count));
              return (
                <div key={c.category} className="bar-row">
                  <span className="bar-label">{c.category}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(c.count / max) * 100}%` }} />
                  </span>
                  <span className="bar-value">{c.count}</span>
                </div>
              );
            })}
          </div>
          <p className="caliber small">
            统计口径：只统计已完成的订单；给别人代点的可单独标注归属，避免把代点算成你的口味；
            样本少于阈值时统一标注“样本较少”，不把推断写成事实。
          </p>
          <p className="caliber small">
            最近同步：{data.sync.lastSyncAt || '尚未同步'} · 共 {data.sync.orderCount} 条
          </p>
        </div>
      )}
    </div>
  );
}
