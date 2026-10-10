import { describe, it, expect } from 'vitest';
import { generateRandom, hashString, mulberry32 } from '../apps/server/src/randomPicker.js';
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

describe('随机种子与可复现', () => {
  it('相同输入 + 相同 nonce 得到相同结果', () => {
    const base = { mode: 'new' as const, localAnonId: 'u', catalog, locks: [] as string[], budgetCap: 200, novelty: 'slight' as const, savedMeals: [] as MealItem[][], baseMeal: [] as MealItem[] };
    const r1 = generateRandom({ ...base }, 0);
    const r2 = generateRandom({ ...base }, 0);
    expect(r1.picked?.id).toBe(r2.picked?.id);
    expect(r1.seedUsed).toBe(r2.seedUsed);
  });

  it('mulberry32 确定性', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    expect(a()).toBe(b());
    expect(hashString('abc')).toBe(hashString('abc'));
  });
});

describe('“换一个”避免立即重复', () => {
  it('存在多个候选时，换一个不会立即抽中上一份', () => {
    const base = { mode: 'new' as const, localAnonId: 'u', catalog, locks: [] as string[], budgetCap: 200, novelty: 'slight' as const, savedMeals: [] as MealItem[][], baseMeal: [] as MealItem[] };
    const r0 = generateRandom({ ...base }, 0);
    if (r0.candidates.length > 1) {
      const r1 = generateRandom({ ...base, prevPickId: r0.picked!.id }, 1);
      expect(r1.picked!.id).not.toBe(r0.picked!.id);
    }
  });
});

describe('硬约束过滤', () => {
  it('超预算的候选被排除', () => {
    const base = { mode: 'new' as const, localAnonId: 'u', catalog, locks: [] as string[], budgetCap: 65, novelty: 'slight' as const };
    const r = generateRandom({ ...base }, 0);
    expect(r.picked).not.toBeNull();
    expect(r.picked!.total).toBeLessThanOrEqual(65 + 1e-6);
  });

  it('预算过低时无可抽候选', () => {
    const base = { mode: 'new' as const, localAnonId: 'u', catalog, locks: [] as string[], budgetCap: 50, novelty: 'slight' as const };
    const r = generateRandom({ ...base }, 0);
    expect(r.candidates.length).toBe(0);
    expect(r.picked).toBeNull();
  });

  it('锁定/排除商品不会进入推荐', () => {
    const base = { mode: 'new' as const, localAnonId: 'u', catalog, locks: ['DR01'], budgetCap: 200, novelty: 'slight' as const };
    const r = generateRandom({ ...base }, 0);
    expect(r.picked).not.toBeNull();
    expect(r.picked!.items.some((i) => i.productCode === 'DR01')).toBe(false);
  });

  it('“老样子里随机”排除含指定顶层餐品的餐单', () => {
    const base = { mode: 'fromSaved' as const, localAnonId: 'u', catalog, locks: [] as string[], budgetCap: 200, novelty: 'slight' as const, savedMeals: [mealA, mealB], excludeCodes: ['MC001'] };
    const r = generateRandom({ ...base }, 0);
    expect(r.candidates.length).toBe(1);
    expect(r.candidates[0].items[0].productCode).toBe('MC002');
  });
});
