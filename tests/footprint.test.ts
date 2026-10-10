import { describe, it, expect, beforeEach } from 'vitest';
import {
  roughCategory,
  isCompletedStatus,
  parseCNTime,
  normalizeRawOrder,
  computeOrderAnalytics,
  buildPreferenceProfile,
  computeUsageStats,
  diffSnapshots,
  upsertSyncedOrder,
  getAllSyncedOrders,
  setOrderOwner,
  saveFeedback,
  listFeedback,
  deleteFeedback,
  getPrefs,
  setPrefs,
  getLocks,
  setLock,
  clearLock,
  getSignCache,
  setSignCache,
  type SyncedOrder,
  type FeedbackRow,
  type PrefsShape,
} from '../apps/server/src/footprint.js';
import type { MealTemplate, MealVersion, OrderAttempt, MealItem } from '../apps/server/src/types.js';
import { db } from '../apps/server/src/db.js';

const FOOTPRINT_TABLES = ['synced_orders', 'order_sync_meta', 'feedback', 'prefs', 'item_locks', 'sign_cache'];

beforeEach(() => {
  // 清空饮食足迹相关表，避免测试互相干扰（setup.ts 已为每文件分配独立临时库）。
  for (const t of FOOTPRINT_TABLES) {
    try {
      db.prepare(`DELETE FROM ${t}`).run();
    } catch {
      /* table may not exist in some envs */
    }
  }
});

function makeOrder(partial: Partial<SyncedOrder>): SyncedOrder {
  return {
    orderId: 'O1',
    storeCode: 'ST1',
    createTime: '2026-10-09 12:30:00',
    orderStatus: '已完成',
    realTotalAmount: '30.00',
    products: [{ productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 }],
    ownerType: 'unknown',
    includedItems: [],
    ...partial,
  };
}

describe('roughCategory 分类', () => {
  it('识别 主食/饮料/小食/甜品/未知', () => {
    expect(roughCategory('巨无霸套餐')).toBe('主食');
    expect(roughCategory('麦辣鸡腿堡')).toBe('主食');
    expect(roughCategory('可乐（中）')).toBe('饮料');
    expect(roughCategory('美式咖啡')).toBe('饮料');
    expect(roughCategory('中薯条')).toBe('小食');
    expect(roughCategory('圆筒冰淇淋')).toBe('甜品');
    expect(roughCategory('随便啥')).toBe('未知');
  });
});

describe('isCompletedStatus 订单状态口径', () => {
  it('仅“已完成/已支付”等计入，取消/未支付/退款/异常/失败排除', () => {
    expect(isCompletedStatus('已完成')).toBe(true);
    expect(isCompletedStatus('已支付')).toBe(true);
    expect(isCompletedStatus('已取消')).toBe(false);
    expect(isCompletedStatus('未支付')).toBe(false);
    expect(isCompletedStatus('退款')).toBe(false);
    expect(isCompletedStatus('异常')).toBe(false);
    expect(isCompletedStatus('已关闭')).toBe(false);
    expect(isCompletedStatus('')).toBe(false);
    expect(isCompletedStatus(undefined)).toBe(false);
  });
});

describe('parseCNTime 时间解析', () => {
  it('解析 "YYYY-MM-DD HH:MM:SS"', () => {
    const d = parseCNTime('2026-10-09 12:30:00');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
  });
  it('空值返回 null', () => {
    expect(parseCNTime('')).toBeNull();
    expect(parseCNTime(undefined)).toBeNull();
  });
});

describe('normalizeRawOrder 归一化', () => {
  it('保留商品并默认 ownerType=unknown，不臆测口味归属', () => {
    const o = normalizeRawOrder({
      orderId: 12345,
      products: [{ productCode: 'DR01', productName: '可乐', quantity: 2 }],
      orderStatus: 'X',
    });
    expect(o.orderId).toBe('12345');
    expect(o.products[0].quantity).toBe(2);
    expect(o.ownerType).toBe('unknown');
    expect(o.includedItems).toEqual([]);
  });
});

