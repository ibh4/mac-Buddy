// 领域模型：餐单模板、版本、报价、下单尝试。
// 设计原则：只持久化必要的业务数据，不保存手机号、地址、支付链接等敏感返回值。

export interface MealComboItem {
  productCode: string;
  name: string;
  quantity: number;
}

export interface MealModificationValue {
  code: string;
  key: string;
  quantity: number;
}

export interface MealItem {
  productCode: string;
  productName: string;
  quantity: number;
  /** 套餐子项（仅套餐有） */
  comboItemList?: MealComboItem[];
  /** 用户选定的、接口支持的特制选项 */
  modification?: { values: MealModificationValue[] };
  /** 来源信息：历史订单号仅作参考，不视为当前可下单编码 */
  source?: { orderId?: string; isHistory: boolean };
  /** 该商品上挂载的优惠券编码（来自 query-store-coupons，核价时随商品一起提交） */
  couponCode?: string;
  /** 优惠券实例 id */
  couponId?: string;
}

export interface MealSnapshot {
  storeCode?: string;
  storeName?: string;
  orderType?: number; // 1 到店（到店自取+得来速），2 外送
  beType?: number; // 1 到店自取, 2 麦乐送到家, 5 得来速, 6 企业团餐
  items: MealItem[];
  /** 历史金额（仅展示参考，不参与实时价差计算） */
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
  /** 餐单摘要签名：门店/就餐方式/餐品变化会使旧报价失效 */
  signature: string;
}

export type OrderStatus =
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'unknown'
  | 'failed';

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

export type AppMode = 'demo' | 'real';

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
  /** 菜单本身不可用（如非营业时间），此时“不可售”只是无法核实，不代表商品真的不可售。 */
  unavailable?: boolean;
}
