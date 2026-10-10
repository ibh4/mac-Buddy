import { describe, it, expect } from 'vitest';
import { parseStoreCoupons, buildCouponCandidates, evaluateCouponPlans } from '../apps/server/src/coupons.js';
import type { MealItem } from '../apps/server/src/types.js';

const items: MealItem[] = [
  { productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 },
  { productCode: 'FR01', productName: '中薯条', quantity: 1 },
];

const rawCoupons = [
  {
    title: '中薯条立减',
    couponId: 'C1',
    couponCode: 'MCDTEST0001',
    tradeDateTime: '2026-12-31 23:59:59',
    products: [{ productCode: 'FR01', productName: '中薯条' }],
    promotionId: 'P1',
  },
  {
    title: '麦旋风任选',
    couponId: 'C2',
    couponCode: 'MCDTEST0002',
    products: [{ productCode: 'IC99', productName: '麦旋风' }],
    promotionId: 'P2',
  },
];

describe('coupons — 解析真实返回', () => {
  it('解析数组结构', () => {
    const c = parseStoreCoupons(rawCoupons);
    expect(c.length).toBe(2);
    expect(c[0].couponCode).toBe('MCDTEST0001');
    expect(c[0].products[0].productCode).toBe('FR01');
  });

  it('结构不可识别时不臆造，返回空数组', () => {
    expect(parseStoreCoupons(null).length).toBe(0);
    expect(parseStoreCoupons({}).length).toBe(0);
    expect(parseStoreCoupons('x').length).toBe(0);
  });
});

describe('coupons — 构造候选', () => {
  it('只产出“适用商品在餐单里”的券，不新增商品', () => {
    const cands = buildCouponCandidates(items, parseStoreCoupons(rawCoupons));
    expect(cands.length).toBe(1);
    expect(cands[0].targetProductCode).toBe('FR01');
    // 商品与数量完全不变，只是目标商品多挂了券
    expect(cands[0].items.length).toBe(2);
    expect(cands[0].items[0].productCode).toBe('MC001');
    expect(cands[0].items[1].couponCode).toBe('MCDTEST0001');
    expect(cands[0].items[1].quantity).toBe(1);
  });

  it('无券码的券不参与核价', () => {
    const cands = buildCouponCandidates(items, [{ title: '无码券', products: [{ productCode: 'FR01', productName: '中薯条' }] }]);
    expect(cands.length).toBe(0);
  });
});

describe('coupons — 价差结论', () => {
  it('确实更低才说省钱', () => {
    const plans = evaluateCouponPlans({
      baseline: { amount: 54.5 },
      priced: [{ candidate: buildCouponCandidates(items, parseStoreCoupons(rawCoupons))[0], amount: 52.5 }],
      demo: false,
    });
    expect(plans[0].cheaper).toBe(true);
    expect(plans[0].saved).toBe(2);
  });

  it('没有变便宜就不宣称省钱', () => {
    const plans = evaluateCouponPlans({
      baseline: { amount: 54.5 },
      priced: [{ candidate: buildCouponCandidates(items, parseStoreCoupons(rawCoupons))[0], amount: 54.5 }],
      demo: false,
    });
    expect(plans[0].cheaper).toBe(false);
    expect(plans[0].saved).toBe(0);
  });

  it('核价失败时不给出任何省钱结论', () => {
    const plans = evaluateCouponPlans({
      baseline: { amount: 0, priceUnavailable: true, message: '暂无法核价' },
      priced: [{ candidate: buildCouponCandidates(items, parseStoreCoupons(rawCoupons))[0], amount: 0, priceUnavailable: true }],
      demo: false,
    });
    expect(plans[0].priceUnavailable).toBe(true);
    expect(plans[0].saved).toBe(0);
    expect(plans[0].cheaper).toBe(false);
  });
});
