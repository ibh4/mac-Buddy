# MCP 工具清单（本项目实际用到）

> 结论来自对 `tools/list` 的**实际读取**，不是凭工具名猜测。
> 调用前仍建议以 `tools/list` 返回的 `inputSchema` 为准。

## 实际使用的工具

| 工具 | 用途 | 关键入参 | 返回要点 |
| --- | --- | --- | --- |
| `now-time-info` | 服务端时间 | 无 | 用于对齐时间口径 |
| `order-list` | 历史订单（只读） | 无 | `orderProductList[]`；`orderStatus` 为「订单已完成」等中文状态 |
| `query-order` | 订单详情 | `orderId` | 用于下单结果不明时核实 |
| `query-nearby-stores` | 门店 | `beType`（1 到店自取 / 2 麦乐送到家 / 5 得来速），`searchType` | `searchType=1` 查收藏/常用餐厅 |
| `query-meals` | 门店菜单 | `storeCode`、`orderType`、`beType` | `data.categories[].meals[]` + `data.meals{code:详情}`；详情页含 `image` |
| `query-meal-detail` | 餐品详情 / 套餐组成 | `storeCode`、`orderType`、`beType`、`code` | `{code,name,rounds,image,supportModify}` |
| `calculate-price` | 真实核价 | `storeCode`、`orderType`、`beType`、`items[]` | **`price` 单位为「分」**（1590 = ¥15.90）；支持按商品传 `couponCode`/`couponId` |
| `create-order` | 创建订单 | 报价相关参数；`orderType=1` 时 `takeWayCode` 必传 | 返回订单号与支付链接 |
| `list-nutrition-foods` | 官方营养资料 | **无入参** | 真实返回是「被 markdown 描述包裹的 JSON」：`## Original Response` 内才是 `{success,code,...,data}`，`data` 才是纯文本表（表头 `[160]{productName,...}:`，每行 `中薯条,null,1210,289,4,12,38,165,18`）。**必须走结构化通道取 `data`**，直接拿纯文本会解析失败→能量卡全空。详见 [`nutrition.md`](nutrition.md) |
| `query-store-coupons` | 门店优惠券 | `storeCode`、`orderType`、`beType` | 返回**数组**：`[{title,couponId,couponCode,tradeDateTime,products:[{productCode,productName}],promotionId}]`；**不含优惠金额**，金额必须由 `calculate-price` 实际核价 |
| `delivery-query-addresses` | 外送地址 | — | 外送场景使用 |
| `delivery-query-stores` | 外送可配送门店 | — | 外送场景使用 |

## 明确不能用 / 不适合的

- `query-promotions`：**仅团餐场景**（`beType=6`），普通点餐的优惠券不要用它，应使用 `query-store-coupons`。
- `query-my-coupons` / `available-coupons`：不适合按“当前门店 + 就餐方式”取可用券。

## 商品图片：怎么拿、边界在哪（实测结论）

**能拿到。** 官方图片地址来自 MCP 返回的 `image` 字段，域名为 `https://menu-img.mcd.cn/...`。

实测样本（真实 Token，2026-10-10 00:2x 北京时间）：

| 编码 | 商品 | `query-meal-detail` 结果 |
| --- | --- | --- |
| `1100` | 巨无霸 | ✅ `https://menu-img.mcd.cn/pcm/prod/menu/20250611/product/MS_1100_600_1749175370846.png`（还返回特制选项） |
| `4810` | 中薯条 | ✅ `https://menu-img.mcd.cn/pcm/prod/menu/20250423/product/MS_4810_600_1745199801147.png` |
| `9900014874` | 买薯送薯 | ❌ `success:false, code:60001`「未匹配到商品，请重新拉取全量商品列表」 |
| `9900010110` | 鱼牛汉堡四件套随心选 | ❌ 同上 |

结论与边界：

1. **单品编码有图，促销/组合编码（多为 `99` 开头）没有图**——接口会明确返回 `60001`，此时就是没有图，**不要**用别的图顶替。
2. **`query-meal-detail` 在门店非营业时间仍可返回单品图片**，而 `query-meals` 此时返回 `600057`。
   所以取图链路**不应因菜单失败而整体失败**，应退化为逐个走详情接口（本项目已这样实现）。
3. 想一次拿全店所有单品的图，只能靠 `query-meals` 的全量列表 → **必须在营业时间**。
   本项目提供 `POST /api/product-images/warm` 与 `scripts/warm-product-images.sh` 做预热，
   预热后把**https 地址**存进本地 SQLite，非营业时间也能正常显示。
4. **绝不**把官方产品图下载打包进仓库：产品摄影有版权，且不符合「原创性声明」与本项目
   「不批量抓取或打包官方图片」的约束。仓库里只有原创 SVG 插画，且统一标注「示意图」。

## 踩过的坑（真实验证记录）

| 现象 | 原因 / 处理 |
| --- | --- |
| `query-meals` 返回 `success:false, code:600057` | 「门店可能已关闭或不在营业时间」。**必须如实上报**，绝不伪装成空菜单 |
| 历史订单里的商品编码在当前菜单里找不到 | 编码可能已变更；只作来源参考，下单前用 `query-meals` 重新核对 |
| `calculate-price` 返回 `success:false` | 促销/赠品不可单独核价或已售罄；标记为「金额暂不可用」，绝不伪造金额 |
| `list-nutrition-foods` 解析失败 | 它是纯文本表格，用 JSON 解析会拿到 null；需走文本通道 |
| 核价带券后金额没变 | 券码需挂在**商品项**上（`items[].couponCode`），不是顶层参数 |
| 拿不到商品图 | 促销/组合编码会返回 `60001`「未匹配到商品」；**单品编码**才有图 |
| 非营业时间整店菜单拿不到，但单品图拿得到 | `query-meals` 返回 `600057`，`query-meal-detail` 仍可用 → 取图要能独立兜底 |
