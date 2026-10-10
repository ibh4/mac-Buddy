// 有边界的“微微调”方案生成。
// 设计：每个方案最多改动一个商品槽位（可被 maxChanges 放宽）；锁定项不可动；
// 套餐内替换通过 detailProvider（真实模式接 query-meal-detail）校验。
// 纯函数 + 注入目录/可售集合/详情供应器，便于测试，不主动调用 MCP。

import type { MealItem } from './types.js';
import type { CatalogItem } from './catalog.js';
import { classify, priceOf, totalPrice } from './catalog.js';
import { validatePlan, countChanges, type TweakOptions, type ConstraintIssue } from './constraints.js';

export interface TweakPlan {
  id: string;
  opName: string;
  items: MealItem[];
  keptSummary: string;
  changedSummary: string;
  reason: string;
  /** 该方案相对原方案改动的槽位数（替换计 1） */
  changeCount: number;
  total: number;
}

export interface TweakResult {
  plans: TweakPlan[];
  /** 生成过程中遇到且无法绕过的约束冲突（用于提示用户放宽哪一项） */
  conflicts: ConstraintIssue[];
  originalTotal: number;
}

export interface DetailProvider {
  /** 返回套餐允许替换的侧项编码集合（如饮料/小食），真实模式可来自 query-meal-detail */
  comboSides?: (comboCode: string, slot: 'drink' | 'snack') => string[];
}

function cloneItems(items: MealItem[]): MealItem[] {
  return items.map((i) => ({
    ...i,
    comboItemList: i.comboItemList?.map((c) => ({ ...c })),
    modification: i.modification ? { values: i.modification.values.map((v) => ({ ...v })) } : undefined,
    source: i.source ? { ...i.source } : undefined,
  }));
}

function signature(items: MealItem[]): string {
  return items.map((i) => `${i.productCode}:${i.quantity}`).join('|');
}

function isClass(catalog: CatalogItem[], code: string, cls: 'main' | 'drink' | 'snack'): boolean {
  const it = catalog.find((c) => c.productCode === code);
  return it ? classify(it) === cls : false;
}

function makePlan(
  opName: string,
  original: MealItem[],
  next: MealItem[],
  kept: string,
  changed: string,
  reason: string,
  catalog: CatalogItem[]
): TweakPlan {
  return {
    id: opName + ':' + signature(next),
    opName,
    items: next,
    keptSummary: kept,
    changedSummary: changed,
    reason,
    changeCount: countChanges(original, next),
    total: totalPrice(next, catalog),
  };
}

function pickReplacement(
  catalog: CatalogItem[],
  fromCode: string,
  opts: { locks: string[]; sellable?: Set<string>; cls?: 'main' | 'drink' | 'snack' }
): CatalogItem | null {
  const exclude = new Set(opts.locks);
  exclude.add(fromCode);
  const pool = catalog.filter((c) => {
    if (exclude.has(c.productCode)) return false;
    if (opts.sellable && !opts.sellable.has(c.productCode)) return false;
    if (opts.cls && classify(c) !== opts.cls) return false;
    return true;
  });
  if (pool.length === 0) return null;
  // 确定性：取价格最接近的一项（便于复现），同价取编码序
  const base = priceOf(catalog, fromCode);
  pool.sort((a, b) => Math.abs(a.price - base) - Math.abs(b.price - base) || a.productCode.localeCompare(b.productCode));
  return pool[0];
}

