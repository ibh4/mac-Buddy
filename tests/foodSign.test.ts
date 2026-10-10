import { describe, it, expect } from 'vitest';
import { generateDailySign } from '../apps/server/src/foodSign.js';
import type { CatalogItem } from '../apps/server/src/catalog.js';
import type { MealItem } from '../apps/server/src/types.js';

const catalog: CatalogItem[] = [
  { productCode: 'MC001', productName: '巨无霸套餐', price: 42.5, isCombo: true, category: '套餐', comboItemList: [{ productCode: 'MA01', name: '巨无霸', quantity: 1 }, { productCode: 'FR01', name: '中薯条', quantity: 1 }, { productCode: 'DR01', name: '可乐（中）', quantity: 1 }] },
  { productCode: 'MC002', productName: '麦辣鸡腿堡套餐', price: 38, isCombo: true, category: '套餐' },
  { productCode: 'DR01', productName: '可乐（中）', price: 10, category: '饮料' },
  { productCode: 'CF01', productName: '美式咖啡', price: 14, category: '饮料' },
  { productCode: 'FR01', productName: '中薯条', price: 12, category: '小食' },
  { productCode: 'VE01', productName: '玉米杯', price: 9, category: '小食' },
];

const mealA: MealItem[] = [{ productCode: 'MC001', productName: '巨无霸套餐', quantity: 1, comboItemList: [{ productCode: 'MA01', name: '巨无霸', quantity: 1 }, { productCode: 'FR01', name: '中薯条', quantity: 1 }, { productCode: 'DR01', name: '可乐（中）', quantity: 1 }] }];
const mealB: MealItem[] = [{ productCode: 'MC002', productName: '麦辣鸡腿堡套餐', quantity: 1 }];

const basePref = { favorites: ['MC001'] as string[], tasteTags: {} as Record<string, string[]>, exclusions: [] as string[], locks: [] as string[] };

describe('今日食签', () => {
  it('相同条件 + 相同 nonce 结果可复现', () => {
    const input = { localAnonId: 'u', dateCN: '2026-10-09', storeCode: 'DSTORE01', mealPeriod: 'lunch' as const, intent: 'slight' as const, catalog, savedMeals: [mealA, mealB], baseMeal: mealA, recentCodes: [], preference: basePref, budgetCap: 200, prefVersion: 'v1' };
    const r1 = generateDailySign(input, 0);
    const r2 = generateDailySign(input, 0);
    expect(r1.picked?.id).toBe(r2.picked?.id);
    expect(r1.seedUsed).toBe(r2.seedUsed);
  });

  it('“换一份灵感”存在多个候选时避免立即重复', () => {
    const input = { localAnonId: 'u', dateCN: '2026-10-09', storeCode: 'DSTORE01', mealPeriod: 'lunch' as const, intent: 'slight' as const, catalog, savedMeals: [mealA, mealB], baseMeal: mealA, recentCodes: [], preference: basePref, budgetCap: 200, prefVersion: 'v1' };
    const r0 = generateDailySign(input, 0);
    if (r0.candidates.length > 1) {
      const r1 = generateDailySign({ ...input, prevPickId: r0.picked!.id }, 1);
      expect(r1.picked!.id).not.toBe(r0.picked!.id);
    }
  });

  it('排除商品不会进入食签候选', () => {
    const input = { localAnonId: 'u', dateCN: '2026-10-09', storeCode: 'DSTORE01', mealPeriod: 'lunch' as const, intent: 'new' as const, catalog, savedMeals: [], baseMeal: [], recentCodes: [], preference: { ...basePref, exclusions: ['DR01'] }, budgetCap: 200, prefVersion: 'v1' };
    const r = generateDailySign(input, 0);
    expect(r.picked).not.toBeNull();
    expect(r.picked!.items.some((i) => i.productCode === 'DR01')).toBe(false);
  });

  it('无候选时返回空结果（不抛错）', () => {
    const input = { localAnonId: 'u', dateCN: '2026-10-09', storeCode: 'DSTORE01', mealPeriod: 'lunch' as const, intent: 'new' as const, catalog, savedMeals: [], baseMeal: [], recentCodes: [], preference: { ...basePref, exclusions: ['MC001', 'MC002', 'DR01', 'CF01', 'FR01', 'VE01'] }, budgetCap: 200, prefVersion: 'v1' };
    const r = generateDailySign(input, 0);
    expect(r.picked).toBeNull();
    expect(r.candidates.length).toBe(0);
  });
});
