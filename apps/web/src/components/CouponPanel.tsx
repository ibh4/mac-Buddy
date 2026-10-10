import React, { useState } from 'react';
import { api } from '../api';
import type { CouponResult, MealItem } from '../types';

// 同样吃，看看优惠。
//  - 有券方案与无券方案是同一门店、同一就餐方式、同一组商品，不为了凑券加东西；
//  - “少付 ¥X”只在核价确实更低时出现，金额来自 calculate-price 实际核价；
//  - 核价失败时只说明情况，不给任何省钱结论；
//  - 有附加条件的券写清条件，交给你自己选；不宣称“已把所有券都用上”；
//  - 没有更合适的优惠是正常结果，不谎报最低价。

export default function CouponPanel({
  items,
  storeCode,
  orderType,
  beType,
  onApply,
  showToast,
}: {
  items: MealItem[];
  storeCode: string;
  orderType: number;
  beType: number;
  onApply: (items: MealItem[], summary: string) => void;
  showToast: (m: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CouponResult | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const r = await api.coupons(items, storeCode, orderType, beType);
      setData(r);
    } catch (e: any) {
      showToast(e?.message || '查询优惠失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card coupon-panel">
      <button className="btn btn-ghost btn-sm" onClick={run} disabled={loading}>
        看看优惠
      </button>

      {loading && <p className="muted small">正在查询当前门店的可用券并核价…</p>}

      {data && !loading && (
        <div className="coupon-result">
          {data.baselinePriceUnavailable ? (
            <p className="caliber small">
              原方案暂时无法核价{data.baselineMessage ? `（${data.baselineMessage}）` : ''}，因此不能比较优惠，只显示已核实的信息。
            </p>
          ) : (
            <p className="small">
              当前这一餐核价：<b>¥{data.baselineAmount.toFixed(2)}</b>
              {data.demo && <span className="demo-tag">演示数据</span>}
            </p>
          )}

          {data.note && <p className="caliber small">{data.note}</p>}

          {/* 全部优惠券：横向滑动，彩色为可挂到这一餐、灰色为不适用 */}
          <p className="small coupon-hint">以下为该门店全部优惠券（彩色可用 · 灰色不适用，不可点击）：</p>
          <div className="coupon-scroll">
            {data.allCoupons.map((a) => (
              <div
                key={a.coupon.couponCode || a.coupon.title}
                className={`coupon-card ${a.usable ? (a.cheaper ? 'cheaper' : 'usable') : 'unusable'}`}
              >
                <div className="coupon-title">{a.coupon.title}</div>
                {a.usable ? (
                  <>
                    <div className="coupon-target">用于「{a.targetProductName}」</div>
                    {a.priceUnavailable ? (
                      <div className="coupon-sub">未能核价{a.message ? `（${a.message}）` : ''}</div>
                    ) : (
                      <div className="coupon-delta">
                        <span className="chip">核价 ¥{a.amount!.toFixed(2)}</span>
                        {a.cheaper ? <span className="chip good">少付 ¥{a.saved!.toFixed(2)}</span> : <span className="chip">未更便宜</span>}
                      </div>
                    )}
                    {a.coupon.condition && <div className="coupon-sub">条件：{a.coupon.condition}</div>}
                    {a.coupon.tradeDateTime && <div className="coupon-sub">有效期至 {a.coupon.tradeDateTime}</div>}
                    {a.usable && !a.priceUnavailable && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          if (a.items) {
                            onApply(a.items, `使用「${a.coupon.title}」`);
                            showToast('已应用到这一餐（还没下单，核对页会再核价一次）');
                          }
                        }}
                      >
                        用这个
                      </button>
                    )}
                  </>
                ) : (
                  <div className="coupon-sub unusable-reason">{a.usableReason}</div>
                )}
              </div>
            ))}
          </div>

          <p className="caliber small">
            这里不会自动领券、开通会员或使用积分；也不会为了凑券让你多点东西。是否使用由你决定。
          </p>
        </div>
      )}
    </div>
  );
}
