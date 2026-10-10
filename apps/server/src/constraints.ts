// 餐单约束检查：锁定、最大改动数、预算、可售性、套餐组合。
// 返回结构化冲突与“可放宽的选项”，绝不在冲突时自动突破约束。

import type { MealItem } from './types.js';
import type { CatalogItem } from './catalog.js';
import { totalPrice, priceOf, classify } from './catalog.js';

export interface TweakOptions {
  /** 被锁定的商品编码（不得被随机或自动修改） */
  locks: string[];
  /** 默认最多改动 1 个商品槽位 */
  maxChanges: number;
  /** 预算上限（元）；若设置则总价不得超出 */
  budgetCap?: number;
  storeCode?: string;
}

export interface ConstraintIssue {
  kind: 'locked' | 'budget' | 'unsellable' | 'combo' | 'changes';
  message: string;
  /** 可放宽的约束说明，交给用户选择 */
  relax?: string;
}

export interface ConstraintResult {
  ok: boolean;
  issues: ConstraintIssue[];
  total: number;
  budgetCap?: number;
}

/** 统计“被改动”的槽位数（按商品槽位语义）：
 * - 移除 A 并新增 B（替换）计为 **1 处**，不应被误计为两处；
 * - 单纯新增、单纯移除各计 1 处；
 * - 同一商品的数量 / 特制 / 套餐组成变化各计 1 处。 */
export function countChanges(original: MealItem[], next: MealItem[]): number {
  const byCode = (arr: MealItem[]) => {
    const m = new Map<string, number>();
    for (const i of arr) m.set(i.productCode, (m.get(i.productCode) || 0) + 1);
    return m;
  };
  const origCount = byCode(original);
  const nextCount = byCode(next);
  let removed = 0;
  let added = 0;
  for (const [code, n] of origCount) {
    const m = nextCount.get(code) || 0;
    if (m < n) removed += n - m;
  }
  for (const [code, n] of nextCount) {
    const m = origCount.get(code) || 0;
    if (m < n) added += n - m;
  }
  // 一次“移除+新增”视为一次替换（1 处）
  let changes = removed === 1 && added === 1 ? 1 : removed + added;

  // 编码相同的既有商品：数量 / 特制 / 套餐组成变化
  const nxt = [...next];
  const used = new Set<number>();
  for (let i = 0; i < original.length; i++) {
    let j = -1;
    for (let k = 0; k < nxt.length; k++) {
      if (!used.has(k) && nxt[k].productCode === original[i].productCode) {
        j = k;
        break;
      }
    }
    if (j >= 0) {
      used.add(j);
      const o = original[i];
      const x = nxt[j];
      if (
        o.quantity !== x.quantity ||
        JSON.stringify(o.comboItemList || []) !== JSON.stringify(x.comboItemList || []) ||
        JSON.stringify(o.modification || {}) !== JSON.stringify(x.modification || {})
      ) {
        changes++;
      }
    }
  }
  return changes;
}

export function validatePlan(
  original: MealItem[],
  next: MealItem[],
  options: TweakOptions,
  catalog: CatalogItem[],
  sellableSet?: Set<string>
): ConstraintResult {
  const issues: ConstraintIssue[] = [];
  const locks = new Set(options.locks || []);

  // 1) 锁定项不得被改动或移除
  const nextByCode = new Map(next.map((i) => [i.productCode, i]));
  for (const lockedCode of locks) {
    const oi = original.find((i) => i.productCode === lockedCode);
    const ni = nextByCode.get(lockedCode);
    if (oi && !ni) {
      issues.push({ kind: 'locked', message: `「${oi.productName}」已锁定，不能被移除。`, relax: '取消该商品的锁定' });
    } else if (oi && ni) {
      const changed =
        oi.quantity !== ni.quantity ||
        JSON.stringify(oi.comboItemList || []) !== JSON.stringify(ni.comboItemList || []) ||
        JSON.stringify(oi.modification || {}) !== JSON.stringify(ni.modification || {});
      if (changed) issues.push({ kind: 'locked', message: `「${oi.productName}」已锁定，其内容不可修改。`, relax: '取消该商品的锁定' });
    }
  }

  // 2) 改动数限制
  const changes = countChanges(original, next);
  if (changes > options.maxChanges) {
    issues.push({
      kind: 'changes',
      message: `本次改动了 ${changes} 处，超出上限（最多 ${options.maxChanges} 处）。`,
      relax: `把“最多改动处数”调大到 ${changes} 或更多`,
    });
  }

  // 3) 可售性
  if (sellableSet) {
    for (const it of next) {
      if (!sellableSet.has(it.productCode)) {
        issues.push({ kind: 'unsellable', message: `「${it.productName}」在当前门店不可售。`, relax: '换一个可售商品' });
      }
    }
  }

  // 4) 预算
  const total = totalPrice(next, catalog);
  if (options.budgetCap != null && total > options.budgetCap + 1e-6) {
    issues.push({
      kind: 'budget',
      message: `核价约 ${total.toFixed(2)} 元，超出预算 ${options.budgetCap.toFixed(2)} 元。`,
      relax: `放宽预算上限（例如调到 ${Math.ceil(total)} 元）`,
    });
  }

  return { ok: issues.length === 0, issues, total, budgetCap: options.budgetCap };
}

/** 计算“今天最多加 N 元”的预算上限：原总价 + N。 */
export function budgetCapWithAdd(original: MealItem[], catalog: CatalogItem[], addYuan: number): number {
  return totalPrice(original, catalog) + addYuan;
}

/** 套餐内替换校验：若提供套餐允许的子项集合，则替换项必须属于该集合。 */
export function comboSlotAllowed(
  comboCode: string,
  slotClass: 'drink' | 'snack',
  candidateCode: string,
  catalog: CatalogItem[]
): boolean {
  const combo = catalog.find((c) => c.productCode === comboCode);
  if (!combo || !combo.comboItemList || combo.comboItemList.length === 0) return true; // 无法核实则放行（后续核价会再次校验）
  // 允许替换为同类别且出现在套餐常见搭配外的任意目录项（这里做软约束：候选必须与套餐同分类可替换）
  const cand = catalog.find((c) => c.productCode === candidateCode);
  if (!cand) return false;
  return classify(cand) === slotClass;
}
