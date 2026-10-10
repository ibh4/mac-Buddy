import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from './helpers';
import * as service from '../apps/server/src/service.js';
import type { MealSnapshot } from '../apps/server/src/types.js';

beforeEach(() => resetDb());

describe('不可售拦截', () => {
  it('演示菜单中没有的商品被标记为不可售，全部可售标志置为 false', async () => {
    const snap: MealSnapshot = {
      storeCode: 'DSTORE01',
      orderType: 1,
      beType: 1,
      items: [
        { productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 },
        { productCode: 'NOPE', productName: '不存在的商品', quantity: 1 },
      ],
    };
    const r = await service.checkAvailability(snap, 'DSTORE01', 1, 1);
    expect(r.allSellable).toBe(false);
    const bad = r.items.find((i) => i.productCode === 'NOPE')!;
    expect(bad.sellable).toBe(false);
    expect(bad.reason).toBeTruthy();
    const ok = r.items.find((i) => i.productCode === 'MC001')!;
    expect(ok.sellable).toBe(true);
  });
});
