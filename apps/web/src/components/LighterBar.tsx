import React, { useState } from 'react';
import { api } from '../api';
import type { LighterGoal, LighterPlan, LighterResult, MealItem } from '../types';

// 老样子轻一点：三个目标按钮，每个目标最多给出 4 个方案（同类优先、跨类兜底标注）。
//  - 应用方案只改当前草稿，保存才生成新版本（由调用方处理）；
//  - 数据不可比较时不给精确差值，只说明缺失；
//  - 不因单一指标下降就宣称“更健康”；
//  - 没有方案时说明原因与可放宽项，绝不自动取消锁定。

const GOALS: { key: LighterGoal; label: string }[] = [
  { key: 'lessEnergy', label: '能量少一点' },
  { key: 'moreProtein', label: '蛋白多一点' },
  { key: 'lessSodium', label: '钠少一点' },
];

const TARGET_UNIT: Record<string, string> = {
  energyKcal: 'kcal',
  protein: 'g',
  sodium: 'mg',
};

function deltaText(v: number | undefined, unit: string): string {
  if (v == null) return '暂无可比数据';
  const sign = v > 0 ? '+' : '';
  return `${sign}${Math.round(v * 10) / 10} ${unit}`;
}

export default function LighterBar({
  items,
  storeCode,
  orderType,
  beType,
  locks,
  budgetCap,
  onApply,
  showToast,
}: {
  items: MealItem[];
  storeCode: string;
  orderType: number;
  beType: number;
  locks: string[];
  budgetCap?: number;
  onApply: (items: MealItem[], summary: string) => void;
  showToast: (m: string) => void;
}) {
  const [goal, setGoal] = useState<LighterGoal | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LighterResult | null>(null);

  const run = async (g: LighterGoal) => {
    setGoal(g);
    setLoading(true);
    setResult(null);
    try {
      const r = await api.lighter({ items, goal: g, storeCode, orderType, beType, locks, budgetCap });
      setResult(r);
    } catch (e: any) {
      showToast(e?.message || '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const apply = (p: LighterPlan) => {
    const unit = TARGET_UNIT[result?.targetKey || 'energyKcal'] || '';
    const dt = deltaText(p.targetDelta, unit);
    onApply(p.items, `把「${p.from.productName}」换成「${p.to.productName}」（${result?.goalLabel}：${dt}）`);
    showToast('已应用到这一餐（还没保存，保存后才会生成新版本）');
  };

  return (
    <div className="card lighter">
      <div className="lighter-goals">
        {GOALS.map((g) => (
          <button
            key={g.key}
            className={`btn btn-sm ${goal === g.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => run(g.key)}
            disabled={loading}
          >
            {g.label}
          </button>
        ))}
      </div>

      {loading && <p className="muted small">正在按当前门店可售与套餐规则计算…</p>}

      {result && !loading && (
        <div className="lighter-result">
          <p className="small">
            基线：{result.baselineTotal != null ? `¥${result.baselineTotal.toFixed(2)}` : '—'}
            {result.baseline.totals[result.targetKey] != null && (
              <>
                {' · '}
                {result.targetKey === 'energyKcal' ? '能量' : result.targetKey === 'protein' ? '蛋白质' : '钠'}
                {` ${Math.round((result.baseline.totals[result.targetKey] as number) * 10) / 10} ${TARGET_UNIT[result.targetKey]}`}
              </>
            )}
          </p>

          {result.plans.length === 0 ? (
            <div className="noplan">
              <p className="small">没有符合条件的替换方案。</p>
              {result.reasons.map((r, i) => (
                <p key={i} className="caliber small">{r}</p>
              ))}
              {result.relaxable.length > 0 && (
                <p className="caliber small">可放宽（由你自己决定，不会自动放宽）：{result.relaxable.join('；')}</p>
              )}
            </div>
          ) : (
            result.plans.map((p) => (
              <div key={p.id} className="plan-card">
                <div className="plan-head">
                  <b>{p.to.productName}</b>
                  <span className="muted small">
                    替换{p.scope === 'combo' ? '套餐里的' : ''}「{p.from.productName}」
                  </span>
                  {!p.sameCat && <span className="badge-cross" title="同类没有可改善项，这是跨类兜底方案">跨类配套</span>}
                </div>
                <div className="plan-delta">
                  <span className={`chip ${(p.targetDelta ?? 0) < 0 && result.goal !== 'moreProtein' ? 'good' : ''}`}>
                    {result.goalLabel} {deltaText(p.targetDelta, TARGET_UNIT[result.targetKey] || '')}
                  </span>
                  <span className="chip">
                    价格 {p.priceDelta >= 0 ? '+' : ''}
                    {p.priceDelta.toFixed(2)} 元
                  </span>
                </div>
                {p.note && <p className="caliber small">{p.note}</p>}
                <details className="plan-more">
                  <summary className="small">其他营养变化</summary>
                  <div className="nut-grid">
                    {(['energyKcal', 'protein', 'fat', 'carbohydrate', 'sodium'] as const).map((k) => (
                      <div key={k} className="nut">
                        <span className="nut-k">
                          {k === 'energyKcal' ? '能量' : k === 'protein' ? '蛋白质' : k === 'fat' ? '脂肪' : k === 'carbohydrate' ? '碳水' : '钠'}
                        </span>
                        <span className={`nut-v ${p.otherDeltas[k] == null ? 'na' : ''}`}>
                          {deltaText(p.otherDeltas[k], TARGET_UNIT[k] || 'g')}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
                <button className="btn btn-primary btn-sm" onClick={() => apply(p)}>
                  用这个
                </button>
              </div>
            ))
          )}
          <p className="caliber small">营养差值由确定性计算得出；这里不判断“更健康”，只说清楚变化。</p>
        </div>
      )}
    </div>
  );
}
