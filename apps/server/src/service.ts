import crypto from 'node:crypto';
import { db, nowISO } from './db.js';
import { REAL_MODE } from './config.js';
import type {
  MealItem,
  MealSnapshot,
  MealTemplate,
  MealVersion,
  QuoteSnapshot,
  OrderAttempt,
  DiffResult,
  DiffEntry,
  AvailabilityResult,
  AvailabilityItem,
  AppMode,
} from './types.js';
import { callMcpTool } from './mcpClient.js';
import {
  DEMO_STORES,
  DEMO_MENU,
  DEMO_HISTORY_ORDERS,
  DEMO_SEED,
  DEMO_COUPONS,
  DEMO_NUTRITION,
  demoMenuItem,
  type DemoMenuItem,
} from './demoData.js';

export const mode: AppMode = REAL_MODE ? 'real' : 'demo';

function uid(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// 演示数据种子：演示模式且数据库为空时，写入一个示例餐单与两个版本。
// ---------------------------------------------------------------------------
export function seedDemoIfEmpty(): void {
  if (!REAL_MODE) {
    const count = (db.prepare('SELECT COUNT(*) c FROM templates').get() as any).c;
    if (count === 0) {
      for (const seed of DEMO_SEED) {
        const tid = uid();
        const created = nowISO();
        db.prepare(
          'INSERT INTO templates (id,name,note,favorite,created_at,updated_at,latest_version_id) VALUES (?,?,?,?,?,?,?)'
        ).run(tid, seed.name, seed.note, seed.favorite ? 1 : 0, created, created, null);
        let parent: string | null = null;
        let latest = '';
        for (const v of seed.versions) {
          const vid = uid();
          db.prepare(
            'INSERT INTO versions (id,template_id,parent_version_id,snapshot_json,change_summary,created_at) VALUES (?,?,?,?,?,?)'
          ).run(vid, tid, parent, JSON.stringify(v.snapshot), v.changeSummary, created);
          parent = vid;
          latest = vid;
        }
        db.prepare('UPDATE templates SET latest_version_id=? WHERE id=?').run(latest, tid);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 餐单模板 & 版本
// ---------------------------------------------------------------------------
interface TemplateRow {
  id: string;
  name: string;
  note: string;
  favorite: number;
  created_at: string;
  updated_at: string;
  latest_version_id: string | null;
}

function rowToTemplate(r: TemplateRow): MealTemplate {
  return {
    id: r.id,
    name: r.name,
    note: r.note,
    favorite: !!r.favorite,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    latestVersionId: r.latest_version_id || '',
    versionCount: (r as any).version_count ?? 0,
  };
}

export function listTemplates(): MealTemplate[] {
  const rows = db.prepare(
    'SELECT t.*, (SELECT COUNT(*) FROM versions v WHERE v.template_id = t.id) AS version_count FROM templates t ORDER BY t.favorite DESC, t.updated_at DESC'
  ).all() as TemplateRow[];
  return rows.map(rowToTemplate);
}

export function getTemplate(id: string): MealTemplate | null {
  const r = db.prepare('SELECT * FROM templates WHERE id=?').get(id) as TemplateRow | undefined;
  return r ? rowToTemplate(r) : null;
}

export function createTemplate(name: string, note: string, favorite: boolean, snapshot: MealSnapshot): { template: MealTemplate; version: MealVersion } {
  const tid = uid();
  const vid = uid();
  const ts = nowISO();
  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO templates (id,name,note,favorite,created_at,updated_at,latest_version_id) VALUES (?,?,?,?,?,?,?)'
    ).run(tid, name, note, favorite ? 1 : 0, ts, ts, vid);
    db.prepare(
      'INSERT INTO versions (id,template_id,parent_version_id,snapshot_json,change_summary,created_at) VALUES (?,?,?,?,?,?)'
    ).run(vid, tid, null, JSON.stringify(snapshot), '最初那一版', ts);
    db.prepare('UPDATE templates SET latest_version_id=? WHERE id=?').run(vid, tid);
  });
  tx();
  return { template: getTemplate(tid)!, version: getVersion(vid)! };
}

export function updateTemplateMeta(id: string, patch: { name?: string; note?: string; favorite?: boolean }): MealTemplate | null {
  const t = getTemplate(id);
  if (!t) return null;
  const name = patch.name ?? t.name;
  const note = patch.note ?? t.note;
  const favorite = patch.favorite ?? t.favorite;
  db.prepare('UPDATE templates SET name=?, note=?, favorite=?, updated_at=? WHERE id=?').run(
    name,
    note,
    favorite ? 1 : 0,
    nowISO(),
    id
  );
  return getTemplate(id);
}

export function deleteTemplate(id: string): boolean {
  const r = db.prepare('DELETE FROM templates WHERE id=?').run(id);
  return r.changes > 0;
}

interface VersionRow {
  id: string;
  template_id: string;
  parent_version_id: string | null;
  snapshot_json: string;
  change_summary: string;
  created_at: string;
}

function rowToVersion(r: VersionRow): MealVersion {
  return {
    id: r.id,
    templateId: r.template_id,
    parentVersionId: r.parent_version_id,
    snapshot: JSON.parse(r.snapshot_json),
    changeSummary: r.change_summary,
    createdAt: r.created_at,
  };
}

export function listVersions(templateId: string): MealVersion[] {
  const rows = db.prepare('SELECT * FROM versions WHERE template_id=? ORDER BY created_at ASC').all(templateId) as VersionRow[];
  return rows.map(rowToVersion);
}

export function getVersion(id: string): MealVersion | null {
  const r = db.prepare('SELECT * FROM versions WHERE id=?').get(id) as VersionRow | undefined;
  return r ? rowToVersion(r) : null;
}

/** 创建新版本（不可变）：保留父版本与修改说明，不覆盖旧版。 */
export function createVersion(
  templateId: string,
  snapshot: MealSnapshot,
  changeSummary: string,
  parentVersionId: string | null
): MealVersion | null {
  const t = getTemplate(templateId);
  if (!t) return null;
  const vid = uid();
  const ts = nowISO();
  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO versions (id,template_id,parent_version_id,snapshot_json,change_summary,created_at) VALUES (?,?,?,?,?,?)'
    ).run(vid, templateId, parentVersionId ?? t.latestVersionId, JSON.stringify(snapshot), changeSummary || '未填写说明', ts);
    db.prepare('UPDATE templates SET latest_version_id=?, updated_at=? WHERE id=?').run(vid, ts, templateId);
  });
  tx();
  return getVersion(vid);
}

