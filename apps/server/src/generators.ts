// 生成器编排层：把纯函数模块（catalog / constraints / tweak / randomPicker / foodSign / footprint）
// 与真实 MCP 数据（菜单、可售性、餐品详情、历史订单）组装起来。
//
// 设计原则：
//  - 纯模块本身绝不调用 MCP；所有 I/O 在这一层完成，把结果注入纯模块；
//  - 候选集合在本地确定性构建，“换一个/换一份”只推进种子，不反复调用 MCP；
//  - 演示数据与真实接口数据严格区分（isDemo），演示数据不冒充真实订单；
//  - 任何一步不产生真实订单或支付。

import crypto from 'node:crypto';
import {
  getMenu,
  getMealDetail,
  checkAvailability,
  getHistoryOrders,
  listTemplates,
  listVersions,
  getVersion,
  listOrderAttempts,
  getNutritionFoods,
  getStoreCoupons,
  previewPrice,
} from './service.js';
import {
  getNutritionIndex,
  hasRealNutritionCache,
  setNutritionCacheFromText,
  computeMealNutrition,
  type NutritionRow,
} from './nutrition.js';
import { generateLighterPlans, GOAL_LABEL, type LighterGoal } from './lighter.js';
import { parseStoreCoupons, evaluateCouponPlans, type AnnotatedCoupon } from './coupons.js';
import { classify, totalPrice, type CatalogItem } from './catalog.js';
import { generateTweakPlans, type DetailProvider } from './tweak.js';
import { generateRandom, type RandomInput } from './randomPicker.js';
import {
  generateDailySign,
  type SignPreference,
  type SignIntent,
  type MealPeriod,
} from './foodSign.js';
import {
  getAllSyncedOrders,
  upsertSyncedOrder,
  normalizeRawOrder,
  setSyncMeta,
  getSyncMeta,
  getPrefs,
  getLocks,
  hasDemoOrders,
  computeOrderAnalytics,
  computeUsageStats,
  buildPreferenceProfile,
  listFeedback,
  getSignCache,
  setSignCache,
} from './footprint.js';
import { nowISO, db } from './db.js';
import { REAL_MODE } from './config.js';
import type { MealItem } from './types.js';

// ---------------------------------------------------------------------------
// 基础组装：目录 / 可售集合 / 套餐详情供应器
// ---------------------------------------------------------------------------

/**
 * 目录缓存：同一门店/就餐方式的菜单在短时间内复用（默认 5 分钟）。
 * 目的：随机“换一个”、食签“换一份灵感”只推进本地种子抽取，不反复调用 MCP。
 */
const catalogCache = new Map<string, { at: number; items: CatalogItem[] }>();
const CATALOG_TTL_MS = 5 * 60 * 1000;

/** 组装门店目录（来自该门店菜单，价格即该门店当前价）。 */
export async function buildCatalog(
  storeCode: string,
  orderType: number,
  beType: number
): Promise<CatalogItem[]> {
  const key = `${storeCode}|${orderType}|${beType}`;
  const hit = catalogCache.get(key);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.items;

  const menu = await getMenu({ storeCode, orderType, beType });
  // 菜单不可用（如非营业时间）：如实抛出，交由上层提示，绝不拿空目录假装没东西可推荐。
  if (menu?.unavailable) {
    throw new Error(menu.message || '当前门店菜单暂不可用（可能不在营业时间）');
  }
  const items: any[] = Array.isArray(menu?.items) ? menu.items : [];
  const mapped = items.map((m: any) => ({
    productCode: String(m.productCode),
    productName: m.productName || String(m.productCode),
    price: Number(m.price) || 0,
    category: m.category || '',
    isCombo: !!m.isCombo,
    image: m.image || '',
    comboItemList: Array.isArray(m.comboItemList)
      ? m.comboItemList.map((c: any) => ({
          productCode: String(c.productCode),
          name: c.name || c.productName || '',
          quantity: Number(c.quantity) || 1,
        }))
      : undefined,
    modifications: Array.isArray(m.modifications) ? m.modifications : undefined,
    tags: Array.isArray(m.tags) ? m.tags : undefined,
  }));
  catalogCache.set(key, { at: Date.now(), items: mapped });
  return mapped;
}

