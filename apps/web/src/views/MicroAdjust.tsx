import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Loading, ErrorState, Empty, formatYuan } from '../components/Common';
import type { SavedMeal, TweakResult } from '../types';

/**
 * 今天微微调：有边界的微调。
 * - 默认最多改 1 处（可放宽到 3）；替换一个商品计 1 处；
 * - 锁定项不会被改动或移除；
 * - 冲突时不自动突破约束，只说明原因并给出“可放宽哪一项”；
 * - 结果只是草稿，点「另存一版」才生成新版本，绝不自动下单。
 */
export default function MicroAdjust({
  showToast,
  onNavigate,
}: {
  showToast: (m: string) => void;
  onNavigate: (v: 'my' | 'history' | 'footprint') => void;
}) {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [mealId, setMealId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [locks, setLocks] = useState<string[]>([]);
  const [maxChanges, setMaxChanges] = useState(1);
  const [limitBudget, setLimitBudget] = useState(false);
  const [addYuan, setAddYuan] = useState(3);

  const [result, setResult] = useState<TweakResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const meal = meals.find((m) => m.id === mealId) || null;

  const load = async () => {
    try {
      setLoading(true);
      setErr(null);
      const ms = await api.savedMeals();
      setMeals(ms);
      if (ms.length) setMealId(ms[0].id);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!mealId) return;
    setResult(null);
    setSelected(null);
    api.getLocks(mealId).then(setLocks).catch(() => setLocks([]));
  }, [mealId]);

  const generate = async (mc?: number, lb?: boolean, ay?: number) => {
    const useMax = mc ?? maxChanges;
    const useLimit = lb ?? limitBudget;
    const useAdd = ay ?? addYuan;
    if (!meal) return;
    if (!meal.storeCode) {
      showToast('这份餐单没有门店信息，请先在餐单里选择门店');
      return;
    }
    try {
      setGenerating(true);
      setErr(null);
      const r = await api.tweak({
        templateId: meal.id,
        storeCode: meal.storeCode,
        orderType: meal.orderType || 1,
        beType: meal.beType || 1,
        locks,
        maxChanges: useMax,
        addYuan: useLimit ? useAdd : undefined,
      });
      setResult(r);
      setSelected(r.plans[0]?.id ?? null);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setGenerating(false);
    }
  };

  const toggleLock = async (code: string) => {
    if (!meal) return;
    try {
      const next = locks.includes(code)
        ? await api.clearLock(meal.id, code)
        : await api.setLock(meal.id, code, '用户锁定');
      setLocks(next);
      setResult(null);
      setSelected(null);
    } catch (e: any) {
      showToast(e.message || String(e));
    }
  };

  const relax = async (kind: string) => {
    if (!meal) return;
    if (kind === 'changes') {
      const mc = maxChanges + 1;
      setMaxChanges(mc);
      await generate(mc);
    } else if (kind === 'budget') {
      setLimitBudget(false);
      await generate(maxChanges, false);
    } else if (kind === 'locked') {
      for (const c of locks) await api.clearLock(meal.id, c).catch(() => undefined);
      setLocks([]);
      await generate();
    }
  };

  const selectedPlan = result?.plans.find((p) => p.id === selected) || null;

  const saveVersion = async () => {
    if (!meal || !selectedPlan) return;
    try {
      setSaving(true);
      await api.createVersion(
        meal.id,
        {
          storeCode: meal.storeCode,
          storeName: meal.storeName,
          orderType: meal.orderType || 1,
          beType: meal.beType || 1,
          items: selectedPlan.items,
        },
        `微微调：${selectedPlan.changedSummary}`,
        null
      );
      showToast('已另存为新版本');
      onNavigate('my');
    } catch (e: any) {
      showToast(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (err) return <ErrorState desc={err} onRetry={load} />;
  if (meals.length === 0) {
    return (
      <Empty title="还没有保存的餐单" desc="先保存一份“老样子”，才能对它做微调。">
        <button className="btn btn-primary btn-sm" onClick={() => onNavigate('my')}>
          去我的老样子
        </button>
      </Empty>
    );
  }

  return (
    <div className="page page-narrow">
      <h2 className="section-title">今天微微调</h2>
      <p className="muted small" style={{ marginTop: -6, marginBottom: 16 }}>
        默认最多改 <b>1 处</b>（一次替换算 1 处）。锁定的商品不会被改动或移除；遇到冲突只会说明原因，不会偷偷突破你的限制。
      </p>

      <div className="panel">
        <div className="field">
          <label>选择一份老样子</label>
          <select className="select" value={mealId} onChange={(e) => setMealId(e.target.value)}>
            {meals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.storeName ? ` · ${m.storeName}` : ''}
              </option>
            ))}
          </select>
        </div>

        {meal && (
          <>
            <div className="field">
              <label>这一餐里，哪些不想动（点一下锁定）</label>
              <div className="stack">
                {meal.items.map((it) => {
                  const on = locks.includes(it.productCode);
                  return (
                    <div key={it.productCode} className="draft-item">
                      <span className="name">
                        {it.productName} ×{it.quantity}
                      </span>
                      <button
                        className={`chip-btn lock-chip ${on ? 'on' : ''}`}
                        onClick={() => toggleLock(it.productCode)}
                        aria-pressed={on}
                      >
                        {on ? '🔒 已锁定' : '未锁定'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="row" style={{ alignItems: 'flex-end', gap: 16 }}>
              <div className="field" style={{ marginBottom: 0, minWidth: 140 }}>
                <label>最多改几处</label>
                <select
                  className="select"
                  value={maxChanges}
                  onChange={(e) => {
                    setMaxChanges(Number(e.target.value));
                    setResult(null);
                  }}
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n} 处
                    </option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={limitBudget}
                    onChange={(e) => {
                      setLimitBudget(e.target.checked);
                      setResult(null);
                    }}
                  />{' '}
                  限制今天最多加
                </label>
                <select
                  className="select"
                  value={addYuan}
                  disabled={!limitBudget}
                  onChange={(e) => {
                    setAddYuan(Number(e.target.value));
                    setResult(null);
                  }}
                >
                  {[0, 3, 5, 8, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} 元
                    </option>
                  ))}
                </select>
              </div>

              <button className="btn btn-primary" onClick={() => generate()} disabled={generating}>
                {generating ? '生成中…' : '生成微调方案'}
              </button>
            </div>
          </>
        )}
      </div>

      {result && result.availability && !result.availability.allSellable && (
        <div className="banner warn" style={{ marginTop: 16 }}>
          这份餐单里有商品在当前门店不可售（历史编码可能已变更）。下方方案已避开不可售商品，但仍建议核价确认。
        </div>
      )}

      {result && result.conflicts.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2>这些想法被你的限制挡住了</h2>
          {result.conflicts.map((c, i) => (
            <div key={i} className="row" style={{ marginBottom: 8, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>
                <b>{c.message}</b>
                {c.relax && <div className="muted small">可以放宽：{c.relax}</div>}
              </span>
              {(c.kind === 'changes' || c.kind === 'budget' || c.kind === 'locked') && (
                <button className="btn btn-ghost btn-sm" onClick={() => relax(c.kind)}>
                  {c.kind === 'changes' ? `放宽到 ${maxChanges + 1} 处` : c.kind === 'budget' ? '取消预算限制' : '取消锁定'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {result && result.plans.length === 0 && result.conflicts.length === 0 && (
        <div className="banner info" style={{ marginTop: 16 }}>
          当前限制下没有可生成的微调方案。可以放宽“最多改几处”或取消部分锁定再试。
        </div>
      )}

      {result && result.plans.length > 0 && (
        <>
          <h2 className="section-title">给你 {result.plans.length} 个选择（原约 {formatYuan(result.originalTotal)}）</h2>
          <div className="stack">
            {result.plans.map((p) => (
              <div
                key={p.id}
                className={`card plan-card ${selected === p.id ? 'selected' : ''}`}
                onClick={() => setSelected(p.id)}
              >
                <div className="plan-head">
                  <span className="count-pill">本次改了 {p.changeCount} 处</span>
                  <span className="plan-total">{formatYuan(p.total)}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{p.changedSummary}</div>
                <div className="muted small" style={{ marginBottom: 6 }}>
                  保留：{p.keptSummary}
                </div>
                <div className="muted small">为什么：{p.reason}</div>
                <div className="row" style={{ marginTop: 10 }}>
                  {p.items.map((it) => (
                    <span key={it.productCode} className="tag">
                      {it.productName} ×{it.quantity}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bottom-bar">
            <button className="btn btn-ghost" onClick={() => onNavigate('my')}>
              取消
            </button>
            <button className="btn btn-primary btn-block" disabled={!selectedPlan || saving} onClick={saveVersion}>
              {saving ? '保存中…' : '另存一版'}
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            这只是草稿：保存后会在「我的老样子」里生成新版本，原版本完整保留。确认核价与下单仍在你点开餐单时手动进行。
          </p>
        </>
      )}
    </div>
  );
}
