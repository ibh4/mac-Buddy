// 同样吃，看看优惠：只构造“与原方案完全一致、只是挂了券”的候选。
//
// 严格口径：
//  1. 绝不为了凑券新增商品、改数量、换门店或改就餐方式——
//     有券方案与无券方案必须是同一门店、同一就餐方式、同一组商品，否则价差不可比。
//  2. 只用当前门店/就餐方式确实返回的券；券适用商品与餐单商品的匹配按 productCode 严格相等。
//  3. 券张数有限制时按接口给出的条件说明呈现，不替用户决定；不宣称“已把所有券都用上”。
//  4. “少付 ¥X”只在核价结果确实更低时给出；没有可比的无券价格时只给已核实的金额。
//  5. 绝不自动下单、不开通会员、不消耗积分、不领券到账户。
//  6. 没找到更合适的优惠是正常结果，不谎报“全网最低”。

import type { MealItem } from './types.js';

export interface CouponProduct {
  productCode: string;
  productName: string;
}

export interface CouponInfo {
  /** 券标题（展示给用户） */
  title: string;
  couponId?: string;
  /** 核价时随商品提交的券编码 */
  couponCode?: string;
  tradeDateTime?: string;
  products: CouponProduct[];
  promotionId?: string;
  /** 附加条件说明（接口给出的限制，或“接口未说明”——不臆造） */
  condition?: string;
}

export interface CouponCandidate {
  coupon: CouponInfo;
  /** 券挂载到哪个商品 */
  targetProductCode: string;
  targetProductName: string;
  /** 与原餐单同门店、同就餐方式、同商品，仅目标商品多挂了券 */
  items: MealItem[];
}

function str(v: any): string {
  return v == null ? '' : String(v).trim();
}

/**
 * 防御性解析 query-store-coupons 的真实返回。
 * 真实返回是数组：
 *   [{ title, couponId, couponCode, tradeDateTime, products:[{productCode,productName}], promotionId }]
 * 结构无法识别时返回空数组（不臆造字段）。
 */
export function parseStoreCoupons(raw: any): CouponInfo[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.list) ? raw.list : [];
  const out: CouponInfo[] = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const title = str(c.title || c.couponName || c.name);
    const couponCode = str(c.couponCode);
    if (!title && !couponCode) continue;
    const products: CouponProduct[] = Array.isArray(c.products)
      ? c.products
          .map((p: any) => ({ productCode: str(p?.productCode ?? p?.code), productName: str(p?.productName ?? p?.name) }))
          .filter((p: CouponProduct) => p.productCode)
      : [];
    out.push({
      title: title || '未命名优惠券',
      couponId: str(c.couponId) || undefined,
      couponCode: couponCode || undefined,
      tradeDateTime: str(c.tradeDateTime) || undefined,
      products,
      promotionId: str(c.promotionId) || undefined,
      condition: c.condition ? str(c.condition) : undefined,
    });
  }
  return out;
}

/**
 * 构造优惠券候选：对每张“适用商品在本餐单里”的券，产出挂券后的餐品组合。
 * 不新增商品、不改数量、不换门店/就餐方式。
 */
export function buildCouponCandidates(items: MealItem[], coupons: CouponInfo[]): CouponCandidate[] {
  const out: CouponCandidate[] = [];
  if (!items.length || !coupons.length) return out;

  for (const coupon of coupons) {
    if (!coupon.couponCode) continue; // 无券码无法参与核价
    // 找餐单中第一个与该券适用商品严格匹配的项（按 productCode）
    const target = items.find((it) => coupon.products.some((p) => p.productCode === it.productCode));
    if (!target) continue;
    const matched = coupon.products.find((p) => p.productCode === target.productCode)!;
    const next: MealItem[] = items.map((it) =>
      it.productCode === target.productCode
        ? { ...it, couponCode: coupon.couponCode, couponId: coupon.couponId }
        : it
    );
    out.push({
      coupon,
      targetProductCode: target.productCode,
      targetProductName: matched.productName || target.productName,
      items: next,
    });
  }
  return out;
}

export interface PricedCouponPlan {
  coupon: CouponInfo;
  targetProductCode: string;
  targetProductName: string;
  items: MealItem[];
  /** 挂券后核价得到的金额（真实来自 calculate-price） */
  amount: number;
  baselineAmount: number;
  /** 确实更便宜才为 true */
  cheaper: boolean;
  /** 省下的金额；未真正更低时为 0 */
  saved: number;
  /** 核价不可用（如接口报错/商品不可单独核价），此时不给出任何省钱结论 */
  priceUnavailable: boolean;
  message?: string;
  demo: boolean;
}

/**
 * 门店券的“全量 + 可用性”标注：用于界面展示所有券，并区分彩色可用 / 灰色不可用。
 *  - usable：券的适用商品确实在当前这一餐里（可挂载），不是“能更便宜”；
 *  - 可挂载但核价未更低时，仍算 usable（用户可自行决定是否用），只是不标“更便宜”；
 *  - cheaper / saved 仅在两边都核价成功且确实更低时才有意义。
 */
export interface AnnotatedCoupon {
  coupon: CouponInfo;
  usable: boolean;
  /** 不可用时说明原因（如“适用商品不在这一餐里”“无券码，无法使用”） */
  usableReason?: string;
  targetProductName?: string;
  cheaper?: boolean;
  saved?: number;
  amount?: number;
  priceUnavailable?: boolean;
  message?: string;
  /** 可挂载时附带“挂券后的餐品组合”，供前端一键应用 */
  items?: MealItem[];
}

/**
 * 用“已核价金额”比较，得出是否真的更便宜。
 * 只有当基线核价与挂券核价都成功时，才允许给出“少付 ¥X”。
 */
export function evaluateCouponPlans(args: {
  baseline: { amount: number; priceUnavailable?: boolean; message?: string };
  priced: { candidate: CouponCandidate; amount: number; priceUnavailable?: boolean; message?: string }[];
  demo: boolean;
}): PricedCouponPlan[] {
  const { baseline, priced, demo } = args;
  const out: PricedCouponPlan[] = [];
  for (const p of priced) {
    const bothOk = !baseline.priceUnavailable && !p.priceUnavailable;
    const saved = bothOk ? Math.round((baseline.amount - p.amount) * 100) / 100 : 0;
    out.push({
      coupon: p.candidate.coupon,
      targetProductCode: p.candidate.targetProductCode,
      targetProductName: p.candidate.targetProductName,
      items: p.candidate.items,
      amount: p.priceUnavailable ? 0 : p.amount,
      baselineAmount: baseline.priceUnavailable ? 0 : baseline.amount,
      cheaper: bothOk && saved > 0,
      saved: saved > 0 ? saved : 0,
      priceUnavailable: !!p.priceUnavailable,
      message: p.priceUnavailable ? p.message || '该方案未能核价' : undefined,
      demo,
    });
  }
  // 真正省钱的排前面；核价失败的排最后
  out.sort((a, b) => {
    if (a.priceUnavailable !== b.priceUnavailable) return a.priceUnavailable ? 1 : -1;
    return b.saved - a.saved;
  });
  return out;
}
