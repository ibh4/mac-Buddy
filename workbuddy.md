# WorkBuddy 开发记录（workbuddy.md）

> 本文件整理本次真实开发对话与过程，**明确标注哪些是摘要**；不虚构使用记录，不含 Token 或私人订单数据。

## 项目目标（来自用户）

构建 Mac-Buddy · 麦麦搭子（仓库名 **`mcd-buddy`**，参赛名称「Mac-Buddy 麦麦搭子——懂你口味的点餐助手」）：为有固定点餐习惯的人保存“自己的老样子”，支持自然语言微调、保存新版本、比较变化、重新下单；并新增「看懂这一餐（能量卡）」「老样子轻一点」「看看优惠」「看图轻松点」「下单前看一眼」，同时简化前端交互。需同时交付：本地可运行项目、真实接入麦当劳 MCP、Skill、网页前端、必要测试与参赛文档。
明确约束（贯穿全程，从未突破）：**不替用户创建真实消费订单、不支付、不发布公网服务、不提交报名 Issue、不 force push**。

## 已完成的真实步骤（实测，非摘要）

1. **环境与工具检查**
   - 工作目录为空项目；Node 22、Python 3.13 可用；非 git 仓库。
   - 读取官方仓库 `mcd-mcp-server` README：确认传输协议 Streamable HTTP、地址 `https://mcp.mcd.cn`、鉴权 `Bearer <token>`，以及完整工具列表（35 个工具）。

2. **只读连通性验证（开发期实测）**
   - 通过标准 MCP Streamable HTTP 调用 `initialize` → 成功，返回 `mcd-mcp 1.0.0`，协议 `2024-11-05`。
   - 调用 `tools/list` → 返回 35 个工具，并**读取了重点工具的 `inputSchema`**（未猜测参数）。
   - 调用 `now-time-info`（只读）→ 返回真实服务器时间。
   - 调用 `order-list`（只读）→ 返回真实历史订单（含商品与金额）。
   - 调用 `query-nearby-stores` → 返回真实门店。
   - 调用 `query-meals` → 返回真实菜单（分类 + 详情映射）。
   - 调用 `calculate-price`（只读核价）→ 返回真实金额（`data.price` 单位为**分**，已做分→元换算）与 `takeWayList`。
   - **未执行 `create-order`**（遵守不创建真实订单的约束）。

3. **项目脚手架**
   - 建立 npm workspaces 单仓：`server/`（Node+TS 后端）、`web/`（React+TS+Vite 前端）、`skill/`、根文档。
   - 安装依赖：`express, cors, dotenv, @modelcontextprotocol/sdk@1.32.1, better-sqlite3, zod, vitest, react, vite` 等。

4. **后端实现**
   - `mcpClient.ts`：MCP SDK 客户端封装；`extractData` 兼容 `structuredContent` 与“JSON 嵌在说明文字中”的返回（平衡括号扫描）。
   - `service.ts`：餐单模板 / 版本（不可变）/ 差异对比 / 可售性检查 / 核价 / 下单（防重复提交 + 结果不明不重试）/ 自然语言解析与落地。
   - `db.ts`：SQLite（better-sqlite3）存储模板、版本、报价、下单尝试；`server/data/*.db` 已被 `.gitignore` 忽略。
   - `routes.ts` / `index.ts`：REST API；后端仅监听 `127.0.0.1`；同源来源校验。
   - 演示模式与真实模式共用业务逻辑；演示模式返回虚构数据且**不产生真实订单或支付链接**。

5. **前端实现**
   - 原创浅色卡通界面（奶油白 / 红黄配色、SVG 插画、圆角卡片、胶囊标签、柔性阴影），CSS 变量组织主题。
   - 页面：首页 Hero、我的老样子（卡片网格）、餐单详情（修改面板 + 历史时间线 + 差异面板 + 核价下单抽屉）、最近订单、连接设置。
   - 自然语言输入框 + 快捷修改；移动端单列 + 底部操作条，桌面端卡片网格 + 侧边编辑面板。
   - 状态覆盖：加载、空、断网、MCP 未连接、餐品不可售、核价失败、订单状态不明；动画 150–250ms 并尊重 `prefers-reduced-motion`。

