import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, db } from './helpers';
import * as service from '../apps/server/src/service.js';
import type { MealSnapshot, MealItem } from '../apps/server/src/types.js';

const itemsA: MealItem[] = [{ productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 }];
const itemsB: MealItem[] = [{ productCode: 'MC001', productName: '巨无霸套餐', quantity: 2 }];

const base = (items: MealItem[]): MealSnapshot => ({
  storeCode: 'DSTORE01',
  orderType: 1,
  beType: 1,
  items,
});

beforeEach(() => resetDb());

describe('报价（核价）', () => {
  it('核价返回正确金额（演示价），且核价本身不创建任何订单', async () => {
    const { template, version } = service.createTemplate('T', '', false, base(itemsA));
    const { quote } = await service.createQuote({
      versionId: version.id,
      storeCode: 'DSTORE01',
      storeName: 'x',
      orderType: 1,
      beType: 1,
      items: itemsA,
    });
    expect(quote.amount).toBe(42.5);
    const orderCount = (db.prepare('SELECT COUNT(*) c FROM orders').get() as any).c;
    expect(orderCount).toBe(0); // 确认前绝不下单
  });

  it('餐品数量变化会使旧报价失效', async () => {
    const { template, version } = service.createTemplate('T', '', false, base(itemsA));
    const { quote: q1 } = await service.createQuote({
      versionId: version.id,
      storeCode: 'DSTORE01',
      orderType: 1,
      beType: 1,
      items: itemsA,
    });
    const { quote: q2 } = await service.createQuote({
      versionId: version.id,
      storeCode: 'DSTORE01',
      orderType: 1,
      beType: 1,
      items: itemsB,
    });
    expect(q1.signature).not.toBe(q2.signature);
    expect(service.isQuoteValid(q1.id, q1.signature)).toBe(true);
    expect(service.isQuoteValid(q1.id, q2.signature)).toBe(false);
  });

  it('门店或就餐方式变化也会使旧报价失效', async () => {
    const { template, version } = service.createTemplate('T', '', false, base(itemsA));
    const { quote: q1 } = await service.createQuote({
      versionId: version.id,
      storeCode: 'DSTORE01',
      orderType: 1,
      beType: 1,
      items: itemsA,
    });
    const { quote: q2 } = await service.createQuote({
      versionId: version.id,
      storeCode: 'DSTORE02',
      orderType: 2,
      beType: 2,
      items: itemsA,
    });
    expect(service.isQuoteValid(q1.id, q2.signature)).toBe(false);
  });
});
