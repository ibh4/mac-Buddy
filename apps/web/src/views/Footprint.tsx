import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Loading, ErrorState, formatYuan } from '../components/Common';
import { FootprintIcon } from '../components/EntryIcons';
import type { FootprintOverview, SyncedOrder } from '../types';

const OWNER_LABEL: Record<string, string> = {
  self: '自己吃的',
  shared: '多人一起',
  proxy: '帮别人买的',
  unknown: '未标注',
};

const RANGES: { key: number | 'all'; label: string }[] = [
  { key: 7, label: '近 7 天' },
  { key: 30, label: '近 30 天' },
  { key: 90, label: '近 90 天' },
  { key: 'all', label: '全部' },
];

/**
 * 我的饮食足迹。
 * 口径要点（界面上也必须说明）：
 *  - 消费统计只来自「已完成」的真实订单；取消 / 未支付 / 退款 / 异常不计入；
 *  - 模板（老样子）、草稿、演示数据都不算消费次数；
 *  - 口味画像区分「显式（你主动收藏/反馈）」与「推断（自己吃的订单频次）」；
 *  - 绝不由菜名臆测配料或口味。
 */
export default function Footprint({ showToast }: { showToast: (m: string) => void }) {
  const [range, setRange] = useState<number | 'all'>(30);
  const [data, setData] = useState<FootprintOverview | null>(null);
  const [orders, setOrders] = useState<SyncedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);
      const [o, os] = await Promise.all([api.footprintOverview(range), api.footprintOrders().catch(() => [])]);
      setData(o);
      setOrders(os);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const sync = async () => {
    try {
      setSyncing(true);
      const r = await api.footprintSync();
      showToast(r.demo ? `已同步 ${r.synced} 条演示订单（演示数据）` : `已同步 ${r.synced} 条真实订单`);
      await load();
    } catch (e: any) {
      showToast(e.message || String(e));
    } finally {
      setSyncing(false);
    }
  };

  const setOwner = async (orderId: string, ownerType: 'self' | 'shared' | 'proxy' | 'unknown') => {
    try {
      await api.setOrderOwner(orderId, ownerType);
      setOrders((prev) => prev.map((o) => (o.orderId === orderId ? { ...o, ownerType } : o)));
      await load();
    } catch (e: any) {
      showToast(e.message || String(e));
    }
  };

  const feedback = async (code: string, verdict: 'like' | 'neutral' | 'nope' | 'forOthers') => {
    try {
      await api.addFeedback(code, verdict);
      showToast(verdict === 'nope' ? '已记为“不再推荐”（软偏好）' : '已记录反馈');
      await load();
    } catch (e: any) {
      showToast(e.message || String(e));
    }
  };

  if (loading && !data) return <Loading />;
  if (err) return <ErrorState desc={err} onRetry={load} />;
  if (!data) return null;

  const a = data.analytics;
  const u = data.usage;
  const p = data.profile;
  const maxHour = Math.max(1, ...a.byHour.map((h) => h.count));

  return (
    <div className="page">
      <div className="row" style={{ gap: 12, marginBottom: 6 }}>
        <FootprintIcon size={34} />
        <div>
          <h2 style={{ margin: 0 }}>我的饮食足迹</h2>
          <p className="muted small" style={{ margin: 2 }}>
            用了多少老样子、点了多少次、以及一个能自己改正的口味画像。
          </p>
        </div>
      </div>

      {/* 数据范围与同步状态 */}
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <b>数据范围与同步状态</b>
            <div className="muted small" style={{ marginTop: 4, lineHeight: 1.7 }}>
              当前模式：{data.demo ? '演示（数据为虚构）' : '真实（连接你的麦当劳账户）'}
              <br />
              已同步订单：{data.sync.orderCount} 条
              {data.sync.lastSyncAt ? ` · 最近同步 ${data.sync.lastSyncAt.slice(0, 19).replace('T', ' ')}` : ' · 尚未同步'}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={sync} disabled={syncing}>
            {syncing ? '同步中…' : '同步历史订单'}
          </button>
        </div>
        {data.hasDemoData && (
          <div className="banner warn" style={{ marginTop: 12, marginBottom: 0 }}>
            当前包含<b>演示数据</b>。演示数据只用于功能展示，不代表你的真实消费，也不会与真实订单混在一起作为“真实消费次数”。
          </div>
        )}
      </div>

      {/* 老样子使用统计 */}
      <h2 className="section-title">老样子使用统计</h2>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="k">保存的餐单</div>
          <div className="v">{u.templateCount}</div>
          <div className="h">共 {u.totalVersions} 个版本（每次改动都是新版本）</div>
        </div>
        <div className="stat-card">
          <div className="k">用得最多的一份</div>
          <div className="v" style={{ fontSize: 18 }}>{u.mostReusedTemplate?.name || '—'}</div>
          <div className="h">确认下单 {u.mostReusedTemplate?.reuseCount ?? 0} 次</div>
        </div>
        <div className="stat-card">
          <div className="k">最常保留的主食</div>
          <div className="v" style={{ fontSize: 18 }}>{u.mostKeptMain?.name || '—'}</div>
          <div className="h">出现在 {u.mostKeptMain?.count ?? 0} 份餐单的最新版</div>
        </div>
        <div className="stat-card">
          <div className="k">最常被改的槽位</div>
          <div className="v" style={{ fontSize: 18 }}>{u.mostReplacedSlot?.category || '—'}</div>
          <div className="h">共 {u.mostReplacedSlot?.count ?? 0} 次改动</div>
        </div>
        <div className="stat-card">
          <div className="k">最常见的替换</div>
          <div className="v" style={{ fontSize: 16 }}>
            {u.mostCommonReplacement ? `${u.mostCommonReplacement.from} → ${u.mostCommonReplacement.to}` : '—'}
          </div>
          <div className="h">{u.mostCommonReplacement?.count ?? 0} 次</div>
        </div>
        <div className="stat-card">
          <div className="k">照旧 vs 微调</div>
          <div className="v" style={{ fontSize: 18 }}>
            {u.ratio.originalReuse} : {u.ratio.tweakedReuse}
          </div>
          <div className="h">原版复用 : 微调后下单</div>
        </div>
      </div>
      <div className="caliber" style={{ marginTop: 12 }}>
        <b>统计口径：</b>“复用次数”只统计<b>状态为已确认的下单尝试</b>；模板里的草稿、未下单的版本不计入。
        原版复用＝用的就是该餐单的第一个版本，微调复用＝用的是后续版本。
      </div>

      {/* 历史点餐分析 */}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 26 }}>
        <h2 className="section-title" style={{ margin: 0 }}>历史点餐分析</h2>
        <div className="quick-row">
          {RANGES.map((r) => (
            <button
              key={String(r.key)}
              className={`chip-btn ${range === r.key ? 'lock-chip on' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stat-grid" style={{ marginTop: 12 }}>
        <div className="stat-card">
          <div className="k">{a.rangeLabel}有效订单</div>
          <div className="v">{a.orderCount}</div>
          <div className="h">已排除 {a.excludedCount} 条（取消/未支付/异常等）</div>
        </div>
        <div className="stat-card">
          <div className="k">累计金额</div>
          <div className="v">{formatYuan(a.totalAmount)}</div>
          <div className="h">平均每单 {formatYuan(a.avgPerOrder)}</div>
        </div>
        <div className="stat-card">
          <div className="k">到店 / 外送</div>
          <div className="v" style={{ fontSize: 20 }}>{a.dineInCount} : {a.deliveryCount}</div>
          <div className="h">无法判断 {a.otherCount} 单</div>
        </div>
        <div className="stat-card">
          <div className="k">时间覆盖</div>
          <div className="v" style={{ fontSize: 16 }}>
            {a.coverageStart ? a.coverageStart.slice(0, 10) : '—'}
          </div>
          <div className="h">至 {a.coverageEnd ? a.coverageEnd.slice(0, 10) : '—'}</div>
        </div>
      </div>

      {a.samplesLow && (
        <div className="banner info" style={{ marginTop: 12 }}>
          样本较少（{a.orderCount} 条），下面的分布只作参考，不必当结论看。
        </div>
      )}

      <div className="panel" style={{ marginTop: 14 }}>
        <h2>一天里什么时候点（北京时间）</h2>
        <div className="bars">
          {a.byHour.map((h) => (
            <div key={h.hour} className={`bar ${h.count === 0 ? 'zero' : ''}`} style={{ height: `${(h.count / maxHour) * 100}%` }} title={`${h.hour}:00 · ${h.count} 单`} />
          ))}
        </div>
        <div className="bar-labels">
          {a.byHour.map((h) => (
            <span key={h.hour}>{h.hour % 6 === 0 ? h.hour : ''}</span>
          ))}
        </div>
      </div>

      <div className="detail-layout" style={{ marginTop: 14 }}>
        <div className="panel">
          <h2>点得最多的餐品</h2>
          {a.topProducts.length === 0 && <p className="muted small">这个时间范围内还没有数据。</p>}
          <div className="stack">
            {a.topProducts.map((t) => (
              <div key={t.code} className="row" style={{ justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <b>{t.name}</b>
                  <div className="muted small">
                    出现在 {t.orderCount} 单 · 共买 {t.buyCount} 份
                  </div>
                </div>
                <div className="quick-row" style={{ marginTop: 0 }}>
                  <button className="chip-btn" onClick={() => feedback(t.code, 'like')} title="明确喜欢">喜欢</button>
                  <button className="chip-btn" onClick={() => feedback(t.code, 'forOthers')} title="不是我自己吃的">给别人点的</button>
                  <button className="chip-btn" onClick={() => feedback(t.code, 'nope')} title="软偏好：尽量不推荐">不再推荐</button>
                </div>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            “不再推荐”是<b>软偏好</b>（尽量不推，但仍可手动选）；硬排除请在口味画像里设置。
          </p>
        </div>

        <div className="panel">
          <h2>品类分布</h2>
          {a.categoryDist.length === 0 && <p className="muted small">暂无数据。</p>}
          {a.categoryDist.map((c) => (
            <div key={c.category} className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span>{c.category}</span>
              <span className="tag">{c.count}</span>
            </div>
          ))}
          <div className="caliber" style={{ marginTop: 12 }}>
            品类由<b>商品名称关键词</b>粗略归类（主食/饮料/小食/甜品/未知），只用于统计展示；
            套餐内的子项单独分层，不重复计入主项。
          </div>
        </div>
      </div>

      {/* 口味偏好画像 */}
      <h2 className="section-title">口味偏好画像</h2>
      <p className="muted small" style={{ marginTop: -6, marginBottom: 12 }}>
        每一条结论都标明<b>来源</b>、<b>依据条数</b>与<b>推断/显式</b>，你可以随时改正。
        这里<b>不会</b>根据菜名臆测配料或口味。
      </p>

      <div className="stack">
        {p.conclusions.length === 0 && (
          <div className="card">
            <p className="muted small">还没有足够的线索。同步订单、标注“自己吃”，或直接给几个反馈，画像就会长出来。</p>
          </div>
        )}
        {p.conclusions.map((c, i) => (
          <div key={i} className={`concl ${c.basis === 'inferred' ? 'inferred' : ''}`}>
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <b style={{ flex: 1 }}>{c.statement}</b>
              <span className={`basis-tag ${c.basis === 'inferred' ? 'inferred' : ''}`}>
                {c.basis === 'explicit' ? '你明确说过' : '从订单推断'}
              </span>
            </div>
            <div className="muted small" style={{ marginTop: 6, lineHeight: 1.7 }}>
              来源：{c.source} · 依据 {c.supportCount} 条
              {c.coverage ? ` · 覆盖 ${c.coverage}` : ''}
              <br />
              可改正：{c.correctionHint}
            </div>
          </div>
        ))}
      </div>

      <div className="detail-layout" style={{ marginTop: 14 }}>
        <div className="panel">
          <h2>明确偏好（你主动设置）</h2>
          <div className="small" style={{ marginBottom: 8 }}>
            收藏 {p.explicit.favorites.length} 项 · 不再推荐 {p.explicit.exclusions.length} 项 ·
            给别人点的 {p.explicit.forOthers.length} 项
          </div>
          <div className="quick-row">
            {p.explicit.favorites.map((f) => (
              <span key={f} className="tag">收藏 {f}</span>
            ))}
            {p.explicit.exclusions.map((f) => (
              <span key={f} className="tag pink">不再推荐 {f}</span>
            ))}
            {p.explicit.forOthers.length > 0 &&
              p.explicit.forOthers.map((f) => (
                <span key={f} className="tag ghost">给别人买的 {f}</span>
              ))}
            {p.explicit.favorites.length === 0 && p.explicit.exclusions.length === 0 && (
              <span className="muted small">还没有明确偏好。可以在上方餐品列表点“喜欢 / 不再推荐”。</span>
            )}
          </div>
          <div className="caliber" style={{ marginTop: 12 }}>
            口味标签只来自<b>官方返回或你的主动标注</b>；本产品不会从菜名推断“辣/甜/咸”等口味。
          </div>
        </div>

        <div className="panel">
          <h2>行为线索（来自你标注“自己吃”的订单）</h2>
          <div className="small" style={{ marginBottom: 8 }}>
            自己吃的订单 {p.behavioral.selfOrderCount} 笔
            {p.behavioral.samplesLow ? '（样本较少，仅作参考）' : ''}
          </div>
          {p.behavioral.productPrefs.map((x) => (
            <div key={x.code} className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span>{x.name}</span>
              <span className="muted small">{x.orderCount} 单 / {x.quantity} 份</span>
            </div>
          ))}
          {p.behavioral.productPrefs.length === 0 && (
            <span className="muted small">还没有标注“自己吃”的订单，因此不做口味推断。</span>
          )}
          <div className="caliber" style={{ marginTop: 12 }}>
            频次高<b>不等于</b>喜欢：这里只是“你点过的次数”。要表达真实喜好，请用上方的“喜欢 / 不再推荐”。
          </div>
        </div>
      </div>

      {/* 订单归属 */}
      <h2 className="section-title">订单归属标注</h2>
      <p className="muted small" style={{ marginTop: -6, marginBottom: 12 }}>
        多人一起或帮别人买的订单，默认<b>不计入</b>你的个人口味。标注后，画像只采用“自己吃的”订单。
      </p>
      <div className="panel">
        {orders.length === 0 && <p className="muted small">还没有同步订单。点上方「同步历史订单」。</p>}
        {orders.slice(0, 30).map((o) => (
          <div key={o.orderId} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
            <div style={{ minWidth: 0 }}>
              <b>{o.storeName || o.storeCode || '未知门店'}</b>
              <div className="muted small">
                {o.createTime || '时间未知'} · {o.orderStatus || '状态未知'} ·{' '}
                {o.realTotalAmount ? `¥${Number(o.realTotalAmount).toFixed(2)}` : '金额未知'}
                {o.isDemo ? ' · 演示数据' : ''}
              </div>
            </div>
            <select
              className="select"
              style={{ width: 130 }}
              value={o.ownerType}
              onChange={(e) => setOwner(o.orderId, e.target.value as any)}
            >
              {(Object.keys(OWNER_LABEL) as Array<keyof typeof OWNER_LABEL>).map((k) => (
                <option key={k} value={k}>{OWNER_LABEL[k]}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="caliber" style={{ marginTop: 16 }}>
        <b>消费次数的完整口径：</b>只统计状态为“已完成/已支付”的订单；
        <b>取消、未支付、退款、异常、已关闭</b>一律排除（上方“已排除 N 条”即为这些）。
        按订单号去重，同一订单不会被重复计数。
        <b>模板、草稿、演示数据都不算消费次数</b>；演示数据会单独标注。
      </div>
    </div>
  );
}
