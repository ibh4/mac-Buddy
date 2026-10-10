# MCP 接入说明（MCP_INTEGRATION.md）

> 本文记录本项目实际使用的麦当劳 MCP 工具、参数获取方式、调用流程、业务价值，以及**真实验证**与**待验证**项目。
> 所有工具均通过 `https://mcp.mcd.cn`（Streamable HTTP，鉴权 `Authorization: Bearer <token>`）调用。
> 读取参数方式：先 `tools/list` 再 `tools/call`，**未凭工具名猜测参数**。

## 一、接入方式

- 传输协议：**Streamable HTTP**
- 服务地址：`https://mcp.mcd.cn`
- 鉴权：`Authorization: Bearer <MCD_MCP_TOKEN>`（Token 由 `open.mcd.cn/mcp` 申请）
- 本项目两条路径：
  - **WorkBuddy 路径**：使用已配置的 `mcd-mcp` 连接器（连接器配置见 `mcp-config.example.json`）。
  - **网页路径**：后端通过标准 MCP TypeScript SDK（`@modelcontextprotocol/sdk` 的 `StreamableHTTPClientTransport`）连接远端，Token 来自服务端环境变量 `MCD_MCP_TOKEN`，**不进入前端**。

## 二、实际使用的工具与参数（已用 `tools/list` 读取 schema）

| 工具 | 用途 | 必填参数（实测） | 返回关键字段 |
|---|---|---|---|
| `now-time-info` | 获取服务器时间 | 无 | `data.formatted`、`data.timestamp` |
| `order-list` | 历史订单（只读） | 无 | `data.list[]`: `orderId, orderType, createTime, beType, beCode, storeCode, storeName, orderStatus, orderProductList[]{productCode, productName, quantity, comboItemList[]}, realTotalAmount` |
| `query-nearby-stores` | 附近/收藏门店 | `beType`(1/5)、`searchType`(1 收藏/2 按位置)、可选 `city`、`keyword` | `data[]`: `storeCode, storeName, beCode, address, distance, reservation` |
| `query-meals` | 当前菜单 | `storeCode, orderType`(1/2), `beType`(1/2/5/6) | `data.categories[].meals[]{code, name?, tags}` + `data.meals{code:{name, image, currentPrice, tags}}` |
| `query-meal-detail` | 套餐组成/可选项 | `storeCode, orderType, beType, code` | 套餐子项与特制选项（构造 `roundList`/`modification` 用） |
| `calculate-price` | 真实核价 | `storeCode, orderType, beType, items[]` | `data.price`（**单位为分**）、`data.takeWayList[]{code,title}` |
| `create-order` | 创建订单（用户确认后） | `storeCode, orderType, beType, items[]`；`orderType=1` 需 `takeWayCode`；外送需 `addressId` | 订单号、支付链接 |
| `query-order` | 订单详情/核实 | `orderId` | 订单状态、内容 |
| `query-meal-detail` | 餐品详情（含图片） | `storeCode, orderType, beType, code` | 实测返回 `{code, name, rounds:[], image:"https://menu-img.mcd.cn/...", supportModify:false}` |
| `list-nutrition-foods` | 官方营养资料 | **无入参** | **纯文本表格**（不是 JSON）：表头 `[160]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:`，随后每行形如 `中薯条,null,1210,289,4,12,38,165,18` |
| `query-store-coupons` | 门店优惠券 | `storeCode, orderType, beType` | **数组**：`[{title, couponId, couponCode, tradeDateTime, products:[{productCode,productName}], promotionId}]`；**不含优惠金额** |

> `items[]` 结构：`{ productCode, quantity, modification?:{values:[{code,key,quantity}]}, roundList?:[{round, comboItemList:[{code,quantity}]}] }`。
> **核价支持按商品挂券**：`items[]` 可带 `couponCode` / `couponId`，因此「用券后多少钱」可以真正核出来，
> 而不是本地估算。这是「看看优惠」能给出可信省钱额的前提。
>
> **不适合的工具**：`query-promotions` 实测为**团餐场景专用**（`beType=6`），
> 普通点餐取券应使用 `query-store-coupons`；`query-my-coupons` / `available-coupons` 不适合按门店 + 就餐方式取券。

