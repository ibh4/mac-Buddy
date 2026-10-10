// 老样子轻一点：按营养目标做“有边界的替换”。
//
// 严格口径：
//  1. 保留锁定商品；默认最多替换一个商品槽位。
//  2. 只使用当前门店可售、且套餐规则允许的候选。
//  3. 同时尊重预算上限、数量与明确排除项。
//  4. 只对“营养数据可比较”的候选给出精确差值；数据缺失时不输出精确差值，只说明缺失项。
//  5. 每个目标最多给出 4 个方案（同类优先、跨类兜底）；不因单一指标下降就宣称“更健康”。
//  6. 无符合方案时给出原因与可放宽项，绝不自动更改锁定项。
//  7. 结果只是草稿：用户主动保存才创建餐单版本。
//  8. 所有差值由确定性代码计算。

import type { MealItem } from './types.js';
import type { CatalogItem } from './catalog.js';
import { classify, totalPrice } from './catalog.js';
import { validatePlan, type TweakOptions } from './constraints.js';
import type { DetailProvider } from './tweak.js';
import {
  computeMealNutrition,
  diffTotals,
  comparable,
  type MealNutrition,
  type NutrientTotals,
} from './nutrition.js';

export type LighterGoal = 'lessEnergy' | 'moreProtein' | 'lessSodium';

const TARGET_KEY: Record<LighterGoal, keyof NutrientTotals> = {
  lessEnergy: 'energyKcal',
  moreProtein: 'protein',
  lessSodium: 'sodium',
};

export const GOAL_LABEL: Record<LighterGoal, string> = {
  lessEnergy: '能量少一点',
  moreProtein: '蛋白多一点',
  lessSodium: '钠少一点',
};

export interface LighterPlan {
  id: string;
  goal: LighterGoal;
  from: { productCode: string; productName: string };
  to: { productCode: string; productName: string };
  /** 替换发生的位置：餐单层商品，或套餐内的组成项（展示时要说清楚） */
  scope: 'top' | 'combo';
  /** 是否为“同类替换”；跨类替换用于同类无可改善项时的兜底，界面会标注 */
  sameCat: boolean;
  /** 目标指标的差值；不可比较时为 undefined（不编造） */
  targetDelta?: number;
  targetComparable: boolean;
  /** 其他指标变化（可展开查看） */
  otherDeltas: Partial<Record<keyof NutrientTotals, number | undefined>>;
  priceDelta: number;
  newTotal: number;
  items: MealItem[];
  changeCount: number;
  note?: string;
}

export interface LighterResult {
  goal: LighterGoal;
  targetKey: keyof NutrientTotals;
  plans: LighterPlan[];
  /** 没有方案时的原因（说清楚，不静默） */
  reasons: string[];
  /** 可放宽的条件（交给用户选择，不自动放宽） */
  relaxable: string[];
  baseline: MealNutrition;
  baselineTotal: number;
  /** 基线在该指标上是否有数据 */
  baselineHasTarget: boolean;
}

function cloneItems(items: MealItem[]): MealItem[] {
  return items.map((i) => ({
    ...i,
    comboItemList: i.comboItemList?.map((c) => ({ ...c })),
    modification: i.modification ? { values: i.modification.values.map((v) => ({ ...v })) } : undefined,
    source: i.source ? { ...i.source } : undefined,
  }));
}

export interface LighterInput {
  items: MealItem[];
  catalog: CatalogItem[];
  goal: LighterGoal;
  /** 营养名称索引（来自 nutrition.buildIndex） */
  nutritionIndex: Map<string, any>;
  options: TweakOptions;
  detail?: DetailProvider;
  sellableSet?: Set<string>;
  excludeCodes?: string[];
  /** 该餐营养是否含演示数据 */
  demo?: boolean;
  maxPlans?: number;
}