/** “用回这一版”：从旧版本恢复出一个新的草稿/版本，绝不操作任何真实交易。 */
export function restoreVersion(versionId: string, changeSummary?: string): MealVersion | null {
  const v = getVersion(versionId);
  if (!v) return null;
  const summary = changeSummary || `用回「${v.changeSummary || '旧版本'}」`;
  return createVersion(v.templateId, v.snapshot, summary, versionId);
}

// ---------------------------------------------------------------------------
// 差异对比
// ---------------------------------------------------------------------------
function itemsKey(i: MealItem): string {
  return i.productCode;
}

export function computeDiff(from: MealSnapshot, to: MealSnapshot): DiffResult {
  const entries: DiffEntry[] = [];
  const fromMap = new Map(from.items.map((i) => [itemsKey(i), i]));
  const toMap = new Map(to.items.map((i) => [itemsKey(i), i]));

  for (const [code, ti] of toMap) {
    const fi = fromMap.get(code);
    if (!fi) {
      entries.push({ kind: 'added', productCode: code, productName: ti.productName, detail: `新增：${ti.productName} ×${ti.quantity}` });
    } else if (fi.quantity !== ti.quantity) {
      entries.push({
        kind: 'quantity',
        productCode: code,
        productName: ti.productName,
        detail: `数量变化：${fi.productName} ${fi.quantity} → ${ti.quantity}`,
      });
    } else if (JSON.stringify(fi.comboItemList || []) !== JSON.stringify(ti.comboItemList || [])) {
      entries.push({ kind: 'replaced', productCode: code, productName: ti.productName, detail: `套餐组成变化：${ti.productName}` });
    } else if (JSON.stringify(fi.modification || {}) !== JSON.stringify(ti.modification || {})) {
      entries.push({ kind: 'modification', productCode: code, productName: ti.productName, detail: `特制选项变化：${ti.productName}` });
    }
  }

  for (const [code, fi] of fromMap) {
    if (!toMap.has(code)) {
      entries.push({ kind: 'removed', productCode: code, productName: fi.productName, detail: `移除：${fi.productName} ×${fi.quantity}` });
    }
  }

  const kinds = entries.map((e) => e.kind);
  const summary = `新增 ${kinds.filter((k) => k === 'added').length} · 移除 ${kinds.filter((k) => k === 'removed').length} · 替换 ${kinds.filter((k) => k === 'replaced').length} · 数量 ${kinds.filter((k) => k === 'quantity').length} · 特制 ${kinds.filter((k) => k === 'modification').length}`;
  return { fromVersionId: '', toVersionId: '', entries, summary };
}