6. **Skill 与文档**
   - `skill/SKILL.md`：适用场景、触发语句、两条执行路径、工具调用顺序、本地持久化、版本与对比规则、下单确认与异常处理、安装配置与使用示例。
   - `README.md`、`CONTEST_DECLARATION.md`（官方原文未改）、`MCP_INTEGRATION.md`（真实 schema 与验证记录）、`.env.example`、`mcp-config.example.json`、本文件。

7. **测试与预览**
   - 编写并运行后端单元测试（见“验收标准验证”）。
   - 启动本地服务，验证 SPA 与 API 同时可用、真实只读/核价链路可用。

8. **收尾轮（实测）**
   - 新增 8 个测试文件、共 **30 个用例**，覆盖：持久化（独立连接模拟“重启”）、版本不可变、差异对比、用回旧版不触发真实交易、不可售拦截、核价与报价失效、确认前不下单、防重复提交、下单结果不明（mock 真实模式标记为 unknown 且不重试）、自然语言解析、MCP 返回 JSON 提取。全部通过。
   - 修复 `import-order` 真实模式字段错位：历史订单在真实模式返回字段为 `products`，原代码误读 `orderProductList` 导致导入崩溃；已统一取用。
   - 新增“价格暂不可用”状态：当 `calculate-price` 明确返回 `success:false`（如“买薯送薯”这类赠/促销品不可单独核价、已售罄）时，后端返回 `priceUnavailable:true` 与真实 `message`，前端展示 price-fail 横幅并禁止下单，不再把金额误显示为 ¥0.00。
   - 真实模式端到端复测：导入真实历史订单 → 生成模板与版本（不可变，parentVersionId 正确）→ 对普通商品核价得到真实金额（`15.9` 元，含真实 `takeWayList` 堂食/外带）；全程**未**调用 `create-order`。

9. **增量开发轮：四个入口 + 我的饮食足迹（实测）**
   - 新增纯函数模块（**自身绝不调用 MCP**，便于确定性测试）：`catalog.ts`（分类/价格）、`constraints.ts`（锁定/改动数/预算/可售/套餐校验）、`tweak.ts`（有边界微调，最多 3 方案）、`randomPicker.ts`（mulberry32 + FNV 种子随机）、`foodSign.ts`（食签启发式打分）、`footprint.ts`（足迹统计与画像）。
   - 新增编排层 `generators.ts`：把纯模块与真实 MCP 数据（菜单/可售性/餐品详情/历史订单）组装；菜单按门店缓存 5 分钟，避免“换一个”反复调用 `query-meals`。
   - 新增持久化：6 张表（`synced_orders` / `order_sync_meta` / `feedback` / `prefs` / `item_locks` / `sign_cache`）+ `is_demo` 列迁移（严格区分演示数据与真实订单）。
   - 新增接口：`/api/tweak/generate`、`/api/random/generate`、`/api/sign/generate`、`/api/sign/today`、`/api/price-preview`、`/api/footprint/*`、`/api/feedback`、`/api/prefs`、`/api/locks`、`/api/saved-meals`。
   - 前端新增：首页 2×2 入口卡（原创 SVG：盘子/旋钮/骰子/日历）、`MicroAdjust` / `RandomPick` / `FoodSign` / `Footprint` 四个视图、导航「我的饮食足迹」；翻卡动画与其余动效均受 `prefers-reduced-motion` 约束。
   - 测试：**14 个文件 / 82 个用例全部通过**；server 与 web 均 `tsc` 通过；`npm run build` 通过。