/** 生成最多 maxPlans（默认 3）个“微微调”方案。 */
export function generateTweakPlans(
  original: MealItem[],
  catalog: CatalogItem[],
  options: TweakOptions,
  detail?: DetailProvider,
  sellableSet?: Set<string>
): TweakResult {
  const conflicts: ConstraintIssue[] = [];
  const plans: TweakPlan[] = [];
  const seen = new Set<string>();
  const maxChanges = options.maxChanges ?? 1;
  const originalTotal = totalPrice(original, catalog);

  const tryAdd = (plan: TweakPlan) => {
    const sig = signature(plan.items);
    if (seen.has(sig)) return;
    const res = validatePlan(original, plan.items, { ...options, maxChanges }, catalog, sellableSet);
    if (res.ok) {
      seen.add(sig);
      plans.push(plan);
    } else {
      for (const iss of res.issues) if (!conflicts.some((c) => c.message === iss.message)) conflicts.push(iss);
    }
  };

  // 1) 主食不变，换杯饮料（顶层饮料）
  if (plans.length < 3) {
    const drink = original.find((i) => isClass(catalog, i.productCode, 'drink') && !options.locks.includes(i.productCode));
    if (drink) {
      const rep = pickReplacement(catalog, drink.productCode, { locks: options.locks, sellable: sellableSet, cls: 'drink' });
      if (rep) {
        const next = cloneItems(original).map((i) => (i.productCode === drink.productCode ? { ...i, productCode: rep.productCode, productName: rep.productName } : i));
        const others = original.filter((i) => i.productCode !== drink.productCode).map((i) => i.productName).join('、');
        tryAdd(makePlan('swapDrink', original, next, `保留了${others || '其余餐品'}。`, `饮料：${drink.productName} → ${rep.productName}`, '主食与份量不变，今天给饮料换个口味。', catalog));
      }
    }
  }

  // 2) 套餐内换饮料/小食（需 detailProvider 获取可替换侧项）
  if (plans.length < 3 && detail?.comboSides) {
    for (const combo of original.filter((i) => isClass(catalog, i.productCode, 'main'))) {
      const sides = [...(detail.comboSides(combo.productCode, 'drink') || []), ...(detail.comboSides(combo.productCode, 'snack') || [])];
      for (const sideCode of sides) {
        if (options.locks.includes(sideCode)) continue;
        const sideCls = classify(catalog.find((c) => c.productCode === sideCode) || ({ productName: '' } as CatalogItem));
        const rep = pickReplacement(catalog, sideCode, { locks: options.locks, sellable: sellableSet, cls: sideCls === 'other' || sideCls === 'dessert' ? undefined : sideCls });
        if (!rep) continue;
        const next = cloneItems(original).map((i) => {
          if (i.productCode === combo.productCode && i.comboItemList) {
            return { ...i, comboItemList: i.comboItemList.map((c) => (c.productCode === sideCode ? { ...c, productCode: rep.productCode, name: rep.productName } : c)) };
          }
          return i;
        });
        tryAdd(makePlan('swapComboSide', original, next, '主食（套餐）主体保留。', `套餐内：${sideCode} → ${rep.productName}`, '在套餐允许的范围内，换掉一个配角，主体不动。', catalog));
        if (plans.length >= 3) break;
      }
      if (plans.length >= 3) break;
    }
  }

  // 3) 少一份小食（移除一个顶层小食）
  if (plans.length < 3) {
    const snack = original.find((i) => isClass(catalog, i.productCode, 'snack') && !options.locks.includes(i.productCode));
    if (snack) {
      const next = cloneItems(original).filter((i) => i.productCode !== snack.productCode);
      tryAdd(makePlan('reduceSnack', original, next, '主食与饮料保留。', `少一份：${snack.productName}`, '今天胃口小一点，去掉一份小食。', catalog));
    }
  }

  // 4) 数量改为两份（某顶层商品）
  if (plans.length < 3) {
    const target = original.find((i) => !options.locks.includes(i.productCode) && i.quantity < 2);
    if (target) {
      const next = cloneItems(original).map((i) => (i.productCode === target.productCode ? { ...i, quantity: 2 } : i));
      tryAdd(makePlan('setQtyTwo', original, next, '其余餐品保留。', `数量：${target.productName} → 2 份`, '把喜欢的那份直接加到两份。', catalog));
    }
  }

  // 5) 今天最多加五元（新增一个低价小食/饮料，且总价不超预算）
  if (plans.length < 3 && options.budgetCap != null) {
    const addYuan = Math.max(0, options.budgetCap - originalTotal);
    const candidate = catalog
      .filter((c) => !options.locks.includes(c.productCode) && c.price > 0 && c.price <= addYuan + 1e-6 && !original.some((i) => i.productCode === c.productCode))
      .sort((a, b) => b.price - a.price)[0];
    if (candidate) {
      const next = [...cloneItems(original), { productCode: candidate.productCode, productName: candidate.productName, quantity: 1, source: { isHistory: false } }];
      tryAdd(makePlan('addWithinBudget', original, next, '原有餐品全部保留。', `加一份：${candidate.productName}（${candidate.price.toFixed(2)} 元）`, `在“今天最多加 ${addYuan.toFixed(0)} 元”的范围内，加一份小食。`, catalog));
    }
  }

  // 6) 换个主食（顶层套餐替换）
  if (plans.length < 3) {
    const main = original.find((i) => isClass(catalog, i.productCode, 'main') && !options.locks.includes(i.productCode));
    if (main) {
      const rep = pickReplacement(catalog, main.productCode, { locks: options.locks, sellable: sellableSet, cls: 'main' });
      if (rep) {
        const next = cloneItems(original).map((i) => (i.productCode === main.productCode ? { ...i, productCode: rep.productCode, productName: rep.productName } : i));
        tryAdd(makePlan('swapMain', original, next, '饮品与小食保留。', `主食：${main.productName} → ${rep.productName}`, '想换换口味，把主食整套替换掉。', catalog));
      }
    }
  }

  return { plans, conflicts, originalTotal };
}
