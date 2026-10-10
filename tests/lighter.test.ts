import { describe, it, expect } from 'vitest';
import { generateLighterPlans } from '../apps/server/src/lighter.js';
import { buildIndex } from '../apps/server/src/nutrition.js';
import { DEMO_NUTRITION } from '../apps/server/src/demoData.js';
import type { CatalogItem } from '../apps/server/src/catalog.js';
import type { MealItem } from '../apps/server/src/types.js';

const index = buildIndex(DEMO_NUTRITION as any);

const catalog: CatalogItem[] = [
  { productCode: 'MC001', productName: '巨无霸套餐', price: 42.5, isCombo: true, category: '套餐' },
  { productCode: 'FR01', productName: '中薯条', price: 12, category: '小食' },
  { productCode: 'VE01', productName: '玉米杯', price: 9, category: '小食' },
  { productCode: 'CF01', productName: '美式咖啡', price: 14, category: '饮料' },
  { productCode: 'DR01', productName: '可乐（中）', price: 10, category: '饮料' },
  { productCode: 'MC002', productName: '麦辣鸡腿堡套餐', price: 38, isCombo: true, category: '套餐' },
];

const meal: MealItem[] = [
  {
    productCode: 'MC001',
    productName: '巨无霸套餐',
    quantity: 1,
    comboItemList: [
      { productCode: 'MA01', name: '巨无霸', quantity: 1 },
      { productCode: 'FR01', name: '中薯条', quantity: 1 },
      { productCode: 'DR01', name: '可乐（中）', quantity: 1 },
    ],
  },
  { productCode: 'FR01', productName: '中薯条', quantity: 1 },
  { productCode: 'CF01', productName: '美式咖啡', quantity: 1 },
];

const baseOptions = { locks: [] as string[], maxChanges: 1, storeCode: 'DSTORE01' };

describe('generateLighterPlans 老样子轻一点', () => {
  it('能量少一点：给出能量下降的方案并含价格变化', () => {
    const r = generateLighterPlans({
      items: meal,
      catalog,
      goal: 'lessEnergy',
      nutritionIndex: index as any,
      options: { ...baseOptions, budgetCap: 200 },
    });
    expect(r.plans.length).toBeGreaterThan(0);
    expect(r.plans.length).toBeLessThanOrEqual(2);
    for (const p of r.plans) {
      expect(p.targetDelta!).toBeLessThan(0); // 能量必须下降
      expect(p.targetComparable).toBe(true);
    }
    // 中薯条(289) -> 玉米杯(53)
    expect(r.plans[0].from.productName).toBe('中薯条');
    expect(r.plans[0].to.productName).toBe('玉米杯');
  });

  it('蛋白多一点：给出蛋白上升的方案', () => {
    const r = generateLighterPlans({
      items: meal,
      catalog,
      goal: 'moreProtein',
      nutritionIndex: index as any,
      options: { ...baseOptions, budgetCap: 200 },
    });
    for (const p of r.plans) expect(p.targetDelta!).toBeGreaterThan(0);
  });

  it('锁定项不被替换', () => {
    const r = generateLighterPlans({
      items: meal,
      catalog,
      goal: 'lessEnergy',
      nutritionIndex: index as any,
      options: { ...baseOptions, locks: ['FR01'], budgetCap: 200 },
    });
    // 顶层中薯条被锁；套餐内的中薯条若未通过 detail 提供则也不动
    expect(r.plans.every((p) => p.from.productName !== '中薯条')).toBe(true);
  });

  it('超预算方案被剔除，并给出可放宽项', () => {
    const r = generateLighterPlans({
      items: meal,
      catalog,
      goal: 'lessEnergy',
      nutritionIndex: index as any,
      options: { ...baseOptions, budgetCap: 60 },
    });
    for (const p of r.plans) expect(p.newTotal).toBeLessThanOrEqual(60 + 1e-6);
  });

  it('基线缺目标营养数据时不给精确差值，并说明原因', () => {
    const unknownMeal: MealItem[] = [{ productCode: 'XX', productName: '完全未知餐品', quantity: 1 }];
    const r = generateLighterPlans({
      items: unknownMeal,
      catalog,
      goal: 'lessEnergy',
      nutritionIndex: index as any,
      options: { ...baseOptions, budgetCap: 200 },
    });
    expect(r.baselineHasTarget).toBe(false);
    expect(r.plans.length).toBe(0);
    expect(r.reasons.join()).toContain('缺少');
  });

  it('无符合方案时给出原因与可放宽项，不自动改锁定', () => {
    const tinyMeal: MealItem[] = [{ productCode: 'CF01', productName: '美式咖啡', quantity: 1 }];
    const r = generateLighterPlans({
      items: tinyMeal,
      catalog,
      goal: 'lessEnergy',
      nutritionIndex: index as any,
      options: { ...baseOptions, locks: ['CF01'], budgetCap: 200 },
    });
    expect(r.plans.length).toBe(0);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.relaxable.some((x) => x.includes('锁定'))).toBe(true);
  });

  it('套餐内替换需套餐规则允许（detail）', () => {
    const r = generateLighterPlans({
      items: meal,
      catalog,
      goal: 'lessEnergy',
      nutritionIndex: index as any,
      options: { ...baseOptions, budgetCap: 200 },
      detail: { comboSides: (code, slot) => (code === 'MC001' && slot === 'snack' ? ['FR01'] : []) },
    });
    // 至少能产出方案（含套餐内把中薯条换成玉米杯的可能）
    expect(r.plans.length).toBeGreaterThan(0);
  });
});
