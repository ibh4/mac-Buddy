// 前端 API 客户端：所有请求走相对路径 /api（Vite 开发代理到本地后端）。
// 注意：Token 只在后端使用，前端永远拿不到。
import type {
  MealTemplate,
  MealVersion,
  MealSnapshot,
  MealItem,
  QuoteSnapshot,
  OrderAttempt,
  DiffResult,
  AvailabilityResult,
  MenuCatalogItem,
  StatusResp,
  SavedMeal,
  TweakResult,
  RandomResult,
  SignResult,
  FootprintOverview,
  SyncedOrder,
  FeedbackRow,
  Prefs,
  MealNutrition,
  LighterGoal,
  LighterResult,
  CouponResult,
} from './types';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json().catch(() => ({ ok: false, error: '无法解析响应' }));
  if (!json.ok) throw new Error(json.error || `请求失败 (${res.status})`);
  return json.data as T;
}

export const api = {
  status: () => req<StatusResp>('/status'),
  ping: () => req<any>('/mcp/ping'),

  listTemplates: () => req<MealTemplate[]>('/templates'),
  createTemplate: (name: string, note: string, favorite: boolean, snapshot: MealSnapshot) =>
    req<{ template: MealTemplate; version: MealVersion }>('/templates', {
      method: 'POST',
      body: JSON.stringify({ name, note, favorite, snapshot }),
    }),
  getTemplate: (id: string) => req<{ template: MealTemplate; versions: MealVersion[] }>(`/templates/${id}`),
  updateTemplate: (id: string, patch: { name?: string; note?: string; favorite?: boolean }) =>
    req<MealTemplate>(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTemplate: (id: string) => req<{ deleted: boolean }>(`/templates/${id}`, { method: 'DELETE' }),

  createVersion: (templateId: string, snapshot: MealSnapshot, changeSummary: string, parentVersionId?: string | null) =>
    req<MealVersion>(`/templates/${templateId}/versions`, {
      method: 'POST',
      body: JSON.stringify({ snapshot, changeSummary, parentVersionId }),
    }),
  getVersion: (vid: string) => req<MealVersion>(`/versions/${vid}`),
  restoreVersion: (vid: string, changeSummary?: string) =>
    req<MealVersion>(`/versions/${vid}/restore`, { method: 'POST', body: JSON.stringify({ changeSummary }) }),

  diff: (fromVersionId: string, toVersionId: string) =>
    req<DiffResult>('/diff', { method: 'POST', body: JSON.stringify({ fromVersionId, toVersionId }) }),

  historyOrders: () => req<{ demo: boolean; orders: any[] }>('/history-orders'),
  importOrder: (orderId: string) =>
    req<{ template: MealTemplate; version: MealVersion }>('/import-order', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }),

  stores: (beType: number, city?: string, keyword?: string) =>
    req<{ demo: boolean; stores: any[] }>(`/stores?beType=${beType}${city ? `&city=${encodeURIComponent(city)}` : ''}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''}`),
  menu: (storeCode: string, orderType: number, beType: number) =>
    req<{ demo: boolean; storeCode: string; items: MenuCatalogItem[] }>(`/menu?storeCode=${encodeURIComponent(storeCode)}&orderType=${orderType}&beType=${beType}`),

  checkAvailability: (snapshot: MealSnapshot, storeCode: string, orderType: number, beType: number) =>
    req<AvailabilityResult>('/check-availability', {
      method: 'POST',
      body: JSON.stringify({ snapshot, storeCode, orderType, beType }),
    }),
  quote: (input: { versionId: string; storeCode: string; storeName?: string; orderType: number; beType: number; items: any[] }) =>
    req<{ quote: QuoteSnapshot; takeWayList?: any[]; demo: boolean; priceUnavailable?: boolean; priceMessage?: string }>('/quote', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  validateQuote: (quoteId: string, signature: string) =>
    req<{ valid: boolean }>('/quote/validate', { method: 'POST', body: JSON.stringify({ quoteId, signature }) }),

  pricePreview: (items: MealItem[], storeCode: string, orderType = 1, beType = 1) =>
    req<{ amount: number; demo: boolean; priceUnavailable?: boolean; priceMessage?: string }>('/price-preview', {
      method: 'POST',
      body: JSON.stringify({ items, storeCode, orderType, beType }),
    }),

  createOrder: (input: any) =>
    req<{ attempt: OrderAttempt; paymentUrl?: string; demo: boolean }>('/orders', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getOrder: (id: string) => req<OrderAttempt>(`/orders/${id}`),
  verifyOrder: (remoteOrderId: string) =>
    req<any>('/orders/verify', { method: 'POST', body: JSON.stringify({ remoteOrderId }) }),

  nlParse: (text: string, items: any[], catalog: MenuCatalogItem[]) =>
    req<{ ops: any[]; clarification?: { message: string; options?: string[] }; previewItems?: any[] }>('/nl-parse', {
      method: 'POST',
      body: JSON.stringify({ text, items, catalog }),
    }),

  // ---- 今天微微调 / 随机来一份 / 今日食签 ----
  savedMeals: () => req<SavedMeal[]>('/saved-meals'),

  tweak: (input: {
    templateId?: string;
    versionId?: string;
    items?: MealItem[];
    storeCode: string;
    orderType?: number;
    beType?: number;
    locks?: string[];
    maxChanges?: number;
    budgetCap?: number;
    addYuan?: number;
  }) => req<TweakResult>('/tweak/generate', { method: 'POST', body: JSON.stringify(input) }),

  random: (input: {
    mode: 'fromSaved' | 'keepMain' | 'new';
    storeCode: string;
    orderType?: number;
    beType?: number;
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
    avoidRecent?: boolean;
  }) => req<RandomResult>('/random/generate', { method: 'POST', body: JSON.stringify(input) }),

  signGenerate: (input: {
    storeCode: string;
    orderType?: number;
    beType?: number;
    localAnonId?: string;
    dateCN?: string;
    mealPeriod?: string;
    intent?: string;
    budgetCap?: number;
    seedNonce?: number;
    refresh?: boolean;
    prevPickId?: string;
  }) => req<SignResult>('/sign/generate', { method: 'POST', body: JSON.stringify(input) }),

  signToday: (storeCode: string, orderType = 1, beType = 1, mealPeriod?: string, intent?: string, budgetCap?: number) =>
    req<SignResult>(
      `/sign/today?storeCode=${encodeURIComponent(storeCode)}&orderType=${orderType}&beType=${beType}` +
        `${mealPeriod ? `&mealPeriod=${mealPeriod}` : ''}${intent ? `&intent=${intent}` : ''}` +
        `${budgetCap != null ? `&budgetCap=${budgetCap}` : ''}`
    ),

  // ---- 我的饮食足迹 ----
  footprintOverview: (rangeDays: number | 'all') =>
    req<FootprintOverview>(`/footprint/overview?rangeDays=${rangeDays}`),
  footprintSync: () => req<{ synced: number; demo: boolean }>('/footprint/sync', { method: 'POST' }),
  footprintOrders: () => req<SyncedOrder[]>('/footprint/orders'),
  setOrderOwner: (orderId: string, ownerType: 'self' | 'shared' | 'proxy' | 'unknown') =>
    req<{ updated: boolean }>('/footprint/owner', { method: 'POST', body: JSON.stringify({ orderId, ownerType }) }),

  /** 商品图片：地址来自 MCP 返回的官方图片（https），取不到则该编码不在映射里 */
  productImages: (codes: string[], storeCode: string, orderType = 1, beType = 1) =>
    req<{ images: Record<string, string>; demo: boolean }>('/product-images', {
      method: 'POST',
      body: JSON.stringify({ codes, storeCode, orderType, beType }),
    }),

  // ---- 这一餐的能量卡 / 轻一点 / 看看优惠 ----
  nutrition: (items: MealItem[], storeCode: string, orderType = 1, beType = 1, energyRefKcal?: number | null) =>
    req<MealNutrition>('/nutrition', {
      method: 'POST',
      body: JSON.stringify({ items, storeCode, orderType, beType, energyRefKcal }),
    }),

  lighter: (input: {
    items: MealItem[];
    goal: LighterGoal;
    storeCode: string;
    orderType?: number;
    beType?: number;
    locks?: string[];
    budgetCap?: number;
    excludeCodes?: string[];
    maxPlans?: number;
  }) => req<LighterResult>('/lighter', { method: 'POST', body: JSON.stringify(input) }),

  coupons: (items: MealItem[], storeCode: string, orderType = 1, beType = 1) =>
    req<CouponResult>('/coupons', { method: 'POST', body: JSON.stringify({ items, storeCode, orderType, beType }) }),

  // ---- 反馈 / 偏好 / 锁定 ----
  listFeedback: () => req<FeedbackRow[]>('/feedback'),
  addFeedback: (targetCode: string, verdict: string, targetType = 'item', note?: string) =>
    req<FeedbackRow>('/feedback', {
      method: 'POST',
      body: JSON.stringify({ targetType, targetCode, verdict, note }),
    }),
  removeFeedback: (id: string) => req<{ deleted: boolean }>(`/feedback/${id}`, { method: 'DELETE' }),

  getPrefs: () => req<Prefs>('/prefs'),
  setPrefs: (p: Partial<Prefs>) => req<Prefs>('/prefs', { method: 'PUT', body: JSON.stringify(p) }),

  getLocks: (templateId: string) => req<string[]>(`/locks?templateId=${encodeURIComponent(templateId)}`),
  setLock: (templateId: string, productCode: string, reason?: string) =>
    req<string[]>('/locks', { method: 'POST', body: JSON.stringify({ templateId, productCode, reason }) }),
  clearLock: (templateId: string, productCode: string) =>
    req<string[]>(`/locks?templateId=${encodeURIComponent(templateId)}&productCode=${encodeURIComponent(productCode)}`, {
      method: 'DELETE',
    }),
};