## 三、调用流程（网页路径，后端 `apps/server/src/service.ts` + `mcpClient.ts`）

1. **导入历史订单**：`order-list` → 展示日期/餐品/金额 → 用户选择 → `POST /api/import-order` 存为模板（只存商品意图、数量、套餐组成，历史编码仅作参考；不复制手机号/地址/支付信息）。无历史订单时允许从当前门店菜单手动创建。
2. **保存餐单**：`POST /api/templates`（命名、备注、常用标记）。
3. **创建修改版本**：本地编辑草稿 → `POST /api/templates/:id/versions`（不可变版本，记录父版本与修改说明）。
4. **差异对比**：`POST /api/diff`（新增/移除/替换/数量/特制，文本+图标标签）。
5. **重新匹配与核价**：`query-nearby-stores` 选门店 → `query-meals` 检查可售性 → `calculate-price` 实时报价（分→元）。
6. **确认下单**：用户确认 → `create-order` → 展示真实支付链接；结果不明时 `query-order` 核实，不自动重试。

## 四、业务价值

- 把“固定点餐习惯”沉淀为可复用、可版本化的餐单，降低每次点餐的决策成本。
- 版本管理清晰区分“历史原价”与“当前报价”，避免把历史金额误当现价。
- 自然语言微调 + 表单兜底，兼顾易用与可控；下单前强制核对，强调用户确认。

## 五、真实验证结果（开发期已实测）

> **验证环境**：本地 macOS / Node 22，后端以 `tsx` 运行并只监听 `127.0.0.1`，
> Token 来自 `apps/server/.env`（未提交）。**验证日期：2026-10-09**（北京时间）。
> 下表区分三档：**真实接口已验证** / **仅离线测试通过** / **暂未验证**。

### 5.1 真实接口已验证

| 验证项 | 结果 |
|---|---|
| 连接 `initialize` | 成功，返回 `mcd-mcp 1.0.0`，协议 `2024-11-05` |
| `tools/list` | 返回 35 个工具 |
| `now-time-info`（只读） | ✅ 返回真实服务器时间 |
| `order-list`（只读） | ✅ 返回真实历史订单（含商品与金额） |
| `query-nearby-stores` | ✅ 返回真实门店（`searchType=1` 收藏） |
| `query-meals` | ✅ 返回真实菜单（分类 + 详情映射） |
| `calculate-price`（只读核价） | ✅ 返回真实金额（如单品 ¥15.90，单位换算：分→元）与 `takeWayList` |
| `create-order` | ⚠️ **开发期未执行**（遵守“不替我创建真实消费订单”的约束）；代码已完成并含防重复提交与结果不明处理，留待参赛者手动验证 |
| `query-meal-detail` | ✅ 实测返回 `{code,name,rounds,image,supportModify}`；`image` 为官方 https 图片地址 |
| `list-nutrition-foods` | ✅ 实测可拉取官方营养资料（纯文本表格，160 行左右）；本项目按真实表头解析，不做字段臆测 |
| `query-store-coupons` | ✅ 实测返回门店券数组（含 `couponCode` 与适用商品）；**接口不返回优惠金额**，金额由 `calculate-price` 实际核出 |
| `calculate-price`（带券核价） | ✅ 实测支持 `items[].couponCode` / `couponId`，因此「少付 ¥X」可被真实核价验证（演示模式下为模拟值并标注） |
| `query-meals`（**非营业时间**） | ✅ 实测 22:31（北京时间）返回 `{"success":false,"code":600057,"message":"门店可能已关闭或不在营业时间"}`；本项目据此**如实提示原因**，不伪装成空菜单 |
| `calculate-price`（促销/赠品类） | ✅ 实测“买薯送薯”等不可单独核价时返回 `success:false, code:60006`；本项目标记为 `priceUnavailable` 并展示真实 message，不显示为 ¥0.00 |