10. **本轮发现并修复的真实缺陷（均为实测暴露，非推测）**
   - `randomPicker.ts`：`buildStructuredCombo` 里误用自由变量 `mainBias`（实际是 `opts.mainBias`）→ `ReferenceError`，导致随机与食签全线失败。已修正。
   - `tweak.ts`：`options.maxChanges || 1` 把 `0` 当作“取默认值”，导致「最多改 0 处」仍产出 3 个方案。改为 `?? 1`。
   - `footprint.ts` `setPrefs`：`INSERT ... ON CONFLICT` 有 2 个 `?` 占位符却只传 1 个参数 → SQLite `RangeError: Too few parameter values`。已改为传两次。
   - `footprint.ts` `computeOrderAnalytics`：去重后的数组算出来了却没用（仍遍历未去重的 `filtered`），且小时分布用 `Date.getHours()`（服务器本地时区）而非北京时间。已改为按 CN 时间字符串直接取小时并使用去重结果。
   - `footprint.ts` `listFeedback`：直接返回 snake_case 行，导致 `targetCode` 为 `undefined`（口味画像里“明确喜欢”显示为 `None`）。已显式映射为 camelCase，并补了回归测试。
   - `generators.ts` `runSign`：`seedNonce` 被放进输入对象，而 `generateDailySign` 期望它作**第二个位置参数** → 种子不推进、「换一份灵感」永远抽到同一份，且防重复逻辑永不触发。已修正为位置参数传入。
   - `service.ts` `getMenu`：`query-meals` 失败（如非营业时间 `code:600057`）时静默返回空菜单，界面会误显示“没有可推荐的餐品”。已改为如实上报 `unavailable/message`，由上层抛出真实原因。

11. **增量开发轮：五项新功能 + 前端简化（实测）**
    - **先探测真实 schema，再写代码**（不臆测字段名）。用 `tools/list` 读到：
      `list-nutrition-foods` **无入参、返回纯文本表格**（不是 JSON，表头 `[160]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:`）；
      `query-store-coupons` 返回**数组**、**不含优惠金额**，`query-promotions` 实测为**团餐专用**（`beType=6`）不能用；
      `query-meal-detail` 返回 `{code,name,rounds,image,supportModify}`；
      **`calculate-price` 支持 `items[].couponCode`/`couponId`**——这是「看看优惠」能给出可信省钱额的关键前提。
    - 新增纯函数模块 `nutrition.ts`（能量卡口径）与 `lighter.ts`（轻一点替换），均不调用 MCP。
    - 新增 `coupons.ts`：只构造「同门店、同就餐方式、同商品、只挂券」的候选；`evaluateCouponPlans` 只在**双方核价都成功且确实更低**时才输出「少付 ¥X」。
    - 新增编排：`ensureNutritionIndex`（营养表缓存 6 小时）、`runNutrition`、`runLighter`、`runCoupons`、`buildImageMap`（菜单图优先，缺失用详情接口补齐，**只接受 https**）。
    - 新增接口：`/api/nutrition`、`/api/lighter`、`/api/coupons`、`/api/product-images`；`/api/prefs` 支持 `energyRefKcal`。
    - 前端：新增 `ProductImage`（固定容器 + `object-fit: contain` + 懒加载 + 失败降级标注「示意图」）、`EnergyCard`（默认只显示能量与蛋白质，其余折叠）、`LighterBar`（三按钮，不宣称「更健康」；当时每目标 ≤2 方案，**后续第 13 条改为最多 4 个方案 + 同类优先 / 跨类兜底**）、`CouponPanel`、`ConfirmSheet`（下单前核对）、`PrefDrawer`；主页面改为 `Order`（点一餐：三入口 → 这一餐 → 核对）；主导航简化为**点一餐 / 我的老样子 / 我的口味**，连接设置移到右上，「最近订单」降为二级入口（功能不丢）；新增「我的口味」页（结论优先，图表与口径收进展开区）；所有按钮带文字、触控区 ≥44×44。
    - 修复：`lessSodium` 曾出现两条同名方案（顶层替换与套餐内替换），已按「原→新」去重并标注替换位置（`scope`）。
    - 测试：新增 `nutrition.test.ts`(17)、`lighter.test.ts`(7)、`coupons.test.ts`(7)；**总计 17 个文件 / 113 个用例全部通过**。