export function diffVersions(fromVersionId: string, toVersionId: string): DiffResult {
  const from = getVersion(fromVersionId);
  const to = getVersion(toVersionId);
  if (!from || !to) throw new Error('版本不存在');
  const r = computeDiff(from.snapshot, to.snapshot);
  r.fromVersionId = fromVersionId;
  r.toVersionId = toVersionId;
  return r;
}

// ---------------------------------------------------------------------------
// 门店 / 菜单 / 餐品详情
// ---------------------------------------------------------------------------
export async function getStores(params: { beType: number; city?: string; keyword?: string }): Promise<any> {
  if (!REAL_MODE) {
    let stores = DEMO_STORES.filter((s) => s.beTypes.includes(params.beType));
    if (params.keyword) stores = stores.filter((s) => s.storeName.includes(params.keyword!));
    return { demo: true, stores: stores.map((s) => ({ storeCode: s.storeCode, storeName: s.storeName, city: s.city, beTypes: s.beTypes })) };
  }
  // searchType=1 查收藏/常用餐厅（无需位置即可返回）；带了城市/关键词时改用按位置搜索。
  const searchType = params.city || params.keyword ? 2 : 1;
  const data: any = await callMcpTool('query-nearby-stores', {
    beType: params.beType,
    searchType,
    city: params.city || '',
    keyword: params.keyword || '',
  });
  const list = Array.isArray(data) ? data : data?.list || data?.stores || [];
  return {
    demo: false,
    stores: list.map((s: any) => ({
      storeCode: s.storeCode,
      storeName: s.storeName,
      beCode: s.beCode,
      address: s.address,
      distance: s.distance,
      reservation: s.reservation,
      city: params.city || '',
      beType: params.beType,
    })),
  };
}

export async function getMenu(params: { storeCode: string; orderType: number; beType: number; beCode?: string }): Promise<any> {
  if (!REAL_MODE) {
    return {
      demo: true,
      storeCode: params.storeCode,
      items: DEMO_MENU.map((m) => ({
        productCode: m.productCode,
        productName: m.productName,
        price: m.price,
        category: m.category,
        isCombo: m.isCombo,
        comboItemList: m.comboItemList,
        modifications: m.modifications,
      })),
    };
  }
  const data: any = await callMcpTool('query-meals', {
    storeCode: params.storeCode,
    orderType: params.orderType,
    beType: params.beType,
    beCode: params.beCode || '',
  });
  // 真实接口会明确返回失败（例如非营业时间 code=600057「门店可能已关闭或不在营业时间」）。
  // 这里如实上报，绝不伪装成“空菜单”。
  if (data && data.success === false) {
    return {
      demo: false,
      storeCode: params.storeCode,
      items: [],
      unavailable: true,
      code: data.code,
      message: data.message || '当前门店菜单暂不可用',
    };
  }
  // 真实返回：data.categories[].meals[] 为分类餐品，data.meals{code: 详情} 为详情映射。
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const mealsMap = data?.meals && typeof data.meals === 'object' ? data.meals : {};
  const items: any[] = [];
  for (const cat of categories) {
    const meals = Array.isArray(cat?.meals) ? cat.meals : [];
    for (const meal of meals) {
      const code = meal?.code;
      const detail = code ? mealsMap[code] || {} : {};
      items.push({
        productCode: code,
        productName: detail?.name || meal?.name || code,
        price: parseFloat(detail?.currentPrice || detail?.price || meal?.price || '0') || 0,
        category: cat?.name || '',
        isCombo: Array.isArray(detail?.tags) ? detail.tags.some((t: string) => /套餐/.test(t)) : false,
        image: detail?.image || '',
        tags: detail?.tags || meal?.tags || [],
      });
    }
  }
  return { demo: false, storeCode: params.storeCode, items };
}