describe('computeOrderAnalytics 历史点餐分析', () => {
  it('排除非完成状态订单，仅统计已完成', () => {
    const orders = [
      makeOrder({ orderId: 'A', orderStatus: '已完成', createTime: '2026-10-09 12:00:00' }),
      makeOrder({ orderId: 'B', orderStatus: '已取消', createTime: '2026-10-09 13:00:00' }),
      makeOrder({ orderId: 'C', orderStatus: '未支付', createTime: '2026-10-09 14:00:00' }),
    ];
    const r = computeOrderAnalytics(orders, 'all');
    expect(r.orderCount).toBe(1);
    expect(r.excludedCount).toBe(2);
    expect(r.excluded.map((e) => e.orderId).sort()).toEqual(['B', 'C']);
  });

  it('按订单号去重（防御性）', () => {
    const orders = [
      makeOrder({ orderId: 'A', orderStatus: '已完成' }),
      makeOrder({ orderId: 'A', orderStatus: '已完成' }), // 重复
    ];
    const r = computeOrderAnalytics(orders, 'all');
    expect(r.orderCount).toBe(1);
  });

  it('按北京时间统计小时分布', () => {
    const orders = [
      makeOrder({ orderId: 'A', orderStatus: '已完成', createTime: '2026-10-09 21:30:00' }),
      makeOrder({ orderId: 'B', orderStatus: '已完成', createTime: '2026-10-09 21:45:00' }),
      makeOrder({ orderId: 'C', orderStatus: '已完成', createTime: '2026-10-09 08:10:00' }),
    ];
    const r = computeOrderAnalytics(orders, 'all');
    expect(r.byHour[21].count).toBe(2);
    expect(r.byHour[8].count).toBe(1);
  });

  it('到店 vs 外送统计与金额口径', () => {
    const orders = [
      makeOrder({ orderId: 'A', orderType: '1', realTotalAmount: '30.00' }),
      makeOrder({ orderId: 'B', orderType: '2', realTotalAmount: '50.00' }),
      makeOrder({ orderId: 'C', orderType: '1', realTotalAmount: '20.00' }),
    ];
    const r = computeOrderAnalytics(orders, 'all');
    expect(r.dineInCount).toBe(2);
    expect(r.deliveryCount).toBe(1);
    expect(r.totalAmount).toBe(100);
    expect(r.avgPerOrder).toBeCloseTo(33.33, 1);
  });

  it('样本不足时 samplesLow=true', () => {
    const orders = [makeOrder({ orderId: 'A' })];
    const r = computeOrderAnalytics(orders, 'all');
    expect(r.samplesLow).toBe(true);
  });
});

describe('buildPreferenceProfile 口味偏好画像', () => {
  it('显式偏好来自收藏/反馈，行为线索仅来自“自己吃”订单', () => {
    const prefs: PrefsShape = {
      favorites: ['MC001'],
      exclusions: ['NOPE'],
      tasteTags: { MC001: ['经典'] },
      locks: [],
    };
    const feedbacks: FeedbackRow[] = [
      { id: 'f1', targetType: 'item', targetCode: 'DR01', verdict: 'like', createdAt: '2026-01-01' },
      { id: 'f2', targetType: 'item', targetCode: 'EXCL', verdict: 'nope', createdAt: '2026-01-01' },
      { id: 'f3', targetType: 'item', targetCode: 'FORO', verdict: 'forOthers', createdAt: '2026-01-01' },
    ];
    const orders: SyncedOrder[] = [
      makeOrder({ orderId: 'A', ownerType: 'self', products: [{ productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 }, { productCode: 'DR01', productName: '可乐', quantity: 1 }] }),
      // 代买/共享订单不应计入个人口味
      makeOrder({ orderId: 'B', ownerType: 'shared', products: [{ productCode: 'WEIRD', productName: '奇怪的东西', quantity: 1 }] }),
    ];
    const p = buildPreferenceProfile(orders, feedbacks, prefs);
    expect(p.explicit.favorites).toEqual(expect.arrayContaining(['MC001', 'DR01'])); // 收藏 + like
    expect(p.explicit.exclusions).toEqual(expect.arrayContaining(['NOPE', 'EXCL'])); // 排除 + nope
    expect(p.explicit.forOthers).toEqual(['FORO']);
    expect(p.behavioral.selfOrderCount).toBe(1); // shared 不计入
    expect(p.behavioral.productPrefs.some((x) => x.code === 'WEIRD')).toBe(false);
    expect(p.behavioral.productPrefs.every((x) => x.basis === 'inferred')).toBe(true);
    // 结论应区分 explicit / inferred
    expect(p.conclusions.some((c) => c.basis === 'explicit')).toBe(true);
    expect(p.conclusions.some((c) => c.basis === 'inferred')).toBe(true);
  });

  it('自己订单不足 3 笔时提示样本少', () => {
    const p = buildPreferenceProfile([makeOrder({ orderId: 'A', ownerType: 'self' })], [], { favorites: [], exclusions: [], tasteTags: {}, locks: [] });
    expect(p.behavioral.samplesLow).toBe(true);
    expect(p.conclusions.some((c) => c.statement.includes('线索较少'))).toBe(true);
  });
});

