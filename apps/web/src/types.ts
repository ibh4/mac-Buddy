// 与后端共享的前端类型（业务模型）。
export interface MealItem {
  productCode: string;
  productName: string;
  quantity: number;
  comboItemList?: { productCode: string; name: string; quantity: number }[];
  modification?: { values: { code: string; key: string; quantity: number }[] };
  source?: { orderId?: string; isHistory: boolean };
  /** 该商品上挂载的优惠券编码（来自 query-store-coupons，核价时随商品一起提交） */
  couponCode?: string;
  couponId?: string;
}

export interface MealSnapshot {
  storeCode?: string;
  storeName?: string;
  orderType?: number;
  beType?: number;
  items: MealItem[];
  historicalAmount?: number | null;
}

export interface MealTemplate {
  id: string;
  name: string;
  note: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  latestVersionId: string;
  versionCount?: number;
}

export interface MealVersion {
  id: string;
  templateId: string;
  parentVersionId: string | null;
  snapshot: MealSnapshot;
  changeSummary: string;
  createdAt: string;
}

export interface QuoteSnapshot {
  id: string;
  templateId: string;
  versionId: string;
  storeCode: string;
  storeName?: string;
  orderType: number;
  beType: number;
  amount: number;
  currency: string;
  quotedAt: string;
  signature: string;
}

export type OrderStatus = 'pending' | 'submitted' | 'confirmed' | 'unknown' | 'failed';

export interface OrderAttempt {
  id: string;
  templateId: string;
  versionId: string;
  quoteId: string;
  status: OrderStatus;
  remoteOrderId?: string;
  paymentUrl?: string;
  createdAt: string;
  confirmedAt?: string;
  note?: string;
}

export interface DiffEntry {
  kind: 'added' | 'removed' | 'replaced' | 'quantity' | 'modification';
  productCode: string;
  productName: string;
  detail: string;
}

export interface DiffResult {
  fromVersionId: string;
  toVersionId: string;
  entries: DiffEntry[];
  summary: string;
}

export interface AvailabilityItem {
  productCode: string;
  productName: string;
  sellable: boolean;
  reason?: string;
}

export interface AvailabilityResult {
  storeCode: string;
  orderType: number;
  beType: number;
  items: AvailabilityItem[];
  allSellable: boolean;
  /** 菜单本身不可用（如非营业时间）：此时可售性只是无法核实，不代表商品真的不可售。 */
  unavailable?: boolean;
}

export interface MenuCatalogItem {
  productCode: string;
  productName: string;
  price?: number;
  category?: string;
  isCombo?: boolean;
  image?: string;
  modifications?: { code: string; key: string; name: string }[];
}

export interface StatusResp {
  mode: 'demo' | 'real';
  realConfigured: boolean;
  connected: boolean;
  lastError: string | null;
  lastSyncAt: string | null;
  tools: string[];
}

// ===========================================================================
// 新增入口：微微调 / 随机 / 食签 / 饮食足迹
// ===========================================================================

export interface TweakPlan {
  id: string;
  opName: string;
  items: MealItem[];
  keptSummary: string;
  changedSummary: string;
  reason: string;
  changeCount: number;
  total: number;
}

export interface TweakConflict {
  kind: 'locked' | 'budget' | 'unsellable' | 'combo' | 'changes';
  message: string;
  relax?: string;
}

export interface TweakResult {
  plans: TweakPlan[];
  conflicts: TweakConflict[];
  originalTotal: number;
  locks: string[];
  availability: AvailabilityResult;
  catalogSize: number;
  items: MealItem[];
}

export interface RandomCandidate {
  id: string;
  items: MealItem[];
  reason: string;
  source: 'saved' | 'built' | 'variation';
  total: number;
  signature: string;
}

export interface RandomResult {
  candidates: RandomCandidate[];
  picked: RandomCandidate | null;
  seedUsed: number;
}

export interface SignResult {
  candidates: RandomCandidate[];
  picked: RandomCandidate | null;
  seedUsed: number;
  yiText: string;
  signSignature: string;
  scores: number[];
  dateCN: string;
  mealPeriod: string;
  intent: string;
  prefVersion: string;
  cached: boolean;
}

export interface SavedMeal {
  id: string;
  name: string;
  items: MealItem[];
  storeCode?: string;
  storeName?: string;
  orderType?: number;
  beType?: number;
}

export interface Prefs {
  favorites: string[];
  exclusions: string[];
  tasteTags: Record<string, string[]>;
  locks: string[];
  /** 用户自设的“一餐能量参考上限”（kcal）。未设置则不显示健康评分/红绿灯。 */
  energyRefKcal?: number | null;
}

