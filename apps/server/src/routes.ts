import express from 'express';
import {
  mode,
  seedDemoIfEmpty,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplateMeta,
  deleteTemplate,
  listVersions,
  getVersion,
  createVersion,
  restoreVersion,
  diffVersions,
  getStores,
  getMenu,
  getMealDetail,
  getHistoryOrders,
  importOrderAsTemplate,
  checkAvailability,
  createQuote,
  isQuoteValid,
  getQuote,
  createOrderAttempt,
  getOrderAttempt,
  verifyOrder,
  previewPrice,
} from './service.js';
import { parseInstruction, applyOps, type CatalogItem } from './nl.js';
import { getConnectionState, listTools, MCP_TOOL_NAMES, ensureClient, callMcpTool } from './mcpClient.js';
import { REAL_MODE } from './config.js';
import {
  runTweak,
  runRandom,
  runSign,
  runFootprintOverview,
  runFootprintSync,
  runNutrition,
  runLighter,
  runCoupons,
  buildImageMap,
  warmImageCache,
  getSavedMeals,
  dateCN,
  hourCN,
  periodFromHour,
} from './generators.js';
import {
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
  setOrderOwner,
  getAllSyncedOrders,
} from './footprint.js';

export const router = express.Router();

function ok(res: express.Response, data: any) {
  res.json({ ok: true, data });
}
function fail(res: express.Response, status: number, message: string) {
  res.status(status).json({ ok: false, error: message });
}

function wrap(handler: (req: express.Request, res: express.Response) => Promise<void>) {
  return (req: express.Request, res: express.Response) => {
    handler(req, res).catch((e: any) => {
      const msg = e?.message || String(e);
      const status = /不存在|未找到/.test(msg) ? 404 : 400;
      fail(res, status, msg);
    });
  };
}

// 状态：演示/真实模式、连接状态、最近同步、关注工具列表。
router.get(
  '/status',
  wrap(async (_req, res) => {
    const state = getConnectionState();
    ok(res, {
      mode,
      realConfigured: REAL_MODE,
      connected: state.connected,
      lastError: state.lastError,
      lastSyncAt: state.lastSyncAt,
      tools: MCP_TOOL_NAMES,
    });
  })
);

// 轻量连通性探测（真实模式）。会实际调用 now-time-info，仅供连接设置页使用。
router.get(
  '/mcp/ping',
  wrap(async (_req, res) => {
    if (!REAL_MODE) return ok(res, { demo: true, connected: true });
    try {
      await ensureClient();
      const data = await callMcpTool('now-time-info', {});
      const state = getConnectionState();
      ok(res, { demo: false, connected: true, serverTime: data?.formatted || data?.datetime, lastSyncAt: state.lastSyncAt });
    } catch (e: any) {
      ok(res, { demo: false, connected: false, error: e?.message || String(e) });
    }
  })
);

// 餐单模板
router.get(
  '/templates',
  wrap(async (_req, res) => {
    ok(res, listTemplates());
  })
);

router.post(
  '/templates',
  wrap(async (req, res) => {
    const { name, note, favorite, snapshot } = req.body || {};
    if (!name || typeof name !== 'string') return fail(res, 400, '缺少餐单名称');
    if (!snapshot || !Array.isArray(snapshot.items)) return fail(res, 400, '缺少餐单内容');
    const result = createTemplate(name, note || '', !!favorite, snapshot);
    ok(res, result);
  })
);

router.get(
  '/templates/:id',
  wrap(async (req, res) => {
    const t = getTemplate(req.params.id);
    if (!t) return fail(res, 404, '餐单不存在');
    ok(res, { template: t, versions: listVersions(t.id) });
  })
);

router.patch(
  '/templates/:id',
  wrap(async (req, res) => {
    const patch = req.body || {};
    const t = updateTemplateMeta(req.params.id, {
      name: patch.name,
      note: patch.note,
      favorite: patch.favorite,
    });
    if (!t) return fail(res, 404, '餐单不存在');
    ok(res, t);
  })
);

router.delete(
  '/templates/:id',
  wrap(async (req, res) => {
    const done = deleteTemplate(req.params.id);
    if (!done) return fail(res, 404, '餐单不存在');
    ok(res, { deleted: true });
  })
);