describe('computeUsageStats 老样子使用统计', () => {
  const templates: MealTemplate[] = [
    { id: 't1', name: '我的老样子', note: '', favorite: true, createdAt: 'x', updatedAt: 'x', latestVersionId: 'v1' },
    { id: 't2', name: '第二份', note: '', favorite: false, createdAt: 'x', updatedAt: 'x', latestVersionId: 'v4' },
  ];
  const versions: MealVersion[] = [
    { id: 'v1', templateId: 't1', parentVersionId: null, snapshot: { items: [{ productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 }] }, changeSummary: '', createdAt: 'x' },
    { id: 'v2', templateId: 't1', parentVersionId: 'v1', snapshot: { items: [{ productCode: 'MC002', productName: '麦辣鸡腿堡套餐', quantity: 1 }] }, changeSummary: '换主食', createdAt: 'x' },
    { id: 'v4', templateId: 't2', parentVersionId: null, snapshot: { items: [{ productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 }] }, changeSummary: '', createdAt: 'x' },
  ];
  const orderAttempts: OrderAttempt[] = [
    { id: 'o1', templateId: 't1', versionId: 'v1', quoteId: 'q', status: 'confirmed', createdAt: 'x' }, // 原版复用
    { id: 'o2', templateId: 't1', versionId: 'v2', quoteId: 'q', status: 'confirmed', createdAt: 'x' }, // 微调复用
    { id: 'o3', templateId: 't1', versionId: 'v2', quoteId: 'q', status: 'pending', createdAt: 'x' }, // 未确认不计
  ];

  it('统计模板数/版本数/复用/原版vs微调', () => {
    const r = computeUsageStats(templates, versions, orderAttempts);
    expect(r.templateCount).toBe(2);
    expect(r.totalVersions).toBe(3);
    expect(r.mostReusedTemplate?.id).toBe('t1');
    expect(r.ratio.originalReuse).toBe(1);
    expect(r.ratio.tweakedReuse).toBe(1);
  });

  it('最常见替换方向来自版本差异', () => {
    const r = computeUsageStats(templates, versions, orderAttempts);
    expect(r.mostCommonReplacement).toBeTruthy();
    expect(r.mostCommonReplacement?.from).toContain('巨无霸');
    expect(r.mostCommonReplacement?.to).toContain('麦辣');
  });
});

describe('diffSnapshots 版本差异', () => {
  it('识别 替换/数量/新增/移除', () => {
    const from: MealItem[] = [
      { productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 },
      { productCode: 'DR01', productName: '可乐', quantity: 1 },
    ];
    const toReplaced: MealItem[] = [
      { productCode: 'MC002', productName: '麦辣鸡腿堡套餐', quantity: 1 },
      { productCode: 'DR01', productName: '可乐', quantity: 1 },
    ];
    const d1 = diffSnapshots(from, toReplaced);
    expect(d1.some((d) => d.kind === 'replaced' && d.fromName === '巨无霸套餐' && d.toName === '麦辣鸡腿堡套餐')).toBe(true);

    const toQty: MealItem[] = [{ productCode: 'MC001', productName: '巨无霸套餐', quantity: 2 }];
    const d2 = diffSnapshots(from, toQty);
    expect(d2.some((d) => d.kind === 'quantity' && d.name === '巨无霸套餐')).toBe(true);
    expect(d2.some((d) => d.kind === 'removed' && d.name === '可乐')).toBe(true);
  });
});

describe('足迹持久化（临时库）', () => {
  it('upsertSyncedOrder 去重：同 orderId 更新而非新增', () => {
    upsertSyncedOrder(makeOrder({ orderId: 'X', ownerType: 'unknown', products: [{ productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 }] }));
    upsertSyncedOrder(makeOrder({ orderId: 'X', ownerType: 'self', products: [{ productCode: 'DR01', productName: '可乐', quantity: 1 }] }));
    const all = getAllSyncedOrders();
    expect(all.length).toBe(1);
    expect(all[0].ownerType).toBe('self');
  });

  it('setOrderOwner 修改归属', () => {
    upsertSyncedOrder(makeOrder({ orderId: 'Y' }));
    setOrderOwner('Y', 'self');
    expect(getAllSyncedOrders()[0].ownerType).toBe('self');
  });

  it('反馈 增/查/删，且字段映射为 camelCase（防 snake_case 回归）', () => {
    const f = saveFeedback('item', 'MC001', 'like', '好吃的');
    const list = listFeedback();
    expect(list.length).toBe(1);
    expect(list[0].targetCode).toBe('MC001');
    expect(list[0].targetType).toBe('item');
    expect(list[0].verdict).toBe('like');
    expect(list[0].createdAt).toBeTruthy();
    deleteFeedback(f.id);
    expect(listFeedback().length).toBe(0);
  });

  it('偏好 get/set 往返', () => {
    setPrefs({ favorites: ['MC001'], exclusions: [], tasteTags: { MC001: ['经典'] }, locks: [] });
    const p = getPrefs();
    expect(p.favorites).toEqual(['MC001']);
    expect(p.tasteTags['MC001']).toEqual(['经典']);
  });

  it('商品锁定 get/set/clear', () => {
    setLock('t1', 'MC001', '最爱');
    expect(getLocks('t1')).toContain('MC001');
    clearLock('t1', 'MC001');
    expect(getLocks('t1')).not.toContain('MC001');
  });

  it('食签缓存 写入/读取/过期', () => {
    setSignCache('k1', { picked: 'a' }, 60_000);
    expect(getSignCache('k1')).toEqual({ picked: 'a' });
    setSignCache('k2', { picked: 'b' }, -1); // 立即过期
    expect(getSignCache('k2')).toBeNull();
  });
});
