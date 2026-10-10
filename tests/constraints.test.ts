import { describe, it, expect } from 'vitest';
import {
  validatePlan,
  countChanges,
  budgetCapWithAdd,
  comboSlotAllowed,
  type TweakOptions,
} from '../apps/server/src/constraints.js';
import type { MealItem } from '../apps/server/src/types.js';
import type { CatalogItem } from '../apps/server/src/catalog.js';

const catalog: CatalogItem[] = [
  { productCode: 'MC001', productName: '巨无霸套餐', price: 42.5, isCombo: true, category: '套餐', comboItemList: [{ productCode: 'MA01', name: '巨无霸', quantity: 1 }, { productCode: 'FR01', name: '中薯条', quantity: 1 }, { productCode: 'DR01', name: '可乐（中）', quantity: 1 }] },
  { productCode: 'MC002', productName: '麦辣鸡腿堡套餐', price: 38, isCombo: true, category: '套餐' },
  { productCode: 'DR01', productName: '可乐（中）', price: 10, category: '饮料' },
  { productCode: 'CF01', productName: '美式咖啡', price: 14, category: '饮料' },
  { productCode: 'FR01', productName: '中薯条', price: 12, category: '小食' },
  { productCode: 'VE01', productName: '玉米杯', price: 9, category: '小食' },
];

const original: MealItem[] = [
  { productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 },
  { productCode: 'FR01', productName: '中薯条', quantity: 1 },
  { productCode: 'DR01', productName: '可乐（中）', quantity: 1 },
];

describe('countChanges', () => {
  it('仅数量变化计为 1 处', () => {
    const next = original.map((i) => (i.productCode === 'FR01' ? { ...i, quantity: 2 } : i));
    expect(countChanges(original, next)).toBe(1);
  });
  it('替换（移除1+新增1同类）计为 1 处', () => {
    const next = original.map((i) => (i.productCode === 'DR01' ? { ...i, productCode: 'CF01', productName: '美式咖啡' } : i));
    expect(countChanges(original, next)).toBe(1);
  });
  it('纯新增计 1 处、纯移除计 1 处', () => {
    const add = [...original, { productCode: 'VE01', productName: '玉米杯', quantity: 1 }];
    expect(countChanges(original, add)).toBe(1);
    const remove = original.filter((i) => i.productCode !== 'DR01');
    expect(countChanges(original, remove)).toBe(1);
  });
  it('移除两项并新增一项计 3 处', () => {
    const next = [original[0], { productCode: 'VE01', productName: '玉米杯', quantity: 1 }];
    expect(countChanges(original, next)).toBe(3);
  });
});

describe('validatePlan 约束', () => {
  const base: TweakOptions = { locks: [], maxChanges: 1, storeCode: 'DSTORE01' };

  it('锁定的商品被移除 → 冲突并给出放宽建议', () => {
    const next = original.filter((i) => i.productCode !== 'DR01');
    const r = validatePlan(original, next, { ...base, locks: ['DR01'] }, catalog);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === 'locked' && !!i.relax)).toBe(true);
  });

  it('锁定项内容被修改 → 冲突', () => {
    const next = original.map((i) => (i.productCode === 'DR01' ? { ...i, quantity: 2 } : i));
    const r = validatePlan(original, next, { ...base, locks: ['DR01'] }, catalog);
    expect(r.ok).toBe(false);
  });

  it('未锁定商品替换为可售项且不超过预算 → 通过', () => {
    const next = original.map((i) => (i.productCode === 'DR01' ? { ...i, productCode: 'CF01', productName: '美式咖啡' } : i));
    const r = validatePlan(original, next, base, catalog);
    expect(r.ok).toBe(true);
    expect(r.total).toBeCloseTo(68.5, 2); // 42.5+12+14
  });

  it('超预算 → 冲突并提示放宽预算', () => {
    // 把中薯条换成更贵的（不存在），这里直接构造一个超预算的 next：加一个 9 元玉米杯，预算上限 64.5+5=69.5 内 OK；改用 80 元假设不成立，改用 budgetCap 设得很低
    const next = original; // 64.5
    const r = validatePlan(original, next, { ...base, budgetCap: 50 }, catalog);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === 'budget' && !!i.relax)).toBe(true);
  });

  it('改动处数超过上限 → 冲突', () => {
    const next = [
      { productCode: 'MC002', productName: '麦辣鸡腿堡套餐', quantity: 1 },
      { productCode: 'VE01', productName: '玉米杯', quantity: 1 },
    ];
    const r = validatePlan(original, next, base, catalog);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === 'changes')).toBe(true);
  });

  it('不可售商品进入方案 → 冲突', () => {
    const next = original.map((i) => (i.productCode === 'DR01' ? { ...i, productCode: 'NOPE', productName: '未知' } : i));
    const r = validatePlan(original, next, base, catalog, new Set(['MC001', 'FR01', 'DR01']));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === 'unsellable')).toBe(true);
  });
});

describe('budgetCapWithAdd', () => {
  it('原总价 + 加价 = 预算上限', () => {
    expect(budgetCapWithAdd(original, catalog, 5)).toBeCloseTo(69.5, 2);
  });
});

describe('comboSlotAllowed', () => {
  it('允许把套餐饮料替换为同类饮料', () => {
    expect(comboSlotAllowed('MC001', 'drink', 'CF01', catalog)).toBe(true);
    expect(comboSlotAllowed('MC001', 'drink', 'FR01', catalog)).toBe(false); // 小食不是饮料
  });
});