/** 可售集合：出现在该门店菜单中的商品即视为可售（历史编码不在菜单中则不可售）。 */
export function sellableSetFromCatalog(catalog: CatalogItem[]): Set<string> {
  return new Set(catalog.map((c) => c.productCode));
}

/** 从任意结构的餐品详情中防御性地收集 {code,name} 对（真实接口结构以实际返回为准）。 */
function collectCodeNamePairs(root: any, maxNodes = 400): { code: string; name: string }[] {
  const out: { code: string; name: string }[] = [];
  const seen = new Set<any>();
  const stack: any[] = [root];
  let nodes = 0;
  while (stack.length > 0 && nodes < maxNodes) {
    const cur = stack.pop();
    nodes++;
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }
    const code = cur.code ?? cur.productCode ?? cur.itemCode;
    const name = cur.name ?? cur.productName ?? cur.itemName;
    if (code != null && name != null) out.push({ code: String(code), name: String(name) });
    for (const v of Object.values(cur)) {
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return out;
}

/** 从套餐详情中提取可替换的饮料/小食槽位候选；结构无法识别时返回空（不臆测）。 */
function extractComboOptions(detail: any, catalog: CatalogItem[]): { drink: string[]; snack: string[] } {
  const pairs = collectCodeNamePairs(detail);
  const drink: string[] = [];
  const snack: string[] = [];
  for (const p of pairs) {
    const known = catalog.find((c) => c.productCode === p.code);
    const probe: CatalogItem = known || { productCode: p.code, productName: p.name, price: 0 };
    const cls = classify(probe);
    if (cls === 'drink') drink.push(p.code);
    else if (cls === 'snack') snack.push(p.code);
  }
  return { drink: Array.from(new Set(drink)), snack: Array.from(new Set(snack)) };
}

/**
 * 组装“套餐可替换侧项”供应器。真实模式通过 query-meal-detail 获取；
 * 演示模式退化为套餐自带子项。接口不可用/结构不识别时返回空集合（即不产出该方案类型）。
 * 仅对餐单中已有的套餐按需拉取，避免无谓的 MCP 调用。
 */
export async function buildDetailProvider(
  catalog: CatalogItem[],
  storeCode: string,
  orderType: number,
  beType: number,
  comboCodes: string[]
): Promise<DetailProvider> {
  const map = new Map<string, string[]>();
  const uniq = Array.from(new Set(comboCodes)).filter(Boolean);
  for (const code of uniq) {
    if (!REAL_MODE) {
      const c = catalog.find((x) => x.productCode === code);
      const sides = (c?.comboItemList || []).map((s) => s.productCode);
      const clsOf = (sc: string) => {
        const it = catalog.find((x) => x.productCode === sc);
        return it ? classify(it) : 'other';
      };
      map.set(code + ':drink', sides.filter((s) => clsOf(s) === 'drink'));
      map.set(code + ':snack', sides.filter((s) => clsOf(s) === 'snack'));
      continue;
    }
    try {
      const res = await getMealDetail({ storeCode, orderType, beType, code });
      const opts = extractComboOptions(res?.detail, catalog);
      map.set(code + ':drink', opts.drink);
      map.set(code + ':snack', opts.snack);
    } catch {
      // 真实接口不可用或结构不识别：跳过该套餐的侧项替换方案，不做臆测。
      map.set(code + ':drink', []);
      map.set(code + ':snack', []);
    }
  }
  return {
    comboSides: (comboCode: string, slot: 'drink' | 'snack') => map.get(comboCode + ':' + slot) || [],
  };
}

// ---------------------------------------------------------------------------
// 已保存餐单
// ---------------------------------------------------------------------------

export interface SavedMeal {
  id: string;
  name: string;
  items: MealItem[];
  storeCode?: string;
  storeName?: string;
  orderType?: number;
  beType?: number;
}

export function getSavedMeals(): SavedMeal[] {
  const templates = listTemplates();
  const out: SavedMeal[] = [];
  for (const t of templates) {
    const vs = listVersions(t.id);
    const latest = vs.find((v) => v.id === t.latestVersionId) || vs[vs.length - 1];
    if (!latest) continue;
    const s = latest.snapshot;
    out.push({
      id: t.id,
      name: t.name,
      items: s.items,
      storeCode: s.storeCode,
      storeName: s.storeName,
      orderType: s.orderType,
      beType: s.beType,
    });
  }
  return out;
}

function itemsFromTemplate(templateId: string): MealItem[] {
  const vs = listVersions(templateId);
  const t = listTemplates().find((x) => x.id === templateId);
  const latest = vs.find((v) => v.id === t?.latestVersionId) || vs[vs.length - 1];
  return latest ? latest.snapshot.items : [];
}

// ---------------------------------------------------------------------------
// 今天微微调
// ---------------------------------------------------------------------------

export async function runTweak(input: {
  templateId?: string;
  versionId?: string;
  items?: MealItem[];
  storeCode: string;
  orderType: number;
  beType: number;
  locks?: string[];
  maxChanges?: number;
  budgetCap?: number;
  /** “今天最多加 N 元”：未显式设置 budgetCap 时，按 原总价 + addYuan 计算上限。 */
  addYuan?: number;
}) {
  let items: MealItem[] = [];
  if (Array.isArray(input.items) && input.items.length > 0) items = input.items;
  else if (input.versionId) {
    const v = getVersion(input.versionId);
    if (!v) throw new Error('版本不存在');
    items = v.snapshot.items;
  } else if (input.templateId) {
    items = itemsFromTemplate(input.templateId);
  }
  if (!items.length) throw new Error('缺少餐单内容');

  const catalog = await buildCatalog(input.storeCode, input.orderType, input.beType);
  const sellableSet = sellableSetFromCatalog(catalog);
  const dbLocks = input.templateId ? getLocks(input.templateId) : [];
  const locks = Array.from(new Set([...(input.locks || []), ...dbLocks]));

  const comboCodes = items.filter((i) => (i.comboItemList?.length || 0) > 0).map((i) => i.productCode);
  const detail = await buildDetailProvider(catalog, input.storeCode, input.orderType, input.beType, comboCodes);

  // 原餐单在当前门店的可售性（用于提示“历史编码可能已变更”）。
  const availability = await checkAvailability({ items }, input.storeCode, input.orderType, input.beType);

  let budgetCap = input.budgetCap;
  if (budgetCap == null && input.addYuan != null) {
    budgetCap = totalPrice(items, catalog) + input.addYuan;
  }

  const result = generateTweakPlans(
    items,
    catalog,
    {
      locks,
      maxChanges: input.maxChanges ?? 1,
      budgetCap,
      storeCode: input.storeCode,
    },
    detail,
    sellableSet
  );

  return { ...result, locks, availability, catalogSize: catalog.length, items };
}

// ---------------------------------------------------------------------------
// 随机来一份
// ---------------------------------------------------------------------------

export async function runRandom(input: {
  mode: 'fromSaved' | 'keepMain' | 'new';
  storeCode: string;
  orderType: number;
  beType: number;
  localAnonId?: string;
  locks?: string[];
  budgetCap?: number;
  peopleCount?: number;
  excludeCodes?: string[];
  recentCodes?: string[];
  novelty?: 'familiar' | 'slight' | 'more';
  savedMealIds?: string[];
  baseMealId?: string;
  seedNonce?: number;
  prevPickId?: string;
  /** 近期不重复：用已完成订单里最近出现过的商品作为回避集合 */
  avoidRecent?: boolean;
}) {
  const catalog = await buildCatalog(input.storeCode, input.orderType, input.beType);
  const sellableSet = sellableSetFromCatalog(catalog);
  const saved = getSavedMeals();
  const savedMeals = input.savedMealIds?.length
    ? saved.filter((s) => input.savedMealIds!.includes(s.id)).map((s) => s.items)
    : saved.map((s) => s.items);
  const baseMeal = input.baseMealId ? saved.find((s) => s.id === input.baseMealId)?.items : saved[0]?.items;

  const comboCodes = [
    ...(baseMeal || []),
    ...savedMeals.flat(),
  ]
    .filter((i) => (i.comboItemList?.length || 0) > 0)
    .map((i) => i.productCode);
  const detail = await buildDetailProvider(catalog, input.storeCode, input.orderType, input.beType, comboCodes);

  const randomInput: RandomInput = {
    mode: input.mode,
    localAnonId: input.localAnonId || 'anon',
    catalog,
    savedMeals,
    baseMeal,
    locks: input.locks || [],
    budgetCap: input.budgetCap,
    peopleCount: input.peopleCount || 1,
    excludeCodes: input.excludeCodes || [],
    recentCodes:
      input.recentCodes && input.recentCodes.length
        ? input.recentCodes
        : input.avoidRecent
        ? recentProductCodes()
        : [],
    novelty: input.novelty || 'slight',
    sellableSet,
    detail,
    prevPickId: input.prevPickId,
  };

  return generateRandom(randomInput, input.seedNonce || 0);
}

// ---------------------------------------------------------------------------
// 今日食签
// ---------------------------------------------------------------------------

/** 北京时间的“今天”（YYYY-MM-DD）。 */
export function dateCN(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** 北京时间当前小时（0-23）。 */
export function hourCN(): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hour12: false,
  }).format(new Date());
  return parseInt(h, 10) || 0;
}