// 版本
router.post(
  '/templates/:id/versions',
  wrap(async (req, res) => {
    const { snapshot, changeSummary, parentVersionId } = req.body || {};
    if (!snapshot || !Array.isArray(snapshot.items)) return fail(res, 400, '缺少餐单内容');
    const v = createVersion(req.params.id, snapshot, changeSummary || '', parentVersionId || null);
    if (!v) return fail(res, 404, '餐单不存在');
    ok(res, v);
  })
);

router.get(
  '/versions/:vid',
  wrap(async (req, res) => {
    const v = getVersion(req.params.vid);
    if (!v) return fail(res, 404, '版本不存在');
    ok(res, v);
  })
);

// 用回某一版：生成新版本，不操作任何真实交易。
router.post(
  '/versions/:vid/restore',
  wrap(async (req, res) => {
    const { changeSummary } = req.body || {};
    const v = restoreVersion(req.params.vid, changeSummary);
    if (!v) return fail(res, 404, '版本不存在');
    ok(res, v);
  })
);

// 差异对比
router.post(
  '/diff',
  wrap(async (req, res) => {
    const { fromVersionId, toVersionId } = req.body || {};
    if (!fromVersionId || !toVersionId) return fail(res, 400, '缺少对比版本');
    ok(res, diffVersions(fromVersionId, toVersionId));
  })
);

// 历史订单
router.get(
  '/history-orders',
  wrap(async (_req, res) => {
    const result = await getHistoryOrders();
    ok(res, result);
  })
);

// 从历史订单导入
router.post(
  '/import-order',
  wrap(async (req, res) => {
    const { orderId } = req.body || {};
    if (!orderId) return fail(res, 400, '缺少订单号');
    const result = await importOrderAsTemplate(orderId);
    if (!result) return fail(res, 404, '订单不存在');
    ok(res, result);
  })
);

// 门店
router.get(
  '/stores',
  wrap(async (req, res) => {
    const beType = parseInt((req.query.beType as string) || '1', 10);
    const result = await getStores({ beType, city: (req.query.city as string) || '', keyword: (req.query.keyword as string) || '' });
    ok(res, result);
  })
);

// 菜单
router.get(
  '/menu',
  wrap(async (req, res) => {
    const storeCode = (req.query.storeCode as string) || '';
    const orderType = parseInt((req.query.orderType as string) || '1', 10);
    const beType = parseInt((req.query.beType as string) || '1', 10);
    const beCode = (req.query.beCode as string) || '';
    if (!storeCode) return fail(res, 400, '缺少门店编码');
    const result = await getMenu({ storeCode, orderType, beType, beCode });
    ok(res, result);
  })
);

// 餐品详情
router.get(
  '/meal-detail',
  wrap(async (req, res) => {
    const storeCode = (req.query.storeCode as string) || '';
    const orderType = parseInt((req.query.orderType as string) || '1', 10);
    const beType = parseInt((req.query.beType as string) || '1', 10);
    const code = (req.query.code as string) || '';
    const beCode = (req.query.beCode as string) || '';
    if (!code) return fail(res, 400, '缺少餐品编码');
    const result = await getMealDetail({ storeCode, orderType, beType, code, beCode });
    ok(res, result);
  })
);

// 可售性检查
router.post(
  '/check-availability',
  wrap(async (req, res) => {
    const { snapshot, storeCode, orderType, beType } = req.body || {};
    if (!snapshot || !storeCode) return fail(res, 400, '缺少餐单或门店');
    const result = await checkAvailability(snapshot, storeCode, orderType || 1, beType || 1);
    ok(res, result);
  })
);

// 核价
router.post(
  '/quote',
  wrap(async (req, res) => {
    const { versionId, storeCode, storeName, orderType, beType, items } = req.body || {};
    if (!versionId || !storeCode || !Array.isArray(items)) return fail(res, 400, '缺少核价参数');
    const result = await createQuote({ versionId, storeCode, storeName, orderType: orderType || 1, beType: beType || 1, items });
    ok(res, result);
  })
);

// 试算：对任意餐品组合核价（不落库、不创建订单），用于随机/食签推荐的最终金额
router.post(
  '/price-preview',
  wrap(async (req, res) => {
    const { items, storeCode, orderType, beType } = req.body || {};
    if (!storeCode || !Array.isArray(items)) return fail(res, 400, '缺少核价参数');
    ok(res, await previewPrice({ items, storeCode, orderType: orderType || 1, beType: beType || 1 }));
  })
);

// 报价有效性（门店/餐品变化会使旧报价失效）
router.post(
  '/quote/validate',
  wrap(async (req, res) => {
    const { quoteId, signature } = req.body || {};
    if (!quoteId || !signature) return fail(res, 400, '缺少参数');
    ok(res, { valid: isQuoteValid(quoteId, signature) });
  })
);

