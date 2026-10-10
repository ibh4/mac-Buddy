import { describe, it, expect, beforeEach, vi } from 'vitest';

// 该测试文件模拟“真实模式”，并让 create-order 抛出异常，验证：
// 下单结果不明时标记为 unknown，且绝不自动重试、不伪造支付链接。
vi.mock('../apps/server/src/config.js', async () => {
  const actual = await vi.importActual<typeof import('../apps/server/src/config.js')>('../apps/server/src/config.js');
  return { ...actual, REAL_MODE: true, FORCE_DEMO_MODE: false };
});

vi.mock('../apps/server/src/mcpClient.js', () => ({
  callMcpTool: vi.fn(async (name: string) => {
    if (name === 'calculate-price') return { price: 1590 }; // 1590 分 = ¥15.90
    if (name === 'create-order') throw new Error('network timeout');
    return {};
  }),
  ensureClient: vi.fn(async () => ({}) as any),
  getConnectionState: vi.fn(() => ({ connected: true, lastError: null, lastSyncAt: null })),
  MCP_TOOL_NAMES: [],
  extractData: vi.fn((r: any) => r),
  listTools: vi.fn(async () => []),
}));

import { resetDb } from './helpers';
import * as service from '../apps/server/src/service.js';
import type { MealSnapshot, MealItem } from '../apps/server/src/types.js';

const items: MealItem[] = [{ productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 }];
const base = (): MealSnapshot => ({ storeCode: 'DSTORE01', orderType: 1, beType: 1, items });

beforeEach(() => resetDb());

describe('未知下单结果不自动重试', () => {
  it('create-order 报错时标记 unknown，不伪造支付链接', async () => {
    const { template, version } = service.createTemplate('T', '', false, base());
    const { quote } = await service.createQuote({
      versionId: version.id,
      storeCode: 'DSTORE01',
      orderType: 1,
      beType: 1,
      items,
    });
    const res = await service.createOrderAttempt({
      quoteId: quote.id,
      items,
      storeCode: 'DSTORE01',
      orderType: 1,
      beType: 1,
    });
    expect(res.attempt.status).toBe('unknown');
    // 没有伪造任何支付链接 / 远端订单号：数据库存为 NULL
    expect(res.attempt.paymentUrl).toBeNull();
    expect(res.attempt.remoteOrderId).toBeNull();
    expect(res.attempt.note).toContain('下单结果不明');
  });
});