export async function getMealDetail(params: { storeCode: string; orderType: number; beType: number; code: string; beCode?: string }): Promise<any> {
  if (!REAL_MODE) {
    const m = demoMenuItem(params.code);
    return { demo: true, code: params.code, detail: m || null };
  }
  const data = await callMcpTool('query-meal-detail', {
    storeCode: params.storeCode,
    orderType: params.orderType,
    beType: params.beType,
    code: params.code,
    beCode: params.beCode || '',
  });
  return { demo: false, code: params.code, detail: data };
}

// ---------------------------------------------------------------------------
// 官方营养资料（list-nutrition-foods）
// ---------------------------------------------------------------------------

/**
 * 拉取官方营养资料。该工具无入参。
 * 真实接口返回的是“被描述性文本包裹的 JSON”：外层是 markdown 说明，里面的
 * { success, code, message, data } 中 data 才是真正的纯文本营养表（形如
 * `[160]{productName,...}:\n  中薯条,null,1210,...`）。callMcpToolText 会拿到
 * 外层 markdown 导致解析失败，因此这里走结构化通道取 data 内层字符串，交由
 * nutrition 模块按真实表头解析，绝不臆造字段。
 */
export async function getNutritionFoods(): Promise<{ demo: boolean; text: string }> {
  if (!REAL_MODE) {
    // 演示模式返回与官方同构的演示表（虚构数据，界面必须标注“演示数据”）
    return { demo: true, text: demoNutritionText() };
  }
  const res = await callMcpTool('list-nutrition-foods', {});
  const text = typeof res === 'string' ? res : res?.data ?? '';
  return { demo: false, text: typeof text === 'string' ? text : JSON.stringify(text ?? '') };
}

function demoNutritionText(): string {
  const rows = DEMO_NUTRITION.map(
    (r) =>
      [
        r.productName,
        'null',
        r.energyKj ?? 'null',
        r.energyKcal ?? 'null',
        r.protein ?? 'null',
        r.fat ?? 'null',
        r.carbohydrate ?? 'null',
        r.sodium ?? 'null',
        r.calcium ?? 'null',
      ].join(',')
  );
  return `[${DEMO_NUTRITION.length}]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:\n${rows.join('\n')}`;
}

// ---------------------------------------------------------------------------
// 门店优惠券（query-store-coupons）
// ---------------------------------------------------------------------------

/**
 * 查询当前门店 + 就餐方式下可用的优惠券。
 * 真实返回是数组：[{ title, couponId, couponCode, tradeDateTime, products:[...], promotionId }]
 * 注意：接口不返回“优惠金额”，金额必须由 calculate-price 实际核价得出，绝不自行推算。
 */
export async function getStoreCoupons(params: {
  storeCode: string;
  orderType: number;
  beType: number;
}): Promise<{ demo: boolean; coupons: any[]; unavailable?: boolean; message?: string }> {
  if (!REAL_MODE) {
    // 演示券也按适用就餐方式过滤，保持与真实场景一致（真实场景由接口筛好）
    const list = DEMO_COUPONS.filter((c) => !c.orderTypes || c.orderTypes.includes(params.orderType));
    return { demo: true, coupons: list };
  }
  try {
    const data = await callMcpTool('query-store-coupons', {
      storeCode: params.storeCode,
      orderType: params.orderType,
      beType: params.beType,
    });
    if (data && data.success === false) {
      return { demo: false, coupons: [], unavailable: true, message: data.message || '当前门店优惠券暂不可用' };
    }
    const list = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : [];
    return { demo: false, coupons: list };
  } catch (e: any) {
    // 接口不可用是正常结果，如实上报，绝不伪造优惠券。
    return { demo: false, coupons: [], unavailable: true, message: e?.message || '查询优惠券失败' };
  }
}