### 5.2 暂未验证（受限于非营业时间 / 安全约束）

| 验证项 | 状态与原因 |
|---|---|
| `create-order` 真实下单 | ⚠️ **未执行**。遵守「不替用户创建真实消费订单」的约束；代码已含防重复提交与结果不明处理，留待参赛者手动验证 |
| 下单后的 `query-order` 核实链路 | ⚠️ 未验证（依附于真实下单） |
| 全店商品图一次性预热 | ⚠️ **未能执行**：`query-meals` 需营业时间才能返回全量商品列表（本次 00:2x 仍为 `600057`）。接口与脚本已完成（`POST /api/product-images/warm`、`scripts/warm-product-images.sh`），需在营业时间跑一次 |

> **补记（真实 Token 实测，2026-10-10 00:2x 北京时间）**：单品图片**可以**拿到。
> `query-meal-detail` 在门店非营业时间仍正常返回官方图片地址，实测成功样本：
> `1100` 巨无霸 → `https://menu-img.mcd.cn/pcm/prod/menu/20250611/product/MS_1100_600_1749175370846.png`
> `4810` 中薯条 → `https://menu-img.mcd.cn/pcm/prod/menu/20250423/product/MS_4810_600_1745199801147.png`
> 而促销/组合编码（`9900014874` 买薯送薯、`9900010110` 鱼牛汉堡四件套随心选）返回
> `success:false, code:60001`「未匹配到商品，请重新拉取全量商品列表」——**即单品才有图，组合编码没有图**。
> 本项目据此把取图链路改为：菜单失败时不整体失败，退化为逐个走 `query-meal-detail`（已实测通过）。

### 5.3 仅离线测试通过（演示模式 / 单元测试）

| 能力 | 说明 |
|---|---|
| 能量卡的口径（数量累加、套餐不重复计、缺失不为 0、kJ→kcal） | ✅ 17 个离线单元测试覆盖 |
| 老样子轻一点（锁定/预算/可售/套餐规则、不可比较不给差值） | ✅ 7 个离线单元测试覆盖 |
| 优惠券候选构造与「确实更便宜才说省钱」 | ✅ 7 个离线单元测试覆盖 |
| 微调 / 随机 / 食签 / 足迹统计口径 | ✅ 共 82 个离线单元测试覆盖 |

## 六、待验证 / 注意事项

- `create-order` 的**真实返回结构**（订单号、支付链接字段名）需在实际下单时确认；当前按 `data.orderId/orderNo`、`data.payUrl/paymentUrl` 兼容提取。
- `query-meal-detail` 返回的套餐子项/特制选项结构需在真实下单构造 `roundList`/`modification` 时进一步对齐。**新增说明**：微微调的“套餐内换配角”会用该工具取可替换侧项；若返回结构无法识别，代码会**放弃该类方案而不是猜测**（故非营业时间或结构异常时不会出现套餐内替换方案）。
- `query-meals` **在非营业时间会直接失败**（`code:600057`）。因此微调 / 随机 / 食签依赖菜单的功能需在营业时间内体验；接口失败时会把真实 `message` 透出。
- 历史订单中的商品编码可能与当前菜单编码不同；可售性检查会标记不可售项并请用户替换，已验证该“不静默替换”行为。
- 不同 MCP 客户端对 `mcp-config.example.json` 中 `${MCD_MCP_TOKEN}` 变量插值的支持需自行验证，不能承诺所有客户端直接识别。
- 价格为实时结果，以麦当劳官方渠道为准。
- **菜单缓存**：同一门店/就餐方式的菜单在后端缓存 5 分钟，避免“换一个/换一份灵感”反复调用 `query-meals`；缓存只影响性能，不影响金额——金额始终以 `calculate-price` 为准。

## 七、新增能力对 MCP 的调用方式

