// 我的饮食足迹：订单同步、使用统计、历史点餐分析与可解释的口味偏好画像。
// 纯函数（roughCategory / computeOrderAnalytics / buildPreferenceProfile / computeUsageStats）便于测试；
// 其余为基于 SQLite 的持久化与读取封装。

import crypto from 'node:crypto';
import { db, nowISO } from './db.js';
import type {
  MealTemplate,
  MealVersion,
  OrderAttempt,
  MealItem,
} from './types.js';

// ---------------------------------------------------------------------------
// 原始订单模型
// ---------------------------------------------------------------------------
export interface SyncedOrder {
  orderId: string;
  storeCode?: string;
  storeName?: string;
  orderType?: string; // '1' 到店，'2' 外送
  beType?: string;
  createTime?: string;
  orderStatus?: string;
  realTotalAmount?: string;
  products: { productCode: string; productName: string; quantity: number; comboItemList?: { productCode: string; name: string; quantity: number }[] }[];
  ownerType: 'self' | 'shared' | 'proxy' | 'unknown';
  includedItems: { productCode: string; productName: string; quantity: number }[];
  /** 是否为演示数据：演示数据绝不能冒充真实订单，统计时必须单独标注。 */
  isDemo?: boolean;
}

export type OrderVerdict = 'like' | 'neutral' | 'nope' | 'forOthers';

export interface FeedbackRow {
  id: string;
  targetType: 'item' | 'combo' | 'recommendation';
  targetCode: string;
  verdict: OrderVerdict;
  note?: string;
  createdAt: string;
}

export interface PrefsShape {
  favorites: string[];
  exclusions: string[];
  tasteTags: Record<string, string[]>;
  locks: string[];
  /** 用户自设的“一餐能量参考上限”（kcal）。未设置则不给健康评分/红绿灯。 */
  energyRefKcal?: number | null;
}

// ---------------------------------------------------------------------------
// 纯函数：分类 / 时间 / 状态
// ---------------------------------------------------------------------------
export function roughCategory(name: string): '主食' | '饮料' | '小食' | '甜品' | '未知' {
  const n = name || '';
  if (/套餐|汉堡|卷|饭|面|堡/.test(n)) return '主食';
  if (/可乐|雪碧|咖啡|茶|牛奶|豆浆|橙汁|汽水|饮料|饮品|柠/.test(n)) return '饮料';
  if (/薯条|鸡块|鸡翅|玉米|鸡柳|饼干|汤|小食|配餐|麦辣/.test(n)) return '小食';
  if (/冰淇淋|圆筒|圣代|派|甜品|新地/.test(n)) return '甜品';
  return '未知';
}