router.get(
  '/quote/:id',
  wrap(async (req, res) => {
    const q = getQuote(req.params.id);
    if (!q) return fail(res, 404, '报价不存在');
    ok(res, q);
  })
);

// 下单（仅用户确认后）。防重复提交；结果不明不自动重试。
router.post(
  '/orders',
  wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.quoteId || !Array.isArray(b.items)) return fail(res, 400, '缺少下单参数');
    const result = await createOrderAttempt(b);
    ok(res, result);
  })
);

router.get(
  '/orders/:id',
  wrap(async (req, res) => {
    const o = getOrderAttempt(req.params.id);
    if (!o) return fail(res, 404, '下单记录不存在');
    ok(res, o);
  })
);

// 下单结果不明时核实
router.post(
  '/orders/verify',
  wrap(async (req, res) => {
    const { remoteOrderId } = req.body || {};
    if (!remoteOrderId) return fail(res, 400, '缺少订单号');
    const result = await verifyOrder(remoteOrderId);
    ok(res, result);
  })
);

// 自然语言解析（可选适配器）：返回操作或澄清，绝不伪装理解。
router.post(
  '/nl-parse',
  wrap(async (req, res) => {
    const { text, items, catalog } = req.body || {};
    const cat: CatalogItem[] = Array.isArray(catalog) ? catalog : [];
    const parsed = parseInstruction(text || '', cat);
    let previewItems: any[] | undefined;
    if (parsed.ops.length > 0 && Array.isArray(items)) {
      previewItems = applyOps(items, parsed.ops);
    }
    ok(res, { ...parsed, previewItems });
  })
);

// ===========================================================================
// 新增入口：今天微微调 / 随机来一份 / 今日食签 / 我的饮食足迹
// 说明：以下接口只生成“草稿与推荐”，绝不创建真实订单或支付。
// ===========================================================================

// 已保存餐单（供随机/食签/微微调选择基础餐单）
router.get(
  '/saved-meals',
  wrap(async (_req, res) => {
    ok(res, getSavedMeals());
  })
);

// 今天微微调：有边界的微调方案（最多 3 个，每个默认只改 1 处）
router.post(
  '/tweak/generate',
  wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.storeCode) return fail(res, 400, '缺少门店编码');
    const result = await runTweak({
      templateId: b.templateId,
      versionId: b.versionId,
      items: b.items,
      storeCode: b.storeCode,
      orderType: b.orderType || 1,
      beType: b.beType || 1,
      locks: b.locks || [],
      maxChanges: b.maxChanges,
      budgetCap: b.budgetCap,
      addYuan: b.addYuan,
    });
    ok(res, result);
  })
);

// 随机来一份：本地确定性候选池 + 种子抽取；“换一个”只推进 seedNonce
router.post(
  '/random/generate',
  wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.storeCode) return fail(res, 400, '缺少门店编码');
    if (!['fromSaved', 'keepMain', 'new'].includes(b.mode)) return fail(res, 400, '模式不合法');
    const result = await runRandom({
      mode: b.mode,
      storeCode: b.storeCode,
      orderType: b.orderType || 1,
      beType: b.beType || 1,
      localAnonId: b.localAnonId,
      locks: b.locks || [],
      budgetCap: b.budgetCap,
      peopleCount: b.peopleCount,
      excludeCodes: b.excludeCodes || [],
      recentCodes: b.recentCodes || [],
      novelty: b.novelty,
      savedMealIds: b.savedMealIds,
      baseMealId: b.baseMealId,
      seedNonce: b.seedNonce,
      prevPickId: b.prevPickId,
      avoidRecent: b.avoidRecent,
    });
    ok(res, result);
  })
);

// 今日食签：当日稳定 + 缓存；refresh=true 或 seedNonce>0 时为“换一份灵感”
router.post(
  '/sign/generate',
  wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.storeCode) return fail(res, 400, '缺少门店编码');
    const result = await runSign({
      localAnonId: b.localAnonId,
      dateCN: b.dateCN,
      storeCode: b.storeCode,
      orderType: b.orderType || 1,
      beType: b.beType || 1,
      mealPeriod: b.mealPeriod,
      intent: b.intent,
      budgetCap: b.budgetCap,
      seedNonce: b.seedNonce,
      refresh: b.refresh,
      prevPickId: b.prevPickId,
    });
    ok(res, result);
  })
);