| 能力 | 用到的 MCP 工具 | 调用策略 |
|---|---|---|
| 今天微微调 | `query-meals`（目录/价格/可售）、`query-meal-detail`（套餐可替换侧项） | 目录缓存 5 分钟；仅对餐单里**已有**的套餐按需拉取详情，避免无谓调用 |
| 随机来一份 | `query-meals`、`calculate-price`（最终金额） | 候选在本地确定性构建；“换一个”只推进种子，**不重新拉菜单** |
| 今日食签 | `query-meals`、`calculate-price`、`order-list`（近期不重复） | 结果按“日期+门店+时段+意图+偏好版本”缓存到当日结束，保证当日稳定 |
| 我的饮食足迹 | `order-list` | 同步时按 `orderId` 去重（upsert），保留用户已标注的归属；演示数据标记 `isDemo`，不与真实订单混算 |
| 这一餐的能量卡 | `list-nutrition-foods` | 无入参；返回纯文本表格，走文本通道解析；后端缓存 6 小时。**不做每 100g 换算、不重复计套餐、缺失不填 0** |
| 老样子轻一点 | `query-meals`、`query-meal-detail`、`list-nutrition-foods` | 替换候选来自当前门店菜单；套餐内替换需 `query-meal-detail` 允许；营养差值由本地确定性计算 |
| 同样吃，看看优惠 | `query-store-coupons`、`calculate-price` | 券按门店 + 就餐方式取；**每个候选都用 `calculate-price` 实际核价**（券挂在商品项上），只有确实更低才显示省钱额 |
| 看图轻松点 | `query-meals`（`image`）、`query-meal-detail`（`image` 补齐） | 菜单图优先，缺失时按商品编码限量用详情接口补齐；**菜单不可用时退化为全走详情接口**；图片 https 地址缓存 7 天（只存地址，不存图片文件）；**只接受 https 地址**，不拼接、不搜索、不下载打包 |
| 下单前看一眼 | `query-meals`、`calculate-price` | 变化即重新核价并要求重新确认；不可售 / 核价失败如实展示，不显示假金额 |

## 八、本地数据 vs 远端数据

| 数据 | 存放位置 | 说明 |
|---|---|---|
| 餐单模板、版本、报价、下单尝试 | 本地 SQLite（`apps/server/data/mcd-old-same.db`，已 gitignore） | 不上传任何服务器 |
| 同步的订单缓存 | 同上 | 按 `orderId` upsert；演示数据标记 `isDemo`，不与真实订单混算 |
| 偏好 / 锁定 / 反馈 / 食签缓存 | 同上 | 食签缓存到北京时间当日结束 |
| 菜单、营养表、优惠券 | **不持久化**（内存缓存：菜单 5 分钟 / 营养 6 小时 / 券不缓存） | 每次过期后重新向 MCP 拉取，不落库 |
| 商品图片 | **只缓存 https 地址**（本地 SQLite，7 天） | 直接使用 MCP 返回的远端 https 地址；**不下载图片文件、不打包进仓库**（产品摄影有版权，且不符合原创性声明）。仓库内只有原创 SVG 插画作占位 |

## 九、异常与降级处理

| 情况 | 处理方式 |
|---|---|
| MCP 连接超时 / 失败 | 展示「未连接」并提供重试；不伪造数据 |
| 401 / 鉴权失败 | 提示 Token 无效或已过期，引导重新配置 |
| 429 / 限流 | 展示真实返回信息并建议稍后重试；**不盲目重试** |
| 商品不可售 / 编码变更 | 明确指出具体商品并请用户选择，**不静默替换** |
| 菜单不可用（非营业时间，`600057`） | 如实展示官方 message，不伪装成空菜单 |
| 核价失败（如 `60006` 促销不可单独核价） | 标记「金额暂不可用」并展示真实 message，**不显示 ¥0.00** |
| 下单结果不明（超时） | 标记 `unknown`，用 `query-order` 核实，**不自动重试、不伪造支付链接** |
| 营养数据缺失 | 显示「暂无数据」并说明覆盖情况，**绝不填 0** |
| 优惠券接口不可用 | 展示接口返回的真实原因；「没有更合适的优惠」视作正常结果 |
| 商品图加载失败 | 降级为标注「示意图」的插画，页面功能不受影响 |
