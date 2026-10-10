import { describe, it, expect } from 'vitest';
import { classify, priceOf, totalPrice, candidatesByClass, type CatalogItem } from '../apps/server/src/catalog.js';

const catalog: CatalogItem[] = [
  { productCode: 'MC001', productName: '巨无霸套餐', price: 42.5, isCombo: true, category: '套餐' },
  { productCode: 'DR01', productName: '可乐（中）', price: 10, category: '饮料' },
  { productCode: 'CF01', productName: '美式咖啡', price: 14, category: '饮料' },
  { productCode: 'FR01', productName: '中薯条', price: 12, category: '小食' },
  { productCode: 'VE01', productName: '玉米杯', price: 9, category: '小食' },
];

describe('catalog 分类与价格', () => {
  it('classify 正确识别 套餐/饮料/小食', () => {
    expect(classify(catalog[0])).toBe('main');
    expect(classify(catalog[1])).toBe('drink');
    expect(classify(catalog[3])).toBe('snack');
  });

  it('priceOf / totalPrice 计算正确', () => {
    expect(priceOf(catalog, 'DR01')).toBe(10);
    expect(totalPrice([{ productCode: 'MC001', quantity: 1 }, { productCode: 'DR01', quantity: 2 }], catalog)).toBe(62.5);
  });

  it('candidatesByClass 排除 locked 与 excluded', () => {
    const drinks = candidatesByClass(catalog, 'drink', { locked: ['DR01'] });
    expect(drinks.map((d) => d.productCode)).toEqual(['CF01']);
    const snacks = candidatesByClass(catalog, 'snack', { exclude: ['FR01'] });
    expect(snacks.map((s) => s.productCode)).toEqual(['VE01']);
  });
});