router.get(
  '/sign/today',
  wrap(async (req, res) => {
    const storeCode = (req.query.storeCode as string) || '';
    if (!storeCode) return fail(res, 400, '缺少门店编码');
    const result = await runSign({
      localAnonId: (req.query.localAnonId as string) || 'anon',
      storeCode,
      orderType: parseInt((req.query.orderType as string) || '1', 10),
      beType: parseInt((req.query.beType as string) || '1', 10),
      mealPeriod: (req.query.mealPeriod as any) || periodFromHour(hourCN()),
      intent: (req.query.intent as any) || 'slight',
      budgetCap: req.query.budgetCap ? Number(req.query.budgetCap) : undefined,
    });
    ok(res, result);
  })
);

// 食签缓存（按 key 读写）
router.get(
  '/sign-cache',
  wrap(async (req, res) => {
    const key = (req.query.key as string) || '';
    if (!key) return fail(res, 400, '缺少缓存键');
    ok(res, getSignCache(key));
  })
);

router.post(
  '/sign-cache',
  wrap(async (req, res) => {
    const { key, value, ttlMs } = req.body || {};
    if (!key) return fail(res, 400, '缺少缓存键');
    setSignCache(key, value, ttlMs);
    ok(res, { saved: true });
  })
);

// ---- 我的饮食足迹 ----

// 概览：历史点餐分析 + 老样子使用统计 + 口味偏好画像
router.get(
  '/footprint/overview',
  wrap(async (req, res) => {
    const raw = (req.query.rangeDays as string) || '30';
    const rangeDays: number | 'all' = raw === 'all' ? 'all' : parseInt(raw, 10) || 30;
    ok(res, runFootprintOverview(rangeDays));
  })
);

// 同步历史订单（真实模式同步真实订单；演示模式同步演示数据并明确标记）
router.post(
  '/footprint/sync',
  wrap(async (_req, res) => {
    ok(res, await runFootprintSync());
  })
);

// 已同步订单列表（用于归属标注）
router.get(
  '/footprint/orders',
  wrap(async (_req, res) => {
    ok(res, getAllSyncedOrders());
  })
);

// 标注订单归属：self 自己吃 / shared 多人分享 / proxy 代买 / unknown 未知
router.post(
  '/footprint/owner',
  wrap(async (req, res) => {
    const { orderId, ownerType } = req.body || {};
    if (!orderId) return fail(res, 400, '缺少订单号');
    if (!['self', 'shared', 'proxy', 'unknown'].includes(ownerType)) return fail(res, 400, '归属类型不合法');
    setOrderOwner(orderId, ownerType);
    ok(res, { updated: true });
  })
);

// 轻量反馈：like / neutral / nope（软偏好）/ forOthers（给别人点的）
router.get(
  '/feedback',
  wrap(async (_req, res) => {
    ok(res, listFeedback());
  })
);

router.post(
  '/feedback',
  wrap(async (req, res) => {
    const { targetType, targetCode, verdict, note } = req.body || {};
    if (!targetCode) return fail(res, 400, '缺少反馈对象');
    if (!['like', 'neutral', 'nope', 'forOthers'].includes(verdict)) return fail(res, 400, '反馈类型不合法');
    ok(res, saveFeedback(targetType || 'item', targetCode, verdict, note));
  })
);

router.delete(
  '/feedback/:id',
  wrap(async (req, res) => {
    deleteFeedback(req.params.id);
    ok(res, { deleted: true });
  })
);

// 偏好（收藏 / 不再推荐 / 口味标签 / 锁定）
router.get(
  '/prefs',
  wrap(async (_req, res) => {
    ok(res, getPrefs());
  })
);

router.put(
  '/prefs',
  wrap(async (req, res) => {
    const b = req.body || {};
    const cur = getPrefs();
    setPrefs({
      favorites: Array.isArray(b.favorites) ? b.favorites : cur.favorites,
      exclusions: Array.isArray(b.exclusions) ? b.exclusions : cur.exclusions,
      tasteTags: b.tasteTags && typeof b.tasteTags === 'object' ? b.tasteTags : cur.tasteTags,
      locks: Array.isArray(b.locks) ? b.locks : cur.locks,
      // 用户自设的“一餐能量参考上限”；传 null 表示清除（清除后不做健康评分）
      energyRefKcal: b.energyRefKcal === null ? null : typeof b.energyRefKcal === 'number' ? b.energyRefKcal : cur.energyRefKcal,
    });
    ok(res, getPrefs());
  })
);