/** 生成“轻一点”方案：确定性地枚举候选、比较营养、取前 N 个。 */
export function generateLighterPlans(input: LighterInput): LighterResult {
  const { items, catalog, goal, nutritionIndex, options, detail, sellableSet, excludeCodes = [] } = input;
  // 与文件头注释、generators.ts 的默认值保持一致：每个目标最多 4 个方案
  const maxPlans = input.maxPlans ?? 4;
  const targetKey = TARGET_KEY[goal];
  const wantLower = goal !== 'moreProtein';

  const baseline = computeMealNutrition(items, nutritionIndex as any, { demo: input.demo });
  const baselineTotal = totalPrice(items, catalog);
  const baselineHasTarget = baseline.totals[targetKey] != null;

  const reasons: string[] = [];
  const relaxable: string[] = [];
  if (!baselineHasTarget) {
    reasons.push(`当前餐单缺少「${GOAL_LABEL[goal]}」所需的营养数据，无法给出可比较的差值。`);
  }

  const exclude = new Set(excludeCodes);
  const locks = new Set(options.locks || []);
  const candidates: LighterPlan[] = [];
  const seen = new Set<string>();

  const consider = (
    next: MealItem[],
    fromCode: string,
    fromName: string,
    toCode: string,
    toName: string,
    scope: 'top' | 'combo',
    sameCat: boolean
  ) => {
    const sig = next.map((i) => `${i.productCode}:${i.quantity}`).join('|');
    if (seen.has(sig)) return;
    const res = validatePlan(items, next, { ...options, maxChanges: options.maxChanges ?? 1 }, catalog, sellableSet);
    if (!res.ok) {
      for (const iss of res.issues) {
        if (iss.relax && !relaxable.includes(iss.relax)) relaxable.push(iss.relax);
      }
      return;
    }
    const nut = computeMealNutrition(next, nutritionIndex as any, { demo: input.demo });
    if (!comparable(baseline.totals, nut.totals, targetKey)) return; // 不可比较则不输出精确差值
    const deltas = diffTotals(baseline.totals, nut.totals);
    const d = deltas[targetKey];
    if (d == null || d === 0) return;
    if (wantLower ? d >= 0 : d <= 0) return;
    seen.add(sig);
    const newTotal = totalPrice(next, catalog);
    candidates.push({
      id: `${goal}:${sig}`,
      goal,
      from: { productCode: fromCode, productName: fromName },
      to: { productCode: toCode, productName: toName },
      scope,
      sameCat,
      targetDelta: d,
      targetComparable: true,
      otherDeltas: deltas,
      priceDelta: Math.round((newTotal - baselineTotal) * 100) / 100,
      newTotal,
      items: next,
      changeCount: 1,
      note: nut.partial ? `营养为已知部分合计（${nut.coverage.matched}/${nut.coverage.total} 项已匹配）` : undefined,
    });
  };

  // 候选池：同类优先；同类无可改善项时，退化为“跨类兜底”（只保留确实改善目标的候选，绝不强行跨类）。
  const poolFor = (code: string, name: string, sameCatOnly: boolean) => {
    const cls = classify(catalog.find((c) => c.productCode === code) || ({ productName: name } as CatalogItem));
    return catalog.filter(
      (c) =>
        c.productCode !== code &&
        (sameCatOnly ? classify(c) === cls : classify(c) !== cls) &&
        !locks.has(c.productCode) &&
        !exclude.has(c.productCode) &&
        (!sellableSet || sellableSet.has(c.productCode))
    );
  };

  // 1) 顶层商品替换
  for (const slot of items) {
    if (locks.has(slot.productCode)) continue;
    // 先同类
    for (const cand of poolFor(slot.productCode, slot.productName, true)) {
      const next = cloneItems(items).map((i) =>
        i.productCode === slot.productCode ? { ...i, productCode: cand.productCode, productName: cand.productName } : i
      );
      consider(next, slot.productCode, slot.productName, cand.productCode, cand.productName, 'top', true);
    }
    // 同类无改善项时，跨类兜底（让“没有符合条件的”变成“给几个配套方案”）
    const improved = candidates.some((p) => p.from.productCode === slot.productCode);
    if (!improved) {
      for (const cand of poolFor(slot.productCode, slot.productName, false)) {
        const next = cloneItems(items).map((i) =>
          i.productCode === slot.productCode ? { ...i, productCode: cand.productCode, productName: cand.productName } : i
        );
        consider(next, slot.productCode, slot.productName, cand.productCode, cand.productName, 'top', false);
      }
    }
  }

  // 2) 套餐内组成项替换（需套餐规则允许）
  if (detail?.comboSides) {
    for (const combo of items) {
      if (!combo.comboItemList || combo.comboItemList.length === 0) continue;
      const sides = [
        ...(detail.comboSides(combo.productCode, 'drink') || []),
        ...(detail.comboSides(combo.productCode, 'snack') || []),
      ];
      for (const sideCode of sides) {
        if (locks.has(sideCode)) continue;
        const side = combo.comboItemList.find((c) => c.productCode === sideCode);
        if (!side) continue;
        for (const sameCatOnly of [true, false]) {
          const pool = poolFor(sideCode, side.name, sameCatOnly);
          for (const cand of pool) {
            const next = cloneItems(items).map((i) => {
              if (i.productCode === combo.productCode && i.comboItemList) {
                return {
                  ...i,
                  comboItemList: i.comboItemList.map((c) =>
                    c.productCode === sideCode ? { ...c, productCode: cand.productCode, name: cand.productName } : c
                  ),
                };
              }
              return i;
            });
            consider(next, sideCode, side.name, cand.productCode, cand.productName, 'combo', sameCatOnly);
          }
          // 同类已产生改善项则不再跨类兜底
          if (candidates.some((p) => p.from.productCode === sideCode)) break;
        }
      }
    }
  }

  // 排序：同类优先，其次按目标指标改善幅度，再次更便宜；顶层替换优先于套餐内替换。
  candidates.sort((a, b) => {
    if (a.sameCat !== b.sameCat) return a.sameCat ? -1 : 1;
    const av = Math.abs(a.targetDelta ?? 0);
    const bv = Math.abs(b.targetDelta ?? 0);
    return bv - av || (a.priceDelta ?? 0) - (b.priceDelta ?? 0) || (a.scope === 'top' ? -1 : 1);
  });

  // 同一组“原商品→新商品”只保留最优方案（同类优先于跨类、顶层优先于套餐内）。
  const byTarget = new Map<string, LighterPlan>();
  for (const p of candidates) {
    const k = `${p.from.productCode}->${p.to.productCode}`;
    if (!byTarget.has(k)) byTarget.set(k, p);
  }
  const plans = Array.from(byTarget.values()).slice(0, maxPlans);

  if (plans.length === 0) {
    if (baselineHasTarget) {
      reasons.push('在当前限制下，同类与跨类都没找到既能改善该指标、又符合锁定/预算/可售与套餐规则的替换方案。');
    }
    if (locks.size > 0) relaxable.push('取消部分商品的锁定');
    if (options.budgetCap != null) relaxable.push('放宽预算上限');
    if (exclude.size > 0) relaxable.push('减少“不要出现”的商品');
  }

  return {
    goal,
    targetKey,
    plans,
    reasons,
    relaxable: Array.from(new Set(relaxable)),
    baseline,
    baselineTotal,
    baselineHasTarget,
  };
}
