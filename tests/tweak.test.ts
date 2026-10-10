import { describe, it, expect } from 'vitest';
import { generateTweakPlans, type DetailProvider } from '../apps/server/src/tweak.js';
import type { MealItem } from '../apps/server/src/types.js';
import type { CatalogItem } from '../apps/server/src/catalog.js';

const catalog: CatalogItem[] = [
  { productCode: 'MC001', productName: '巨无霸套餐', price:42.5, isCombo: true, category: '套餐', comboItemList: [{ productCode:'MA01', name:'巨无霸',quantity:1 },{ productCode:'FR01', name:'中薯条',quantity:1 },{ productCode:'DR01', name:'可乐（中）',quantity:1 }] },
  { productCode: 'DR01', productName: '可乐（中）', price: 10, category: '饮料' },
  { productCode: 'CF01', productName: '美式咖啡', price: 14, category: '饮料' },
  { productCode: 'FR01', productName: '中薯条', price: 12, category: '小食' },
  { productCode: 'VE01', productName: '玉米杯', price: 9, category: '小食' },
  { productCode: 'CH02', productName: '脆薯星', price: 3, category: '小食' },
];

const meal: MealItem[] = [
  { productCode: 'MC001', productName: '巨无霸套餐', quantity: 1, comboItemList: [{ productCode: 'MA01', name: '巨无霸', quantity: 1 }, { productCode: 'FR01', name: '中薯条', quantity: 1 }, { productCode: 'DR01', name: '可乐（中）', quantity: 1 }] },
  { productCode: 'FR01', productName: '中薯条', quantity: 1 },
  { productCode: 'DR01', productName: '可乐（中）', quantity: 1 },
];

describe('generateTweakPlans 边界微调', () => {
  it('无锁定时给出最多 3 个方案，每个只改 1 处', () => {
    const r = generateTweakPlans(meal, catalog, { locks: [], maxChanges: 1, budgetCap: 200, storeCode: 'DSTORE01' });
    expect(r.plans.length).toBeGreaterThanOrEqual(1);
    expect(r.plans.length).toBeLessThanOrEqual(3);
    for (const p of r.plans) expect(p.changeCount).toBe(1);
  });

  it('套餐内替换（detailProvider）能产生 swapComboSide 方案', () => {
    const detail: DetailProvider = { comboSides: (code) => (code === 'MC001' ? ['DR01', 'FR01'] : []) };
    const r = generateTweakPlans(meal, catalog, { locks: [], maxChanges: 1, budgetCap: 200, storeCode: 'DSTORE01' }, detail);
    expect(r.plans.some((p) => p.opName === 'swapComboSide')).toBe(true);
  });

  it('锁定饮料后，换饮料方案不会出现，但仍可少一份小食', () => {
    const r = generateTweakPlans(meal, catalog, { locks: ['DR01'], maxChanges: 1, budgetCap: 200, storeCode: 'DSTORE01' });
    expect(r.plans.some((p) => p.opName === 'swapDrink')).toBe(false);
    expect(r.plans.some((p) => p.opName === 'reduceSnack')).toBe(true);
  });

  it('maxChanges=0 时不产出任何方案', () => {
    const r = generateTweakPlans(meal, catalog, { locks: [], maxChanges: 0, budgetCap: 200, storeCode: 'DSTORE01' });
    expect(r.plans.length).toBe(0);
  });

  it('“今天最多加五元”能在预算内新增低价商品', () => {
    const smallMeal: MealItem[] = [
      { productCode: 'MC001', productName: '巨无霸套餐', quantity: 2, comboItemList: [{ productCode: 'MA01', name: '巨无霸', quantity: 1 }, { productCode: 'FR01', name: '中薯条', quantity: 1 }, { productCode: 'DR01', name: '可乐（中）', quantity: 1 }] },
      { productCode: 'DR01', productName: '可乐（中）', quantity: 2 },
    ];
    const r = generateTweakPlans(smallMeal, catalog, { locks: [], maxChanges: 1, budgetCap: 42.5 * 2 + 10 * 2 + 5, storeCode: 'DSTORE01' });
    const add = r.plans.find((p) => p.opName === 'addWithinBudget');
    expect(add).toBeTruthy();
    expect(add!.total).toBeLessThanOrEqual((42.5 * 2 + 10 * 2 + 5) + 1e-6);
  });
});