export function parseCNTime(s?: string): Date | null {
  if (!s) return null;
  // 兼容 "YYYY-MM-DD HH:MM:SS"
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}`);
}

/** 仅“已完成”订单计入消费统计；取消 / 未支付 / 失败 / 异常 / 退款中明确失败的排除。 */
export function isCompletedStatus(status?: string): boolean {
  if (!status) return false;
  if (/取消|未支付|待支付|失败|异常|退款|作废|关闭/.test(status)) return false;
  return true;
}

/** 从 CN 时间字符串中直接取出“北京时间”小时（0-23），避免依赖服务器本地时区。 */
function cnHour(s?: string): number {
  if (!s) return 0;
  const m = s.match(/\d{4}-\d{2}-\d{2}[ T](\d{2}):/);
  return m ? parseInt(m[1], 10) : 0;
}

/** 同步自 MCP order-list 的原始订单 → SyncedOrder（不做口味归属推断） */
export function normalizeRawOrder(o: any): SyncedOrder {
  const products = Array.isArray(o.products) ? o.products : [];
  return {
    orderId: String(o.orderId),
    storeCode: o.storeCode,
    storeName: o.storeName,
    orderType: String(o.orderType ?? ''),
    beType: String(o.beType ?? ''),
    createTime: o.createTime,
    orderStatus: o.orderStatus,
    realTotalAmount: o.realTotalAmount,
    products: products.map((p: any) => ({
      productCode: String(p.productCode),
      productName: p.productName || p.productCode,
      quantity: Number(p.quantity) || 1,
      comboItemList: p.comboItemList ? p.comboItemList.map((c: any) => ({ productCode: String(c.productCode), name: c.name, quantity: Number(c.quantity) || 1 })) : undefined,
    })),
    ownerType: 'unknown',
    includedItems: [],
    isDemo: false,
  };
}

// ---------------------------------------------------------------------------
// 持久化：原始订单 / 同步元信息
// ---------------------------------------------------------------------------
export function upsertSyncedOrder(o: SyncedOrder): void {
  db.prepare(
    `INSERT INTO synced_orders (order_id, store_code, store_name, order_type, be_type, create_time, order_status, real_total_amount, products_json, owner_type, included_items_json, is_demo, sync_at)
     VALUES (@orderId, @storeCode, @storeName, @orderType, @beType, @createTime, @orderStatus, @amount, @products, @owner, @included, @isDemo, @syncAt)
     ON CONFLICT(order_id) DO UPDATE SET store_code=@storeCode, store_name=@storeName, order_type=@orderType, be_type=@beType, create_time=@createTime, order_status=@orderStatus, real_total_amount=@amount, products_json=@products, owner_type=@owner, included_items_json=@included, is_demo=@isDemo, sync_at=@syncAt`
  ).run({
    orderId: o.orderId,
    storeCode: o.storeCode || '',
    storeName: o.storeName || '',
    orderType: o.orderType || '',
    beType: o.beType || '',
    createTime: o.createTime || '',
    orderStatus: o.orderStatus || '',
    amount: o.realTotalAmount ?? '',
    products: JSON.stringify(o.products),
    owner: o.ownerType || 'unknown',
    included: JSON.stringify(o.includedItems),
    isDemo: o.isDemo ? 1 : 0,
    syncAt: nowISO(),
  });
}

export function getAllSyncedOrders(): SyncedOrder[] {
  const rows = db.prepare('SELECT * FROM synced_orders ORDER BY create_time DESC').all() as any[];
  return rows.map((r) => ({
    orderId: r.order_id,
    storeCode: r.store_code,
    storeName: r.store_name,
    orderType: r.order_type,
    beType: r.be_type,
    createTime: r.create_time,
    orderStatus: r.order_status,
    realTotalAmount: r.real_total_amount,
    products: JSON.parse(r.products_json || '[]'),
    ownerType: (r.owner_type || 'unknown') as SyncedOrder['ownerType'],
    includedItems: JSON.parse(r.included_items_json || '[]'),
    isDemo: !!r.is_demo,
  }));
}

/** 是否存在演示数据（用于界面明确标注，绝不与真实订单混为一谈）。 */
export function hasDemoOrders(): boolean {
  const r = db.prepare('SELECT COUNT(*) c FROM synced_orders WHERE is_demo=1').get() as any;
  return (r?.c || 0) > 0;
}

export function setOrderOwner(orderId: string, ownerType: SyncedOrder['ownerType']): void {
  db.prepare('UPDATE synced_orders SET owner_type=? WHERE order_id=?').run(ownerType, orderId);
}

export function setSyncMeta(k: string, v: string): void {
  db.prepare('INSERT INTO order_sync_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=?').run(k, v, v);
}
export function getSyncMeta(k: string): string | null {
  const r = db.prepare('SELECT v FROM order_sync_meta WHERE k=?').get(k) as any;
  return r ? r.v : null;
}

// ---------------------------------------------------------------------------
// 持久化：反馈 / 偏好 / 锁定 / 食签缓存
// ---------------------------------------------------------------------------
export function saveFeedback(targetType: FeedbackRow['targetType'], targetCode: string, verdict: OrderVerdict, note?: string): FeedbackRow {
  const id = crypto.randomUUID();
  const ts = nowISO();
  db.prepare('INSERT INTO feedback (id, target_type, target_code, verdict, note, created_at) VALUES (?,?,?,?,?,?)').run(id, targetType, targetCode, verdict, note || '', ts);
  return { id, targetType, targetCode, verdict, note, createdAt: ts };
}

export function listFeedback(): FeedbackRow[] {
  // 注意：DB 列是 snake_case，必须显式映射为 FeedbackRow 的 camelCase 字段，
  // 否则上层取到的 targetCode 会是 undefined。
  const rows = db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    targetType: r.target_type,
    targetCode: r.target_code,
    verdict: r.verdict,
    note: r.note || undefined,
    createdAt: r.created_at,
  }));
}

export function deleteFeedback(id: string): void {
  db.prepare('DELETE FROM feedback WHERE id=?').run(id);
}

export function getPrefs(): PrefsShape {
  const row = db.prepare("SELECT v FROM prefs WHERE k='prefs'").get() as any;
  if (!row) return { favorites: [], exclusions: [], tasteTags: {}, locks: [] };
  try {
    const p = JSON.parse(row.v);
    return {
      favorites: p.favorites || [],
      exclusions: p.exclusions || [],
      tasteTags: p.tasteTags || {},
      locks: p.locks || [],
      // 未设置时为 undefined：界面不据此给出健康评分或红绿灯
      energyRefKcal: typeof p.energyRefKcal === 'number' ? p.energyRefKcal : undefined,
    };
  } catch {
    return { favorites: [], exclusions: [], tasteTags: {}, locks: [] };
  }
}

export function setPrefs(p: PrefsShape): void {
  const v = JSON.stringify(p);
  db.prepare("INSERT INTO prefs (k, v) VALUES ('prefs', ?) ON CONFLICT(k) DO UPDATE SET v=?").run(v, v);
}

export function getLocks(templateId: string): string[] {
  const rows = db.prepare('SELECT product_code FROM item_locks WHERE template_id=?').all(templateId) as any[];
  return rows.map((r) => r.product_code);
}
export function setLock(templateId: string, productCode: string, reason?: string): void {
  db.prepare('INSERT OR REPLACE INTO item_locks (template_id, product_code, reason) VALUES (?,?,?)').run(templateId, productCode, reason || '');
}
export function clearLock(templateId: string, productCode: string): void {
  db.prepare('DELETE FROM item_locks WHERE template_id=? AND product_code=?').run(templateId, productCode);
}

export function getSignCache(key: string): any | null {
  const r = db.prepare('SELECT value_json, expires_at FROM sign_cache WHERE cache_key=?').get(key) as any;
  if (!r) return null;
  if (r.expires_at && new Date(r.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sign_cache WHERE cache_key=?').run(key);
    return null;
  }
  try {
    return JSON.parse(r.value_json);
  } catch {
    return null;
  }
}
export function setSignCache(key: string, value: any, ttlMs = 24 * 3600 * 1000): void {
  const expires = new Date(Date.now() + ttlMs).toISOString();
  db.prepare('INSERT OR REPLACE INTO sign_cache (cache_key, value_json, created_at, expires_at) VALUES (?,?,?,?)').run(key, JSON.stringify(value), nowISO(), expires);
}

// ---------------------------------------------------------------------------
// 纯函数：历史点餐分析
// ---------------------------------------------------------------------------
export interface OrderAnalytics {
  rangeLabel: string;
  orderCount: number;
  excludedCount: number;
  excluded: { orderId: string; reason: string }[];
  coverageStart?: string;
  coverageEnd?: string;
  byDate: { date: string; count: number }[];
  byHour: { hour: number; count: number }[];
  dineInCount: number;
  deliveryCount: number;
  otherCount: number;
  topProducts: { code: string; name: string; orderCount: number; buyCount: number }[];
  categoryDist: { category: string; count: number }[];
  totalAmount: number;
  avgPerOrder: number;
  newVsRepeat: { type: 'new' | 'repeat'; count: number }[];
  samplesLow: boolean;
}

export function computeOrderAnalytics(orders: SyncedOrder[], rangeDays: number | 'all'): OrderAnalytics {
  const now = Date.now();
  const rangeLabel = rangeDays === 'all' ? '全部可用记录' : `近 ${rangeDays} 天`;
  const filtered = orders.filter((o) => {
    if (rangeDays === 'all') return true;
    const t = parseCNTime(o.createTime);
    return t && now - t.getTime() <= rangeDays * 86400000;
  });

  // 防御性去重（按 orderId 保留首次出现），避免重复订单污染统计。
  // 注意：持久层 upsert 已保证订单唯一，这里再兜一层。
  const seenOrderIds = new Set<string>();
  const deduped = filtered.filter((o) => {
    if (seenOrderIds.has(o.orderId)) return false;
    seenOrderIds.add(o.orderId);
    return true;
  });

  const excluded: { orderId: string; reason: string }[] = [];
  const valid = deduped.filter((o) => {
    if (!isCompletedStatus(o.orderStatus)) {
      excluded.push({ orderId: o.orderId, reason: `状态：${o.orderStatus || '未知'}` });
      return false;
    }
    if (!parseCNTime(o.createTime)) {
      excluded.push({ orderId: o.orderId, reason: '下单时间缺失' });
      return false;
    }
    return true;
  });

  const byDateMap = new Map<string, number>();
  const byHourMap = new Map<number, number>();
  const dineIn = { c: 0 };
  const delivery = { c: 0 };
  const other = { c: 0 };
  const prodOrderCount = new Map<string, { code: string; name: string; orders: Set<string>; buy: number }>();
  const catCount = new Map<string, number>();
  const compCatCount = new Map<string, number>();
  let totalAmount = 0;
  let coverageStart: string | undefined;
  let coverageEnd: string | undefined;
  const seenProductsFirst = new Map<string, boolean>();
  let newCount = 0;
  let repeatCount = 0;

  valid.forEach((o, idx) => {
    const dateStr = o.createTime!.slice(0, 10);
    byDateMap.set(dateStr, (byDateMap.get(dateStr) || 0) + 1);
    byHourMap.set(cnHour(o.createTime), (byHourMap.get(cnHour(o.createTime)) || 0) + 1);
    if (o.orderType === '1') dineIn.c++;
    else if (o.orderType === '2') delivery.c++;
    else other.c++;
    totalAmount += parseFloat(o.realTotalAmount || '0') || 0;
    if (!coverageStart || o.createTime! < coverageStart) coverageStart = o.createTime;
    if (!coverageEnd || o.createTime! > coverageEnd) coverageEnd = o.createTime;

    const orderProductCodes = new Set<string>();
    o.products.forEach((p) => {
      const rec = prodOrderCount.get(p.productCode) || { code: p.productCode, name: p.productName, orders: new Set<string>(), buy: 0 };
      rec.orders.add(o.orderId);
      rec.buy += p.quantity;
      rec.name = p.productName;
      prodOrderCount.set(p.productCode, rec);
      catCount.set(roughCategory(p.productName), (catCount.get(roughCategory(p.productName)) || 0) + 1);
      if (!seenProductsFirst.has(p.productCode)) {
        seenProductsFirst.set(p.productCode, true);
        newCount++;
      } else {
        repeatCount++;
      }
      // 套餐内商品单独分层统计，避免重复计数
      (p.comboItemList || []).forEach((c) => {
        compCatCount.set(roughCategory(c.name), (compCatCount.get(roughCategory(c.name)) || 0) + 1);
      });
    });
    // 仅统计该订单首次出现的商品为“新”，用于 newVsRepeat 的订单级粗略口径
    void orderProductCodes;
  });

  const topProducts = Array.from(prodOrderCount.values())
    .map((r) => ({ code: r.code, name: r.name, orderCount: r.orders.size, buyCount: r.buy }))
    .sort((a, b) => b.orderCount - a.orderCount || b.buyCount - a.buyCount)
    .slice(0, 12);

  const categoryDist = Array.from(catCount.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const byDate = Array.from(byDateMap.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: byHourMap.get(h) || 0 }));

  return {
    rangeLabel,
    orderCount: valid.length,
    excludedCount: excluded.length,
    excluded,
    coverageStart,
    coverageEnd,
    byDate,
    byHour,
    dineInCount: dineIn.c,
    deliveryCount: delivery.c,
    otherCount: other.c,
    topProducts,
    categoryDist,
    totalAmount: Math.round(totalAmount * 100) / 100,
    avgPerOrder: valid.length ? Math.round((totalAmount / valid.length) * 100) / 100 : 0,
    newVsRepeat: [{ type: 'new', count: newCount }, { type: 'repeat', count: repeatCount }],
    samplesLow: valid.length < 3,
  };
}

// ---------------------------------------------------------------------------
// 纯函数：口味偏好画像（显式 + 行为线索）
// ---------------------------------------------------------------------------
export interface PreferenceProfile {
  explicit: {
    favorites: string[];
    exclusions: string[];
    forOthers: string[];
    tasteTags: Record<string, string[]>;
  };
  behavioral: {
    samplesLow: boolean;
    selfOrderCount: number;
    productPrefs: { code: string; name: string; orderCount: number; quantity: number; coverageStart?: string; coverageEnd?: string; basis: 'inferred' }[];
  };
  conclusions: {
    statement: string;
    source: string;
    supportCount: number;
    coverage?: string;
    basis: 'explicit' | 'inferred';
    correctionHint: string;
  }[];
}

export function buildPreferenceProfile(orders: SyncedOrder[], feedbacks: FeedbackRow[], prefs: PrefsShape): PreferenceProfile {
  const favorites = Array.from(new Set([...prefs.favorites, ...feedbacks.filter((f) => f.verdict === 'like').map((f) => f.targetCode)]));
  const exclusions = Array.from(new Set([...prefs.exclusions, ...feedbacks.filter((f) => f.verdict === 'nope').map((f) => f.targetCode)]));
  const forOthers = Array.from(new Set(feedbacks.filter((f) => f.verdict === 'forOthers').map((f) => f.targetCode)));

  const selfOrders = orders.filter((o) => o.ownerType === 'self');
  const samplesLow = selfOrders.length < 3;

  const prodMap = new Map<string, { code: string; name: string; orders: Set<string>; qty: number }>();
  let covStart: string | undefined;
  let covEnd: string | undefined;
  selfOrders.forEach((o) => {
    if (!covStart || (o.createTime || '') < covStart) covStart = o.createTime;
    if (!covEnd || (o.createTime || '') > covEnd) covEnd = o.createTime;
    const codes = o.includedItems.length ? o.includedItems : o.products;
    codes.forEach((p) => {
      const rec = prodMap.get(p.productCode) || { code: p.productCode, name: p.productName, orders: new Set<string>(), qty: 0 };
      rec.orders.add(o.orderId);
      rec.qty += p.quantity;
      rec.name = p.productName;
      prodMap.set(p.productCode, rec);
    });
  });

  const productPrefs = Array.from(prodMap.values())
    .map((r) => ({ code: r.code, name: r.name, orderCount: r.orders.size, quantity: r.qty, coverageStart: covStart, coverageEnd: covEnd, basis: 'inferred' as const }))
    .sort((a, b) => b.orderCount - a.orderCount || b.quantity - a.quantity)
    .slice(0, 12);

  const conclusions: PreferenceProfile['conclusions'] = [];
  if (favorites.length) {
    conclusions.push({
      statement: `你明确喜欢或收藏了 ${favorites.length} 款商品。`,
      source: '主动收藏 / 喜欢反馈',
      supportCount: favorites.length,
      basis: 'explicit',
      correctionHint: '可在“偏好”页取消收藏或改为“不再推荐”。',
    });
  }
  if (exclusions.length) {
    conclusions.push({
      statement: `你已标记 ${exclusions.length} 款商品“不再推荐”（软偏好）。`,
      source: '主动“不再推荐”反馈',
      supportCount: exclusions.length,
      basis: 'explicit',
      correctionHint: '可在“偏好”页移除该排除。',
    });
  }
  if (productPrefs.length) {
    const top = productPrefs[0];
    conclusions.push({
      statement: `在你标记为“自己吃”的 ${selfOrders.length} 笔订单中，出现最多的是「${top.name}」（${top.orderCount} 笔）。`,
      source: '确认自己食用的历史订单',
      supportCount: top.orderCount,
      coverage: covStart ? `${covStart.slice(0, 10)} ~ ${covEnd?.slice(0, 10)}` : undefined,
      basis: 'inferred',
      correctionHint: '这只是历史选择频次，不代表你一定喜欢；可补充明确偏好以覆盖。',
    });
  }
  if (samplesLow) {
    conclusions.push({
      statement: '线索较少：你标记为“自己吃”的订单不足 3 笔，暂不生成精准口味画像。',
      source: '数据量不足',
      supportCount: selfOrders.length,
      basis: 'inferred',
      correctionHint: '可在“偏好”页通过几个简单选择建立初始偏好。',
    });
  }
  if (Object.keys(prefs.tasteTags).length) {
    conclusions.push({
      statement: `已记录 ${Object.keys(prefs.tasteTags).length} 项口味标签（仅来自官方返回或你的主动标注）。`,
      source: '官方标签 / 主动标注',
      supportCount: Object.keys(prefs.tasteTags).length,
      basis: 'explicit',
      correctionHint: '口味标签不会由菜名臆测生成。',
    });
  }

  return {
    explicit: { favorites, exclusions, forOthers, tasteTags: prefs.tasteTags },
    behavioral: { samplesLow, selfOrderCount: selfOrders.length, productPrefs },
    conclusions,
  };
}

// ---------------------------------------------------------------------------
// 纯函数：老样子使用统计
// ---------------------------------------------------------------------------
export interface DiffEntryLite { kind: 'added' | 'removed' | 'replaced' | 'quantity' | 'modification'; fromName?: string; toName?: string; name?: string; category?: string; }

export function diffSnapshots(from: MealItem[], to: MealItem[]): DiffEntryLite[] {
  const fromMap = new Map(from.map((i) => [i.productCode, i]));
  const toMap = new Map(to.map((i) => [i.productCode, i]));
  const out: DiffEntryLite[] = [];
  for (const [code, ti] of toMap) {
    const fi = fromMap.get(code);
    if (!fi) out.push({ kind: 'added', name: ti.productName, category: roughCategory(ti.productName) });
    else if (fi.quantity !== ti.quantity) out.push({ kind: 'quantity', name: ti.productName, category: roughCategory(ti.productName) });
  }
  for (const [code, fi] of fromMap) {
    if (!toMap.has(code)) out.push({ kind: 'removed', name: fi.productName, category: roughCategory(fi.productName) });
  }
  // 替换：同一非套餐槽位被换成不同编码（按出现顺序配对）
  const fr = [...from].filter((i) => !toMap.has(i.productCode));
  const tr = [...to].filter((i) => !fromMap.has(i.productCode));
  const n = Math.min(fr.length, tr.length);
  for (let k = 0; k < n; k++) {
    out.push({ kind: 'replaced', fromName: fr[k].productName, toName: tr[k].productName, category: roughCategory(tr[k].productName) });
  }
  return out;
}

export interface UsageStats {
  templateCount: number;
  totalVersions: number;
  mostReusedTemplate?: { id: string; name: string; reuseCount: number };
  mostKeptMain?: { code: string; name: string; count: number };
  mostReplacedSlot?: { category: string; count: number };
  mostCommonReplacement?: { from: string; to: string; count: number };
  ratio: { originalReuse: number; tweakedReuse: number };
  samplesLow: boolean;
}

export function computeUsageStats(templates: MealTemplate[], versions: MealVersion[], orderAttempts: OrderAttempt[]): UsageStats {
  const totalVersions = versions.length;
  const reuseByTemplate = new Map<string, number>();
  const firstVersionByTemplate = new Map<string, string>();
  for (const v of versions) {
    if (!firstVersionByTemplate.has(v.templateId)) firstVersionByTemplate.set(v.templateId, v.id);
  }
  let originalReuse = 0;
  let tweakedReuse = 0;
  for (const o of orderAttempts) {
    if (o.status !== 'confirmed') continue;
    reuseByTemplate.set(o.templateId, (reuseByTemplate.get(o.templateId) || 0) + 1);
    const firstV = firstVersionByTemplate.get(o.templateId);
    if (o.versionId === firstV) originalReuse++;
    else tweakedReuse++;
  }

  let mostReused: { id: string; name: string; reuseCount: number } | undefined;
  for (const t of templates) {
    const c = reuseByTemplate.get(t.id) || 0;
    if (!mostReused || c > mostReused.reuseCount) mostReused = { id: t.id, name: t.name, reuseCount: c };
  }

  // 最常保留的主食：各模板“最新版本”里出现的 main
  const keptMain = new Map<string, { name: string; count: number }>();
  for (const t of templates) {
    const latest = versions.find((v) => v.id === t.latestVersionId);
    if (!latest) continue;
    for (const it of latest.snapshot.items) {
      if (roughCategory(it.productName) === '主食') {
        const rec = keptMain.get(it.productCode) || { name: it.productName, count: 0 };
        rec.count++;
        keptMain.set(it.productCode, rec);
      }
    }
  }
  let mostKeptMain: { code: string; name: string; count: number } | undefined;
  for (const [code, rec] of keptMain) if (!mostKeptMain || rec.count > mostKeptMain.count) mostKeptMain = { code, name: rec.name, count: rec.count };

  // 最常替换的槽位 & 最常见替换方向：比较每个版本与其父版本
  const byId = new Map(versions.map((v) => [v.id, v]));
  const replacedSlot = new Map<string, number>();
  const replacementDir = new Map<string, number>();
  for (const v of versions) {
    if (!v.parentVersionId) continue;
    const parent = byId.get(v.parentVersionId);
    if (!parent) continue;
    const diff = diffSnapshots(parent.snapshot.items, v.snapshot.items);
    for (const d of diff) {
      if (d.kind === 'replaced') {
        replacedSlot.set(d.category || '未知', (replacedSlot.get(d.category || '未知') || 0) + 1);
        const key = `${d.fromName} → ${d.toName}`;
        replacementDir.set(key, (replacementDir.get(key) || 0) + 1);
      } else if (d.kind === 'removed' || d.kind === 'added') {
        replacedSlot.set(d.category || '未知', (replacedSlot.get(d.category || '未知') || 0) + 1);
      }
    }
  }
  let mostReplacedSlot: { category: string; count: number } | undefined;
  for (const [category, count] of replacedSlot) if (!mostReplacedSlot || count > mostReplacedSlot.count) mostReplacedSlot = { category, count };
  let mostCommonReplacement: { from: string; to: string; count: number } | undefined;
  for (const [key, count] of replacementDir) {
    if (!mostCommonReplacement || count > mostCommonReplacement.count) {
      const [from, to] = key.split(' → ');
      mostCommonReplacement = { from, to, count };
    }
  }

  return {
    templateCount: templates.length,
    totalVersions,
    mostReusedTemplate: mostReused,
    mostKeptMain,
    mostReplacedSlot,
    mostCommonReplacement,
    ratio: { originalReuse, tweakedReuse },
    samplesLow: templates.length === 0,
  };
}
