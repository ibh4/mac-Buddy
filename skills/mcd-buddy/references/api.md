# 本地后端 REST API

基础路径：`http://127.0.0.1:8787/api`（后端只监听 `127.0.0.1`）。
所有响应统一为 `{ ok: true, data }` 或 `{ ok: false, error }`。

## 状态 / 门店 / 菜单

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/status` | 模式（demo/real）、连接状态、工具清单 |
| GET | `/stores?beType=1` | 门店列表 |
| GET | `/menu?storeCode&orderType&beType` | 门店菜单（含 `image`） |
| POST | `/check-availability` | 当前门店可售性；菜单不可用时返回 `unavailable` 与原因 |

## 餐单模板与版本

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/templates` | 列表 |
| POST | `/templates` | 新建 `{name, note, favorite, snapshot}` |
| GET | `/templates/:id` | 详情 + 版本列表 |
| PATCH | `/templates/:id` | 改元信息 |
| DELETE | `/templates/:id` | 删除 |
| POST | `/templates/:id/versions` | 保存新版本 `{snapshot, changeSummary, parentVersionId}` |
| POST | `/versions/:vid/restore` | 用回某一版（生成新版本，不操作真实交易） |
| POST | `/diff` | 版本差异 `{fromVersionId, toVersionId}` |

## 核价与下单

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/quote` | 核价并落库 `{versionId, storeCode, orderType, beType, items}` |
| POST | `/price-preview` | 试算任意组合，**不落库、不建单** |
| POST | `/quote/validate` | 校验报价是否仍有效 |
| POST | `/orders` | **仅用户确认后**下单，带 `quoteId` 防重复 |
| GET | `/orders/:id` | 下单尝试状态 |
| POST | `/orders/verify` | 用 `query-order` 核实结果 |

> 金额口径：`calculate-price` 返回的 `price` 以「分」为单位，后端统一除以 100 后以「元」返回。

## 四个入口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/saved-meals` | 已保存餐单（含门店与就餐方式） |
| POST | `/tweak/generate` | 今天微微调 `{templateId\|versionId\|items, storeCode, locks, maxChanges, budgetCap\|addYuan}` |
| POST | `/random/generate` | 随机来一份 `{mode: fromSaved\|keepMain\|new, seedNonce, prevPickId, avoidRecent, ...}` |
| POST | `/sign/generate` | 今日食签（当日缓存；`seedNonce>0` 为「换一份灵感」，配 `prevPickId` 避免重复） |
| GET | `/sign/today` | 今日那一签 |

## 这一餐：能量 / 轻一点 / 优惠 / 图片

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/nutrition` | 能量卡 `{items, storeCode, orderType, beType, energyRefKcal}`；返回 `totals`、`coverage`、`partial`、`modificationUnknown`、`usesHistoryItems`、`note` |
| POST | `/lighter` | 老样子轻一点 `{items, goal: lessEnergy\|moreProtein\|lessSodium, storeCode, locks, budgetCap, excludeCodes, maxPlans}` |
| POST | `/coupons` | 看看优惠 `{items, storeCode, orderType, beType}`；金额来自 `calculate-price` 实际核价 |
| POST | `/product-images` | 商品图 `{codes[], storeCode, orderType, beType}`；只返回 https 官方地址，取不到则该编码不在映射里 |

## 饮食足迹 / 偏好

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/footprint/overview?rangeDays=7\|30\|90\|all` | 概览：分析 + 使用统计 + 画像 |
| POST | `/footprint/sync` | 同步历史订单（演示数据标记 `isDemo`） |
| GET | `/footprint/orders` | 已同步订单 |
| POST | `/footprint/owner` | 标注归属 `{orderId, ownerType: self\|shared\|proxy\|unknown}` |
| GET/POST/DELETE | `/feedback` | 口味反馈 |
| GET/PUT | `/prefs` | 偏好（收藏 / 不要出现 / 口味标签 / 锁定 / **能量参考值 `energyRefKcal`**） |
| GET/POST/DELETE | `/locks` | 商品锁定 |

## 自然语言

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/nl-parse` | 把一句话解析为确定性操作 `{text, items, catalog}`；无法理解时返回 `clarification` 而不是瞎改 |