// ---------------------------------------------------------------------------
// 这一餐的能量卡
// ---------------------------------------------------------------------------

export interface NutrientTotals {
  energyKcal?: number;
  protein?: number;
  fat?: number;
  carbohydrate?: number;
  sodium?: number;
  /** 糖：官方营养表未提供，恒为“暂无数据”，绝不由碳水推算 */
  sugar?: number;
  calcium?: number;
}

export interface ItemNutrition {
  productCode: string;
  productName: string;
  matched: boolean;
  expandedFromCombo?: boolean;
  perUnit?: NutrientTotals;
  quantity: number;
}

export interface MealNutrition {
  totals: NutrientTotals;
  coverage: { matched: number; total: number; missingNames: string[] };
  partial: boolean;
  modificationUnknown: boolean;
  usesHistoryItems: boolean;
  demo: boolean;
  items: ItemNutrition[];
  note: string;
  indexSize: number;
  /** 用户自设参考上限的比对结果；未设置时为 null */
  energyRef: { ref: number; over: boolean; diff: number } | null;
}

// ---------------------------------------------------------------------------
// 老样子轻一点
// ---------------------------------------------------------------------------

export type LighterGoal = 'lessEnergy' | 'moreProtein' | 'lessSodium';

export interface LighterPlan {
  id: string;
  goal: LighterGoal;
  from: { productCode: string; productName: string };
  to: { productCode: string; productName: string };
  scope: 'top' | 'combo';
  /** 是否为同类替换；false 表示同类无可改善项时的跨类兜底方案 */
  sameCat: boolean;
  targetDelta?: number;
  targetComparable: boolean;
  otherDeltas: Partial<Record<keyof NutrientTotals, number | undefined>>;
  priceDelta: number;
  newTotal: number;
  items: MealItem[];
  changeCount: number;
  note?: string;
}

export interface LighterResult {
  goal: LighterGoal;
  targetKey: keyof NutrientTotals;
  goalLabel: string;
  plans: LighterPlan[];
  reasons: string[];
  relaxable: string[];
  baseline: MealNutrition;
  baselineTotal: number;
  baselineHasTarget: boolean;
  catalogSize: number;
}

// ---------------------------------------------------------------------------
// 同样吃，看看优惠
// ---------------------------------------------------------------------------

export interface CouponInfo {
  title: string;
  couponId?: string;
  couponCode?: string;
  tradeDateTime?: string;
  products: { productCode: string; productName: string }[];
  promotionId?: string;
  condition?: string;
}

export interface CouponPlan {
  coupon: CouponInfo;
  targetProductCode: string;
  targetProductName: string;
  items: MealItem[];
  amount: number;
  baselineAmount: number;
  cheaper: boolean;
  saved: number;
  priceUnavailable: boolean;
  message?: string;
  demo: boolean;
}

export interface AnnotatedCoupon {
  coupon: CouponInfo;
  usable: boolean;
  usableReason?: string;
  targetProductName?: string;
  cheaper?: boolean;
  saved?: number;
  amount?: number;
  priceUnavailable?: boolean;
  message?: string;
  items?: MealItem[];
}

export interface CouponResult {
  demo: boolean;
  baselineAmount: number;
  baselinePriceUnavailable: boolean;
  baselineMessage?: string;
  couponCount: number;
  plans: CouponPlan[];
  allCoupons: AnnotatedCoupon[];
  note?: string;
}

export interface SyncedOrder {
  orderId: string;
  storeCode?: string;
  storeName?: string;
  orderType?: string;
  beType?: string;
  createTime?: string;
  orderStatus?: string;
  realTotalAmount?: string;
  products: { productCode: string; productName: string; quantity: number }[];
  ownerType: 'self' | 'shared' | 'proxy' | 'unknown';
  includedItems: { productCode: string; productName: string; quantity: number }[];
  isDemo?: boolean;
}

export interface FeedbackRow {
  id: string;
  targetType: 'item' | 'combo' | 'recommendation';
  targetCode: string;
  verdict: 'like' | 'neutral' | 'nope' | 'forOthers';
  note?: string;
  createdAt: string;
}

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
    productPrefs: {
      code: string;
      name: string;
      orderCount: number;
      quantity: number;
      coverageStart?: string;
      coverageEnd?: string;
      basis: 'inferred';
    }[];
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

export interface FootprintOverview {
  demo: boolean;
  hasDemoData: boolean;
  sync: { lastSyncAt: string | null; orderCount: number };
  analytics: OrderAnalytics;
  usage: UsageStats;
  profile: PreferenceProfile;
}