export function periodFromHour(h: number): MealPeriod {
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'any';
}

function prefVersionOf(prefs: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(prefs || {})).digest('hex').slice(0, 16);
}

/** 最近出现过的商品编码（用于“近期不重复”），仅取已完成订单。 */
export function recentProductCodes(limit = 12): string[] {
  const orders = getAllSyncedOrders().filter((o) => !o.isDemo);
  const sorted = [...orders].sort((a, b) => (b.createTime || '').localeCompare(a.createTime || ''));
  const out: string[] = [];
  for (const o of sorted) {
    for (const p of o.products) {
      if (!out.includes(p.productCode)) out.push(p.productCode);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** 缓存有效期：到北京时间当日结束。 */
function ttlUntilEndOfDay(): number {
  const now = Date.now();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || '0');
  // 以北京时间 00:00 为基准，推算下一日 00:00 对应的 UTC 毫秒
  const offsetMs = 8 * 3600 * 1000;
  const beijingNow = now + offsetMs;
  const startOfDay = Date.UTC(get('year'), get('month') - 1, get('day'));
  const elapsed = beijingNow - startOfDay;
  return Math.max(60_000, 24 * 3600 * 1000 - elapsed);
}

export async function runSign(input: {
  localAnonId?: string;
  dateCN?: string;
  storeCode: string;
  orderType: number;
  beType: number;
  mealPeriod?: MealPeriod;
  intent?: SignIntent;
  budgetCap?: number;
  seedNonce?: number;
  refresh?: boolean;
  /** 上一次抽中的候选 id，用于“换一份灵感”避免立即重复 */
  prevPickId?: string;
}) {
  const anon = input.localAnonId || 'anon';
  const date = input.dateCN || dateCN();
  const period = input.mealPeriod || periodFromHour(hourCN());
  const intent: SignIntent = input.intent || 'slight';
  const prefs = getPrefs();
  const prefVersion = prefVersionOf(prefs);
  const nonce = input.seedNonce || 0;

  // 当日稳定：nonce=0（即“今天的那一签”）优先读缓存，保证同一天结果一致。
  const cacheKey = `sign|${anon}|${date}|${input.storeCode}|${period}|${intent}|${prefVersion}`;
  if (nonce === 0 && !input.refresh) {
    const cached = getSignCache(cacheKey);
    if (cached) return { ...cached, cached: true };
  }

  const catalog = await buildCatalog(input.storeCode, input.orderType, input.beType);
  const sellableSet = sellableSetFromCatalog(catalog);
  const saved = getSavedMeals();
  const preference: SignPreference = {
    favorites: prefs.favorites,
    tasteTags: prefs.tasteTags,
    exclusions: prefs.exclusions,
    locks: prefs.locks,
  };

  const r = generateDailySign({
    localAnonId: anon,
    dateCN: date,
    storeCode: input.storeCode,
    mealPeriod: period,
    intent,
    catalog,
    savedMeals: saved.map((s) => s.items),
    baseMeal: saved[0]?.items,
    recentCodes: recentProductCodes(),
    preference,
    budgetCap: input.budgetCap,
    sellableSet,
    prefVersion,
    prevPickId: input.prevPickId,
    // 注意：seedNonce 是 generateDailySign 的第二个位置参数，
    // 必须显式传入，否则种子不推进（“换一份灵感”会一直抽到同一份）。
  }, nonce);

  const payload = {
    ...r,
    cached: false,
    dateCN: date,
    mealPeriod: period,
    intent,
    prefVersion,
  };
  if (nonce === 0) setSignCache(cacheKey, payload, ttlUntilEndOfDay());
  return payload;
}

// ---------------------------------------------------------------------------
// 看图轻松点：真实商品图
// ---------------------------------------------------------------------------

/**
 * 只接受 https 的远端图片地址。
 * 图片地址一律来自 MCP 工具返回（query-meals 的 image 字段，或 query-meal-detail 的 image），
 * 绝不自行拼接 URL、绝不使用搜索来的图片。
 */
function safeImageUrl(u: any): string | undefined {
  if (typeof u !== 'string') return undefined;
  const s = u.trim();
  if (!s) return undefined;
  if (!/^https:\/\//i.test(s)) return undefined; // 只走 https，避免混合内容与可疑协议
  return s;
}

/**
 * 取商品图片映射：先取门店菜单里的 image；菜单没给的再用 query-meal-detail 补齐（限量）。
 * 演示模式没有真实图片，返回空映射，界面按“示意图”处理。
 */
const IMAGE_URL_TTL_MS = 7 * 24 * 3600 * 1000; // 图片地址缓存 7 天

/** 从本地库读取已缓存的图片地址。注意：只存地址，不存图片文件，更不进版本库。 */
function readCachedImageUrls(
  codes: string[],
  storeCode: string,
  orderType: number,
  beType: number
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!REAL_MODE || !codes.length) return out;
  try {
    const stmt = db.prepare(
      'SELECT product_code, url, fetched_at FROM product_images WHERE store_code=? AND order_type=? AND be_type=? AND product_code=?'
    );
    for (const code of codes) {
      const r = stmt.get(storeCode, orderType, beType, code) as any;
      if (!r?.url) continue;
      const age = Date.now() - new Date(r.fetched_at).getTime();
      if (age < IMAGE_URL_TTL_MS) out[code] = r.url;
    }
  } catch {
    // 缓存读取失败不影响主流程
  }
  return out;
}

function writeCachedImageUrls(
  entries: { code: string; url: string; name?: string }[],
  storeCode: string,
  orderType: number,
  beType: number
): void {
  if (!REAL_MODE || !entries.length) return;
  try {
    const stmt = db.prepare(
      `INSERT INTO product_images (product_code, store_code, order_type, be_type, url, product_name, fetched_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(product_code, store_code, order_type, be_type)
       DO UPDATE SET url=?, product_name=?, fetched_at=?`
    );
    const ts = nowISO();
    for (const e of entries) stmt.run(e.code, storeCode, orderType, beType, e.url, e.name || '', ts, e.url, e.name || '', ts);
  } catch {
    // 缓存写入失败不影响主流程
  }
}

export async function buildImageMap(input: {
  codes: string[];
  storeCode: string;
  orderType: number;
  beType: number;
}): Promise<{ images: Record<string, string>; demo: boolean; menuUnavailable?: boolean; cached?: number }> {
  // 1) 先查本地图片地址缓存（营业时间拉过一次，非营业时间也能显示）
  const cached = readCachedImageUrls(input.codes, input.storeCode, input.orderType, input.beType);
  const images: Record<string, string> = { ...cached };

  // 2) 菜单可能不可用（如非营业时间 code=600057），但 query-meal-detail 仍能返回单品图片。
  //    因此这里**不因菜单失败而整体失败**。
  let catalog: CatalogItem[] = [];
  let menuUnavailable = false;
  try {
    catalog = await buildCatalog(input.storeCode, input.orderType, input.beType);
  } catch {
    menuUnavailable = true;
  }

  const fresh: { code: string; url: string; name?: string }[] = [];
  const missing: string[] = [];
  for (const code of input.codes) {
    if (images[code]) continue;
    const c = catalog.find((x) => x.productCode === code);
    const img = safeImageUrl(c?.image);
    if (img) {
      images[code] = img;
      fresh.push({ code, url: img, name: c?.productName });
    } else {
      missing.push(code);
    }
  }

  // 3) 菜单没给图的（或菜单整个不可用时全部），用 query-meal-detail 补齐。
  //    实测：非营业时间 query-meals 返回 600057，但 query-meal-detail 仍可返回单品图片。
  if (REAL_MODE && missing.length) {
    for (const code of missing.slice(0, 24)) {
      try {
        const res = await getMealDetail({
          storeCode: input.storeCode,
          orderType: input.orderType,
          beType: input.beType,
          code,
        });
        // 实测：非单品编码（如促销组合 99000xxxxx）返回 success:false / code 60001
        // 「未匹配到商品，请重新拉取全量商品列表」——这种情况就是没有图，不臆造。
        const img = safeImageUrl(res?.detail?.image);
        if (img) {
          images[code] = img;
          fresh.push({ code, url: img, name: res?.detail?.name });
        }
      } catch {
        // 取不到就保持缺失，界面显示示意图（不臆造图片地址）
      }
    }
  }

  writeCachedImageUrls(fresh, input.storeCode, input.orderType, input.beType);
  return { images, demo: !REAL_MODE, menuUnavailable, cached: Object.keys(cached).length };
}

/**
 * 预热图片地址缓存：在**营业时间**拉取当前门店全量菜单，把所有单品的图片地址存入本地库。
 * 只存 https 地址，不下载图片文件、不打包进仓库。
 * 这样预热之后，即使非营业时间（query-meals 返回 600057）也能正常显示商品图。
 */
export async function warmImageCache(input: {
  storeCode: string;
  orderType: number;
  beType: number;
}): Promise<{ total: number; withImage: number; warmed: number; unavailable?: boolean; message?: string }> {
  if (!REAL_MODE) return { total: 0, withImage: 0, warmed: 0 };
  let catalog: CatalogItem[];
  try {
    catalog = await buildCatalog(input.storeCode, input.orderType, input.beType);
  } catch (e: any) {
    // 非营业时间拿不到全量商品列表，如实回报，不伪造
    return { total: 0, withImage: 0, warmed: 0, unavailable: true, message: e?.message || '菜单暂不可用' };
  }
  const entries: { code: string; url: string; name?: string }[] = [];
  for (const c of catalog) {
    const img = safeImageUrl(c.image);
    if (img) entries.push({ code: c.productCode, url: img, name: c.productName });
  }
  writeCachedImageUrls(entries, input.storeCode, input.orderType, input.beType);
  return { total: catalog.length, withImage: entries.length, warmed: entries.length };
}

// ---------------------------------------------------------------------------
// 这一餐的能量卡
// ---------------------------------------------------------------------------

/**
 * 取得营养索引。真实模式下先确保官方营养表已缓存（调一次 list-nutrition-foods，6 小时缓存）；
 * 接口不可用时返回空索引，界面显示“暂无数据”，绝不编造。
 */
export async function ensureNutritionIndex(): Promise<{ index: Map<string, NutritionRow>; demo: boolean; rowCount: number }> {
  if (!REAL_MODE) {
    const { index } = getNutritionIndex(true);
    return { index: index as Map<string, NutritionRow>, demo: true, rowCount: index.size };
  }
  if (!hasRealNutritionCache()) {
    try {
      const { text } = await getNutritionFoods();
      if (text) setNutritionCacheFromText(text);
    } catch {
      // 拉取失败：返回空索引，由界面显示“暂无数据”
      return { index: new Map(), demo: false, rowCount: 0 };
    }
  }
  const { index } = getNutritionIndex(false);
  return { index: index as Map<string, NutritionRow>, demo: false, rowCount: index.size };
}

/**
 * 计算一餐的营养（含覆盖情况、特制未知、历史口径说明）。
 * 只做“确定性计算”，所有数值来自官方营养表，缺失即缺失。
 */
export async function runNutrition(input: {
  items: MealItem[];
  storeCode: string;
  orderType: number;
  beType: number;
  energyRefKcal?: number | null;
}) {
  const { index, demo, rowCount } = await ensureNutritionIndex();
  const nutrition = computeMealNutrition(input.items, index, { demo });
  const ref = input.energyRefKcal;
  // 参考上限只有用户自己设置过才参与展示；未设置时不做任何健康评分/红绿灯。
  const refState =
    ref != null && nutrition.totals.energyKcal != null
      ? { ref, over: nutrition.totals.energyKcal > ref, diff: Math.round((ref - nutrition.totals.energyKcal) * 10) / 10 }
      : null;
  return { ...nutrition, indexSize: rowCount, energyRef: refState };
}

// ---------------------------------------------------------------------------
// 老样子轻一点
// ---------------------------------------------------------------------------

export async function runLighter(input: {
  items: MealItem[];
  goal: LighterGoal;
  storeCode: string;
  orderType: number;
  beType: number;
  locks?: string[];
  budgetCap?: number;
  excludeCodes?: string[];
  maxPlans?: number;
  demo?: boolean;
}) {
  const catalog = await buildCatalog(input.storeCode, input.orderType, input.beType);
  const sellableSet = sellableSetFromCatalog(catalog);
  const { index, demo } = await ensureNutritionIndex();
  const comboCodes = input.items.filter((i) => (i.comboItemList?.length || 0) > 0).map((i) => i.productCode);
  const detail = await buildDetailProvider(catalog, input.storeCode, input.orderType, input.beType, comboCodes);

  const prefs = getPrefs();
  const exclude = Array.from(new Set([...(input.excludeCodes || []), ...(prefs.exclusions || [])]));

  const res = generateLighterPlans({
    items: input.items,
    catalog,
    goal: input.goal,
    nutritionIndex: index,
    options: {
      locks: input.locks || [],
      maxChanges: 1, // 默认最多替换一个商品槽位
      budgetCap: input.budgetCap,
      storeCode: input.storeCode,
    },
    detail,
    sellableSet,
    excludeCodes: exclude,
    demo,
    maxPlans: input.maxPlans ?? 4,
  });
  return { ...res, goalLabel: GOAL_LABEL[input.goal], catalogSize: catalog.length };
}

// ---------------------------------------------------------------------------
// 同样吃，看看优惠
// ---------------------------------------------------------------------------

/**
 * 看看优惠：先取当前门店/就餐方式的券，构造“同商品只挂券”的候选，
 * 再用 calculate-price 逐个实际核价；只有确实更低才给出“少付 ¥X”。
 * 不新增商品、不改数量、不换门店/就餐方式、不自动领券或下单。
 */
export async function runCoupons(input: {
  items: MealItem[];
  storeCode: string;
  orderType: number;
  beType: number;
}) {
  const baseline = await previewPrice({
    items: input.items,
    storeCode: input.storeCode,
    orderType: input.orderType,
    beType: input.beType,
  });

  const raw = await getStoreCoupons({
    storeCode: input.storeCode,
    orderType: input.orderType,
    beType: input.beType,
  });
  const coupons = parseStoreCoupons(raw.coupons);

  const priced: { candidate: any; amount: number; priceUnavailable?: boolean; message?: string }[] = [];
  const allCoupons: AnnotatedCoupon[] = [];

  for (const coupon of coupons) {
    if (!coupon.couponCode) {
      // 无券码无法参与核价 —— 如实标注不可用
      allCoupons.push({ coupon, usable: false, usableReason: '无券码，无法使用' });
      continue;
    }
    // 找这一餐里与该券适用商品匹配的项（按 productCode 严格相等）
    const target = input.items.find((it) => coupon.products.some((p) => p.productCode === it.productCode));
    if (!target) {
      allCoupons.push({ coupon, usable: false, usableReason: '适用商品不在这一餐里' });
      continue;
    }
    const matched = coupon.products.find((p) => p.productCode === target.productCode)!;
    const items = input.items.map((it) =>
      it.productCode === target.productCode ? { ...it, couponCode: coupon.couponCode, couponId: coupon.couponId } : it
    );
    const p = await previewPrice({ items, storeCode: input.storeCode, orderType: input.orderType, beType: input.beType });
    allCoupons.push({
      coupon,
      usable: true,
      targetProductName: matched.productName || target.productName,
      amount: p.priceUnavailable ? undefined : p.amount,
      priceUnavailable: !!p.priceUnavailable,
      message: p.priceMessage,
      items,
    });
    priced.push({ candidate: { coupon, targetProductCode: target.productCode, targetProductName: matched.productName || target.productName, items }, amount: p.amount, priceUnavailable: p.priceUnavailable, message: p.priceMessage });
  }

  const plans = evaluateCouponPlans({ baseline, priced, demo: baseline.demo });
  // 把“是否更便宜 / 省了多少”回填到可用券上
  for (const a of allCoupons) {
    if (!a.usable) continue;
    const pl = plans.find((pl) => pl.coupon.couponCode === a.coupon.couponCode);
    if (pl) {
      a.cheaper = pl.cheaper;
      a.saved = pl.saved;
    }
  }

  return {
    demo: baseline.demo,
    baselineAmount: baseline.priceUnavailable ? 0 : baseline.amount,
    baselinePriceUnavailable: !!baseline.priceUnavailable,
    baselineMessage: baseline.priceMessage,
    couponCount: coupons.length,
    plans,
    allCoupons,
    /** 没有更合适的优惠是正常结果，如实说明；券本身仍全部展示 */
    note: raw.unavailable
      ? `当前门店优惠券暂不可用：${raw.message || '接口未返回'}`
      : coupons.length === 0
        ? '当前门店没有返回任何优惠券。'
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// 我的饮食足迹
// ---------------------------------------------------------------------------

export function runFootprintOverview(rangeDays: number | 'all') {
  const orders = getAllSyncedOrders();
  const analytics = computeOrderAnalytics(orders, rangeDays);
  const templates = listTemplates();
  const versions = templates.flatMap((t) => listVersions(t.id));
  const attempts = listOrderAttempts();
  const usage = computeUsageStats(templates, versions, attempts);
  const profile = buildPreferenceProfile(orders, listFeedback(), getPrefs());
  return {
    demo: !REAL_MODE,
    hasDemoData: hasDemoOrders(),
    sync: {
      lastSyncAt: getSyncMeta('lastSyncAt'),
      orderCount: orders.length,
    },
    analytics,
    usage,
    profile,
  };
}

/**
 * 同步历史订单到足迹库。演示模式同步演示数据并标记 isDemo=1，真实模式同步真实订单。
 * 重新同步会保留用户已设置的归属（self/shared/proxy/unknown）。
 */
export async function runFootprintSync(): Promise<{ synced: number; demo: boolean }> {
  const res = await getHistoryOrders();
  const orders: any[] = Array.isArray(res?.orders) ? res.orders : [];
  const existing = new Map(getAllSyncedOrders().map((o) => [o.orderId, o]));
  for (const o of orders) {
    const n = normalizeRawOrder(o);
    const prev = existing.get(n.orderId);
    n.ownerType = prev?.ownerType || 'unknown'; // 保留用户标注，不被重新同步覆盖
    n.isDemo = !!res.demo;
    upsertSyncedOrder(n);
  }
  setSyncMeta('lastSyncAt', nowISO());
  setSyncMeta('orderCount', String(orders.length));
  return { synced: orders.length, demo: !!res.demo };
}
