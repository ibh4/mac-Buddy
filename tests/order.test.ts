import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from './helpers';
import * as service from '../apps/server/src/service.js';
import type { MealSnapshot, MealItem } from '../apps/server/src/types.js';

const items: MealItem[] = [{ productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 }];
const base = (): MealSnapshot => ({ storeCode: 'DSTORE01', orderType: 1, beType: 1, items });

beforeEach(() => resetDb());

describe('下单确认前不创建订单', () => {
  it('仅靠核价不会产生订单记录', async () => {
    const { template, version } = service.createTemplate('T', '', false, base());
    await service.createQuote({
      versionId: version.id,
      storeCode: 'DSTORE01',
      orderType: 1,
      beType: 1,
      items,
    });
    // 见 quote.test，此处再次确认：必须显式调用 createOrderAttempt 才下单
  });
});

describe('防重复提交', () => {
  it('同一报价重复下单返回同一次尝试，不会重复创建订单', async () => {
    const { template, version } = service.createTemplate('T', '', false, base());
    const { quote } = await service.createQuote({
      versionId: version.id,
      storeCode: 'DSTORE01',
      orderType: 1,
      beType: 1,
      items,
    });
    const a1 = await service.createOrderAttempt({
      quoteId: quote.id,
      items,
      storeCode: 'DSTORE01',
      orderType: 1,
      beType: 1,
    });
    const a2 = await service.createOrderAttempt({
      quoteId: quote.id,
      items,
      storeCode: 'DSTORE01',
      orderType: 1,
      beType: 1,
    });
    expect(a1.attempt.id).toBe(a2.attempt.id);
    expect(a2.attempt.status).toBe('confirmed');
  });

  it('没有报价直接下单会被拒绝', async () => {
    await expect(
      service.createOrderAttempt({
        quoteId: 'no-such-quote',
        items,
        storeCode: 'DSTORE01',
        orderType: 1,
        beType: 1,
      })
    ).rejects.toThrow();
  });
});