// 商品锁定（某一餐单内锁定某商品，微调/随机不得改动）
router.get(
  '/locks',
  wrap(async (req, res) => {
    const templateId = (req.query.templateId as string) || '';
    if (!templateId) return fail(res, 400, '缺少餐单 ID');
    ok(res, getLocks(templateId));
  })
);

router.post(
  '/locks',
  wrap(async (req, res) => {
    const { templateId, productCode, reason } = req.body || {};
    if (!templateId || !productCode) return fail(res, 400, '缺少餐单 ID 或商品编码');
    setLock(templateId, productCode, reason);
    ok(res, getLocks(templateId));
  })
);

router.delete(
  '/locks',
  wrap(async (req, res) => {
    const templateId = (req.query.templateId as string) || '';
    const productCode = (req.query.productCode as string) || '';
    if (!templateId || !productCode) return fail(res, 400, '缺少餐单 ID 或商品编码');
    clearLock(templateId, productCode);
    ok(res, getLocks(templateId));
  })
);

// 商品图片：来自 MCP 返回的官方图片地址（https），取不到则返回空，界面显示“示意图”
router.post(
  '/product-images',
  wrap(async (req, res) => {
    const b = req.body || {};
    const codes = Array.isArray(b.codes) ? b.codes.map(String).filter(Boolean) : [];
    if (!b.storeCode) return fail(res, 400, '缺少门店编码');
    if (!codes.length) return ok(res, { images: {}, demo: !REAL_MODE });
    const data = await buildImageMap({
      codes: codes.slice(0, 40),
      storeCode: String(b.storeCode),
      orderType: Number(b.orderType) || 1,
      beType: Number(b.beType) || 1,
    });
    ok(res, data);
  })
);

// 预热商品图片地址缓存（需在营业时间执行；只存 https 地址，不下载图片文件）
router.post(
  '/product-images/warm',
  wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.storeCode) return fail(res, 400, '缺少门店编码');
    const data = await warmImageCache({
      storeCode: String(b.storeCode),
      orderType: Number(b.orderType) || 1,
      beType: Number(b.beType) || 1,
    });
    ok(res, data);
  })
);

// 这一餐的能量卡：只做确定性计算，缺失即“暂无数据”，不填 0、不编造。
router.post(
  '/nutrition',
  wrap(async (req, res) => {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return fail(res, 400, '缺少餐品内容');
    const prefs = getPrefs();
    const data = await runNutrition({
      items,
      storeCode: b.storeCode || '',
      orderType: Number(b.orderType) || 1,
      beType: Number(b.beType) || 1,
      energyRefKcal: b.energyRefKcal !== undefined ? b.energyRefKcal : prefs.energyRefKcal,
    });
    ok(res, data);
  })
);

// 老样子轻一点：能量少一点 / 蛋白多一点 / 钠少一点
router.post(
  '/lighter',
  wrap(async (req, res) => {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    const goal = b.goal;
    if (!items.length) return fail(res, 400, '缺少餐品内容');
    if (goal !== 'lessEnergy' && goal !== 'moreProtein' && goal !== 'lessSodium') {
      return fail(res, 400, '目标必须是 lessEnergy / moreProtein / lessSodium 之一');
    }
    if (!b.storeCode) return fail(res, 400, '缺少门店编码');
    const data = await runLighter({
      items,
      goal,
      storeCode: String(b.storeCode),
      orderType: Number(b.orderType) || 1,
      beType: Number(b.beType) || 1,
      locks: Array.isArray(b.locks) ? b.locks : [],
      budgetCap: typeof b.budgetCap === 'number' ? b.budgetCap : undefined,
      excludeCodes: Array.isArray(b.excludeCodes) ? b.excludeCodes : [],
      maxPlans: typeof b.maxPlans === 'number' ? b.maxPlans : 4,
    });
    ok(res, data);
  })
);

// 同样吃，看看优惠：券来自 query-store-coupons，金额来自 calculate-price 实际核价
router.post(
  '/coupons',
  wrap(async (req, res) => {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return fail(res, 400, '缺少餐品内容');
    if (!b.storeCode) return fail(res, 400, '缺少门店编码');
    const data = await runCoupons({
      items,
      storeCode: String(b.storeCode),
      orderType: Number(b.orderType) || 1,
      beType: Number(b.beType) || 1,
    });
    ok(res, data);
  })
);

export function initServerData() {
  seedDemoIfEmpty();
}