12. **仓库整理轮（实测）**
    - 目录改为 `apps/server`、`apps/web`、`skills/mcd-buddy/{references,scripts}`、`tests/`、`examples/`、`docs/`、`scripts/`；`packages/core` **未建立**（当前无真正共享代码，不为目录好看造空包）。
    - 修正移动后失效的路径：项目根上移一层、`.env` 与 `data` 目录、`apps/web/dist` 托管路径、测试导入路径，
      以及 `tests/unknown.test.ts` 里 `vi.mock('../src/...')`（正则只替换了 `from '../src/` 而漏了 mock 调用，导致该文件在全量运行时失败）。
    - 新增交付文件：`docs/architecture.md`、`docs/demo.md`、`docs/submission.md`、`examples/*`、
      `scripts/{start-demo,start-real,check,prepublish-check,delete-local-data}.sh`；重写 `README.md`；
      更新 `MCP_INTEGRATION.md`（区分**真实接口已验证 / 仅离线测试通过 / 暂未验证**，并补「本地 vs 远端数据」与「异常降级」两节）。
    - `bash scripts/prepublish-check.sh` 全部通过：产物无 Bearer/Authorization、敏感文件命中 .gitignore、
      示例配置只含占位符且 JSON 合法、声明文件标题未改、文档相对链接无失效。

13. **体验与品牌轮：汉堡主题前端、运行即弹出、改名 Mac-Buddy、README 重写（实测）**
    - **前端主题（汉堡风格）**：以 `Burger-Theme-Website` 模板为视觉参考，把暖色背景 + 黄色强调、
      汉堡主图 + 浮动配料贴纸、Aclonica（展示）/ Montserrat（正文）字体融入现有 React 应用；
      仅取用其**通用食物插画与风格**，**不复制其文字内容与品牌**；品牌仍为「麦麦搭子 / Mac-Buddy」，
      页脚保留「非官方产品」声明。首屏 Hero 改为「记得你的老样子，也懂你想换换口味。」+「今天吃什么，一起选。」，
      首页保留四个入口：老样子 / 微微调 / 随机一餐 / 今日食签。
    - **运行即自动弹出网页前端**：自动打开浏览器的行为**集中在后端 listen 回调**（唯一打开者，避免 Vite 与后端重复弹窗）；
      开发模式打开 `5173`（Vite），生产模式打开 `8787`（后端托管已构建前端）；`NO_OPEN=1` 可关闭；
      跨平台用 `open` / `cmd /c start` / `xdg-open`。为让后端区分端口，server 的 dev 脚本注入 `MCD_DEV=1`（cross-env）。
    - **修复：微微调方案数被路由覆盖**——`routes.ts` 的 `/lighter` 曾硬编码 `maxPlans: 2`，
      覆盖了 `generators.ts` 的 `?? 4` 默认值，导致界面只出 2 个方案。已改为 `: 4`。
    - **新增：老样子轻一点给出「配套方案」而非「没有符合条件的替换方案」**——`lighter.ts` 增加 `sameCat` 标记，
      采用**同类优先、跨类兜底**策略；每个目标最多 4 个方案；只有当同类没有能改善该指标的候选时才跨类兜底，
      且**只保留确实改善目标的候选**（不强行跨类）。真实门店复测（1950297）：`moreProtein` 4 个、`lessSodium` 3 个（跨类兜底）、
      `lessEnergy` 1 个，不再返回「没有符合条件的替换方案」。
    - **新增：优惠券面板显示全部券**——`runCoupons` 改为遍历**所有**券，返回 `allCoupons: AnnotatedCoupon[]`；
      可用的按 `calculate-price` 实际核价给出差价与「用这个」，不可用的灰显并给出原因
      （`无券码，无法使用` / `适用商品不在这一餐里`）；前端一行**横向可滑动**，可用为彩色且可点击、不可用为灰色且不可点击。
    - **改名（Mac-Buddy · 麦麦搭子）**——包名 `@mcd-as-usual/*` → `@mcd-buddy/*`；Skill 目录与名称 `mcd-as-usual` → `mcd-buddy`；
      网页标题 / 品牌 / 标语、根包名、`.env.example`、`LICENSE`、`.gitignore`、脚本与文档全部同步。
      命名过程中曾出现「Buddy」与「mac-Buddy」两种写法，已**主动向用户确认**，最终采用 **Mac-Buddy · 麦麦搭子**。
      **刻意保留**：本地数据库文件名 `mcd-old-same.db`（改名会导致既有本地数据丢失）。
    - **README 与文档整理**——按「居中标题与简介 → 为什么做这个 → 功能一览（含实现状态）→ 使用示例 →
      Mermaid 架构图 → Mermaid 业务流程图 → 快速开始 → MCP 接入表 → 技术栈与目录树 → 验证与限制 → 开发记录与许可」
      共 11 节重写 `README.md`；两张 Mermaid 图均为 `flowchart TD`（6–10 节点、中文节点加引号、
      `classDef` 配色 #FFF8EE / #FFF0BD / #FFC72C / #DA291C / #3B2921），**不使用 init / click / 自定义 CSS**；
      截图位置用不可见的 HTML 注释占位，**不伪造图片、不发明仓库地址**（当前目录非 git 仓库，无 remote）。
      同步核对参赛必需文件。
    - **README 视觉再改（参考 `README例子.md`）**——顶部改为居中 Hero：标题 + 标语 + shields.io 徽章行 + **两张图**
      （封面 `docs/images/cover.png` + 网页截图 `docs/images/screenshot.png`，用 `<img>` 占位、不伪造图片）；
      两张 Mermaid 由图例改为**横版多彩**（`flowchart LR` + `%%{init: theme base}%%` + 每节点独立 `classDef`，
      架构 6 节点 / 流程 7 节点），并用 Mermaid 解析器复核通过。
    - **验证**：`npm test`（17 个测试文件 / 113 个用例）、`npm run typecheck`、`npm run build` 全部通过；
      重命名后 `package-lock.json` 重新生成，无旧品牌残留引用。