// ---------------------------------------------------------------------------
// 历史订单
// ---------------------------------------------------------------------------
export async function getHistoryOrders(): Promise<{ demo: boolean; orders: any[] }> {
  if (!REAL_MODE) {
    return {
      demo: true,
      orders: DEMO_HISTORY_ORDERS.map((o) => ({
        orderId: o.orderId,
        orderType: o.orderType,
        createTime: o.createTime,
        beType: o.beType,
        storeCode: o.storeCode,
        storeName: o.storeName,
        orderStatus: o.orderStatus,
        realTotalAmount: o.realTotalAmount,
        products: o.orderProductList.map((p) => ({ productCode: p.productCode, productName: p.productName, quantity: p.quantity })),
      })),
    };
  }
  const data = await callMcpTool('order-list', {});
  const list = Array.isArray(data) ? data : data?.list || [];
  return {
    demo: false,
    orders: list.map((o: any) => ({
      orderId: o.orderId,
      orderType: String(o.orderType),
      createTime: o.createTime,
      beType: String(o.beType),
      storeCode: o.storeCode,
      storeName: o.storeName,
      orderStatus: o.orderStatus,
      realTotalAmount: o.realTotalAmount,
      products: (o.orderProductList || []).map((p: any) => ({
        productCode: p.productCode,
        productName: p.productName,
        quantity: p.quantity,
        comboItemList: (p.comboItemList || []).map((c: any) => ({ productCode: c.productCode, name: c.name, quantity: c.quantity })),
      })),
    })),
  };
}

/** 从历史订单导入为餐单模板（不复制手机号/地址/支付信息，历史编码仅作来源参考）。 */
export async function importOrderAsTemplate(orderId: string): Promise<{ template: MealTemplate; version: MealVersion } | null> {
  let order: any = null;
  if (REAL_MODE) {
    const { orders } = await getHistoryOrders();
    order = orders.find((o) => o.orderId === orderId);
  } else {
    order = DEMO_HISTORY_ORDERS.find((o) => o.orderId === orderId);
  }
  if (!order) return null;
  // 真实模式的历史订单字段为 products；演示模式为 orderProductList。统一取用。
  const products: any[] = (order as any).orderProductList || (order as any).products || [];
  const snapshot: MealSnapshot = {
    storeCode: order.storeCode,
    storeName: order.storeName,
    orderType: parseInt(order.orderType, 10) || 1,
    beType: parseInt(order.beType, 10) || 1,
    historicalAmount: parseFloat(order.realTotalAmount) || null,
    items: products.map((p: MealItem) => ({
      productCode: p.productCode,
      productName: p.productName,
      quantity: p.quantity,
      comboItemList: p.comboItemList,
      source: { orderId: order.orderId, isHistory: true },
    })),
  };
  const name = `${order.storeName || '我的'}老样子`;
  return createTemplate(name, '从历史订单保存', false, snapshot);
}

// ---------------------------------------------------------------------------
// 可售性检查
// ---------------------------------------------------------------------------
export async function checkAvailability(snapshot: MealSnapshot, storeCode: string, orderType: number, beType: number): Promise<AvailabilityResult> {
  const items: AvailabilityItem[] = [];
  let allSellable = true;

  if (!REAL_MODE) {
    for (const it of snapshot.items) {
      const m = demoMenuItem(it.productCode);
      const sellable = !!m;
      if (!sellable) allSellable = false;
      items.push({ productCode: it.productCode, productName: it.productName, sellable, reason: sellable ? undefined : '演示菜单中未包含该商品' });
    }
  } else {
    const menu = await getMenu({ storeCode, orderType, beType });
    const codes = new Set((menu.items || []).map((m: any) => m.productCode));
    for (const it of snapshot.items) {
      // 菜单不可用时（如非营业时间）不能断定“不可售”，需如实说明原因。
      const sellable = menu.unavailable ? false : codes.has(it.productCode);
      if (!sellable) allSellable = false;
      items.push({
        productCode: it.productCode,
        productName: it.productName,
        sellable,
        reason: menu.unavailable
          ? menu.message || '当前门店菜单暂不可用'
          : '当前门店菜单未包含该商品（历史编码可能已变更）',
      });
    }
    if (menu.unavailable) return { storeCode, orderType, beType, items, allSellable, unavailable: true };
  }

  return { storeCode, orderType, beType, items, allSellable };
}