## 验证结论摘要（以下为结果与口径说明）

- **已验证（真实 MCP）**：连接、工具发现、时间、历史订单、门店、菜单、核价金额换算；非营业时间 `query-meals` 的真实失败码与文案（`600057`）；促销品不可单独核价（`60006`）；
  **老样子轻一点在真实门店（1950297）返回同类 + 跨类配套方案**（`moreProtein` 4 / `lessSodium` 3 / `lessEnergy` 1），**不再出现「没有符合条件的替换方案」**；
  **优惠券面板返回该门店全部券**（可用的按实际核价给差价，不可用的给出原因），横向可滑动、可用彩色可点 / 不可用灰色不可点。
- **已验证（演示模式端到端）**：微微调三方案（每方案改动数=1、锁定生效、`maxChanges=0` 产出 0 方案）、随机三种抽法、种子可复现与「换一个」不重复、食签当日缓存与「换一份灵感」、足迹同步/归属标注/反馈/画像联动、试算金额；
  能量卡（套餐不重复计：513+289+147+289=1238；数量累加：289×2=578；覆盖情况与参考值比对）；
  轻一点三目标（能量 −236 / 蛋白 +9 / 钠 −164，锁定后返回原因与可放宽项且**不自动解锁**）；
  优惠（基线 ¥54.5 → 核价 ¥50.5 / ¥52.5，省钱额来自实际核价）；商品图（演示模式返回空映射 → 界面显示示意图）。
- **未验证（需参赛者手动）**：`create-order` 的真实返回结构与真实下单；`query-meal-detail` 对 `roundList`/`modification` 的精确对齐（若结构无法识别，代码会放弃套餐内替换方案而非猜测）；不同客户端对变量插值的支持；**营业时间内** `query-meals` 成功时各入口的完整真实链路（本次验证窗口在 22:31 北京时间，菜单接口返回非营业时间）；真实商品图在页面上的完整展示（图片地址已确认来自官方 https，但菜单链路未走通）。
- **安全**：Token 仅在后端环境变量使用，不在前端、日志、版本库或截图出现；演示模式不伪造支付链接；本轮新增功能同样**未创建任何真实订单**。

## 备注

- 开发过程中为验证功能，曾在本地启动后端并调用只读工具与核价；**未**创建任何真实消费订单。
- 本文件为开发过程整理，不作为用户隐私或订单数据的存储地。