// ---------------------------------------------------------------------------
// 报价（核价）
// ---------------------------------------------------------------------------
function signatureFor(storeCode: string, orderType: number, beType: number, items: MealItem[]): string {
  const norm = items
    .map((i) => `${i.productCode}:${i.quantity}:${(i.comboItemList || []).map((c) => `${c.productCode}x${c.quantity}`).join(',')}:${(i.modification?.values || []).map((m) => `${m.code}=${m.quantity}`).join(',')}`)
    .join('|');
  const raw = `${storeCode}|${orderType}|${beType}|${norm}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * 转成核价入参。若商品上挂了优惠券编码/券 id，则一并提交，
 * 由 calculate-price 实际算出“用券后”的金额（不本地推算优惠额）。
 */
function toMcpItems(items: MealItem[]) {
  return items.map((it) => ({
    productCode: it.productCode,
    quantity: it.quantity,
    modification: it.modification,
    ...(it.couponCode ? { couponCode: it.couponCode } : {}),
    ...(it.couponId ? { couponId: it.couponId } : {}),
    roundList: it.comboItemList
      ? it.comboItemList.map((c, i) => ({ round: String(i + 1), comboItemList: [{ code: c.productCode, quantity: c.quantity }] }))
      : undefined,
  }));
}

/** 演示模式下按演示券模拟优惠金额（真实模式绝不走这里，金额一律来自 calculate-price）。 */
function demoCouponDiscount(items: MealItem[]): number {
  let cut = 0;
  const seen = new Set<string>();
  for (const it of items) {
    if (!it.couponCode || seen.has(it.couponCode)) continue;
    seen.add(it.couponCode);
    const c = DEMO_COUPONS.find((x) => x.couponCode === it.couponCode);
    if (c) cut += c.demoDiscountYuan;
  }
  return cut;
}

export async function createQuote(input: {
  versionId: string;
  storeCode: string;
  storeName?: string;
  orderType: number;
  beType: number;
  items: MealItem[];
}): Promise<{ quote: QuoteSnapshot; takeWayList?: any[]; demo: boolean; priceUnavailable?: boolean; priceMessage?: string }> {
  const v = getVersion(input.versionId);
  if (!v) throw new Error('版本不存在');
  const signature = signatureFor(input.storeCode, input.orderType, input.beType, input.items);

  let amount = 0;
  let takeWayList: any[] | undefined;
  let demo = !REAL_MODE;
  let priceUnavailable = false;
  let priceMessage: string | undefined;

  if (!REAL_MODE) {
    amount = input.items.reduce((sum, it) => {
      const m = demoMenuItem(it.productCode);
      return sum + (m ? m.price : 0) * it.quantity;
    }, 0);
  } else {
    const data = await callMcpTool('calculate-price', {
      storeCode: input.storeCode,
      orderType: input.orderType,
      beType: input.beType,
      items: toMcpItems(input.items),
    });
    // 真实返回：成功时 data 为 { price: <分>, takeWayList, ... }；失败时 data 为 { success:false, message }。
    // data.price 以“分”为单位（如 1590 表示 ¥15.90），需除以 100。
    // 若接口明确失败（如促销/赠品不可单独核价、已售罄），则标记为价格暂不可用，绝不伪造金额。
    const priceRaw = data?.price;
    const priceAvailable = data?.success !== false && priceRaw != null;
    amount = priceAvailable ? Number(priceRaw) / 100 : 0;
    takeWayList = data?.takeWayList;
    if (!priceAvailable) {
      priceUnavailable = true;
      priceMessage = data?.message || '当前商品暂无法单独核价（可能已售罄或需搭配购买）';
    }
  }

  const quoteId = uid();
  const ts = nowISO();
  db.prepare(
    'INSERT INTO quotes (id,template_id,version_id,store_code,store_name,order_type,be_type,amount,currency,quoted_at,signature) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(quoteId, v.templateId, input.versionId, input.storeCode, input.storeName || '', input.orderType, input.beType, amount, 'CNY', ts, signature);

  const quote: QuoteSnapshot = {
    id: quoteId,
    templateId: v.templateId,
    versionId: input.versionId,
    storeCode: input.storeCode,
    storeName: input.storeName || '',
    orderType: input.orderType,
    beType: input.beType,
    amount,
    currency: 'CNY',
    quotedAt: ts,
    signature,
  };
  return { quote, takeWayList, demo, priceUnavailable, priceMessage };
}

/**
 * 试算：对任意餐品组合做一次核价（不落库、不创建报价记录、绝不创建订单）。
 * 用于随机来一份 / 今日食签推荐结果的最终核价，确保金额来自真实接口。
 */
export async function previewPrice(input: {
  items: MealItem[];
  storeCode: string;
  orderType: number;
  beType: number;
}): Promise<{ amount: number; demo: boolean; priceUnavailable?: boolean; priceMessage?: string }> {
  if (!REAL_MODE) {
    const gross = input.items.reduce((sum, it) => {
      const m = demoMenuItem(it.productCode);
      return sum + (m ? m.price : 0) * it.quantity;
    }, 0);
    // 演示模式没有真实核价服务，优惠额按演示券模拟（界面标注“演示数据”）。
    const amount = Math.max(0, Math.round((gross - demoCouponDiscount(input.items)) * 100) / 100);
    return { amount, demo: true };
  }
  const data = await callMcpTool('calculate-price', {
    storeCode: input.storeCode,
    orderType: input.orderType,
    beType: input.beType,
    items: toMcpItems(input.items),
  });
  const priceRaw = data?.price;
  const priceAvailable = data?.success !== false && priceRaw != null;
  return {
    amount: priceAvailable ? Number(priceRaw) / 100 : 0,
    demo: false,
    priceUnavailable: !priceAvailable,
    priceMessage: priceAvailable ? undefined : data?.message || '当前商品暂无法核价（可能已售罄或需搭配购买）',
  };
}

/** 判断给定报价是否仍然有效（门店/就餐方式/餐品未变化）。 */
export function isQuoteValid(quoteId: string, currentSignature: string): boolean {
  const q = db.prepare('SELECT signature FROM quotes WHERE id=?').get(quoteId) as any;
  if (!q) return false;
  return q.signature === currentSignature;
}

export function getQuote(quoteId: string): QuoteSnapshot | null {
  const r = db.prepare('SELECT * FROM quotes WHERE id=?').get(quoteId) as any;
  if (!r) return null;
  return {
    id: r.id,
    templateId: r.template_id,
    versionId: r.version_id,
    storeCode: r.store_code,
    storeName: r.store_name,
    orderType: r.order_type,
    beType: r.be_type,
    amount: r.amount,
    currency: r.currency,
    quotedAt: r.quoted_at,
    signature: r.signature,
  };
}

// ---------------------------------------------------------------------------
// 下单（仅在用户确认后）。防重复提交；结果不明不自动重试。
// ---------------------------------------------------------------------------
const orderLocks = new Map<string, Promise<any>>();

export async function createOrderAttempt(input: {
  quoteId: string;
  items: MealItem[];
  storeCode: string;
  storeName?: string;
  orderType: number;
  beType: number;
  takeWayCode?: string;
  addressId?: string;
  remark?: string;
  needTableware?: boolean;
}): Promise<{ attempt: OrderAttempt; paymentUrl?: string; demo: boolean }> {
  const quote = getQuote(input.quoteId);
  if (!quote) throw new Error('报价不存在，请重新核价');

  // 防重复提交：同一报价已有进行中/已提交/已确认的下单尝试则拒绝。
  const existing = db
    .prepare("SELECT * FROM orders WHERE quote_id=? AND status IN ('pending','submitted','confirmed') ORDER BY created_at DESC LIMIT 1")
    .get(input.quoteId) as any;
  if (existing) {
    const attempt = rowToOrder(existing);
    return { attempt, paymentUrl: attempt.paymentUrl, demo: !REAL_MODE };
  }

  // 并发锁：同一报价同一时刻只允许一个下单请求。
  if (orderLocks.has(input.quoteId)) {
    return orderLocks.get(input.quoteId)!;
  }

  const run = async (): Promise<{ attempt: OrderAttempt; paymentUrl?: string; demo: boolean }> => {
    try {
      const attemptId = uid();
      const ts = nowISO();
      db.prepare(
        "INSERT INTO orders (id,template_id,version_id,quote_id,status,created_at) VALUES (?,?,?,?,?,?)"
      ).run(attemptId, quote.templateId, quote.versionId, input.quoteId, 'pending', ts);

      if (!REAL_MODE) {
        // 演示模式：绝不创建真实订单，也不返回伪造支付链接。
        db.prepare("UPDATE orders SET status='confirmed', confirmed_at=?, note=? WHERE id=?").run(nowISO(), '演示数据，未产生真实订单', attemptId);
        const attempt = getOrderAttempt(attemptId)!;
        return { attempt, demo: true };
      }

      const data = await callMcpTool('create-order', {
        storeCode: input.storeCode,
        orderType: input.orderType,
        beType: input.beType,
        items: toMcpItems(input.items),
        takeWayCode: input.orderType === 1 ? input.takeWayCode : undefined,
        addressId: input.orderType === 2 ? input.addressId : undefined,
        remark: input.orderType === 2 ? input.remark : undefined,
        needTableware: input.needTableware,
      });

      const remoteOrderId = data?.orderId || data?.orderNo;
      const paymentUrl = data?.payUrl || data?.paymentUrl || data?.payUrlString;
      db.prepare(
        "UPDATE orders SET status='confirmed', confirmed_at=?, remote_order_id=?, payment_url=?, note=? WHERE id=?"
      ).run(nowISO(), remoteOrderId || null, paymentUrl || null, '已创建真实订单', attemptId);

      const attempt = getOrderAttempt(attemptId)!;
      return { attempt, paymentUrl: attempt.paymentUrl, demo: false };
    } catch (e: any) {
      // 结果不明：不自动重试，标记为 unknown，由用户/前端调用 verify 核实。
      const msg = e?.message || String(e);
      const current = db.prepare("SELECT id FROM orders WHERE quote_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1").get(input.quoteId) as any;
      if (current) {
        db.prepare("UPDATE orders SET status='unknown', note=? WHERE id=?").run('下单结果不明：' + msg, current.id);
      }
      const attempt = current ? getOrderAttempt(current.id)! : null;
      return { attempt: attempt || ({ id: 'unknown', status: 'unknown', note: msg } as OrderAttempt), demo: false };
    } finally {
      orderLocks.delete(input.quoteId);
    }
  };

  const p = run();
  orderLocks.set(input.quoteId, p);
  return p;
}

function rowToOrder(r: any): OrderAttempt {
  return {
    id: r.id,
    templateId: r.template_id,
    versionId: r.version_id,
    quoteId: r.quote_id,
    status: r.status,
    remoteOrderId: r.remote_order_id,
    paymentUrl: r.payment_url,
    createdAt: r.created_at,
    confirmedAt: r.confirmed_at,
    note: r.note,
  };
}

export function getOrderAttempt(id: string): OrderAttempt | null {
  const r = db.prepare('SELECT * FROM orders WHERE id=?').get(id) as any;
  return r ? rowToOrder(r) : null;
}

/** 全部下单尝试（用于“老样子使用统计”计算原版/微调复用次数）。 */
export function listOrderAttempts(): OrderAttempt[] {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at ASC').all() as any[];
  return rows.map(rowToOrder);
}

/** 下单结果不明时，用远端订单号核实状态，不盲目重试。 */
export async function verifyOrder(remoteOrderId: string): Promise<any> {
  if (!REAL_MODE) {
    return { demo: true, remoteOrderId, status: '已确认（演示）' };
  }
  const data = await callMcpTool('query-order', { orderId: remoteOrderId });
  return { demo: false, remoteOrderId, data };
}
