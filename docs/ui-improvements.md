# UI 改进分支计划

## 目标

在 `codex/ui-improvements` 分支上，把现有的三栏演示骨架推进为可操作的单用户旅行规划工作区：用户可以填写需求、查看结构化行程详情、处理需要确认的事项、修改计划并看到清晰的加载和错误状态。

本分支基于 `codex/langchain-agent-refactor` 的最新提交创建。后端编排、五个 Specialist、`TripPlan` 数据结构和 `/api/chat` 已经可用，因此 UI 优先复用现有契约，避免重新设计后端领域模型。

## 文档审计（2026-09-16）

本轮覆盖 P0–P2，保存方式为浏览器本地存储。审计发现旧基线有三处不准确：Filters 已是只读受控输入而非 `defaultValue`；详情已是基础卡片而非原始 JSON；原来勾选的协调器阶段与可展开摘要尚未完整实现。本轮已补齐下面列出的功能。

## 当前基线

已经具备：

- 左侧 Chats / Trips 目录、聊天区、仅含地图内容的常驻地图，以及覆盖式 Trip Preferences / Your Trip 抽屉（Your Trip 内含时间线与编辑）。
- 首次计划加载时的 skeleton 和 Suspense 边界。
- Chat 向 `POST /api/chat` 发送消息，并将返回的 `plan` 更新到页面。
- 行程区的预算汇总、状态 chip、分段折叠和基础 CTA。

当前实现：

- Filters 是可编辑受控表单，结构化 brief 直接交给编排器；房间分配、最低十分制评分、免费取消偏好随请求传递。
- 详情按逐日活动、交通、住宿、餐饮预算/候选和目的地指南分类；明确展示价格、来源与未核验说明。
- Chat、行程区和 review 共用 HITL 卡片；住宿候选由计算器生成，后端重新查询候选并计算费用。
- Workspace 统一管理请求、重试、聊天与表单；失败保留当前计划，恢复行程后忽略旧响应。
- Saved trips 保存独立快照；My trips 提供当前工作区和浏览器恢复入口；刷新恢复包含计划、未完成表单、聊天输入及历史。
- P3 已接入 Google 地图、逐日时间线和活动编辑预览；真实预订与 on-trip mode 仍不在本轮范围。

## 实施顺序

### P0：让现有页面真正可操作

- [x] 将 `FiltersPanel` 改为受控表单，覆盖目的地、日期、人数、预算和偏好字段。
- [x] 在表单提交时生成新的 `TripBrief`，通过现有 chat/orchestrator 入口重新规划。
- [x] 增加字段校验、提交中状态、接口失败提示和可恢复的错误状态。
- [x] 通过流式进度事件显示任务分配、specialist 执行、冲突检查和计划组装状态。
- [x] 在 ChatPanel 中显示每个 specialist 的队列、执行、修订和完成状态。
- [x] 支持点击 coordinator 或 specialist 展开安全的输入摘要、输出摘要和修订约束。
- [x] 将已有基础卡片完善为按 section 类型渲染的结构化详情卡。
- [x] 为详情卡统一补充标题、摘要、价格、来源/新鲜度说明、状态和主要操作。

### P1：完成确认和 review 流程

- [x] 在 `ChatPanel` 和 `TripPanel` 中渲染 `plan.hitl` checkpoint。
- [x] 为酒店选择、确认 brief、处理冲突等事项提供明确的按钮和选中态。
- [x] 将 HITL 操作结果提交到后端，并用返回的最新 `TripPlan` 更新页面。
- [x] 把 `Review plan` 改为真正的 review 面板，显示待确认项、冲突和预算变化。
- [x] 增加空状态、无结果状态、重试按钮和网络错误提示。

### P2：补齐产品级导航和保存体验

- [x] 实现 `Saved trips` / `My trips` 的页面入口或抽屉。
- [x] 增加保存当前行程、恢复已保存行程和刷新后恢复状态的交互。
- [x] 增加 Header 的用户/语言入口占位行为，并确保键盘和屏幕阅读器可用。
- [x] 统一响应式布局，覆盖窄屏、长标题、长摘要和小预算数值等情况。
- [x] 左侧增加可搜索的 Chats / Trips 本地历史，支持新建、恢复、重命名和删除对话。
- [x] Trip Preferences 与 Your Trip 使用完全移出视口的覆盖式抽屉；右上角 Trip 入口平滑展开并覆盖地图，不挤压主布局。
- [x] 增加防抖自动保存状态；切换记录会中止旧请求，存储失败保留内存计划。
- [x] New chat 创建独立空白会话和空白表单，不继承 demo 或上一段行程。首页不再加载 demo 计划（`/api/demo` 已删除）。
- [x] 空白会话表单与输入可保存恢复；自然语言起步不回退 demo brief；切换前立即落盘挂起的自动保存。
- [x] Your Trip 抽屉恢复时间线、路线校验与活动编辑；地图与时间线共享地点和选中状态。

### P3：可视化编辑（依赖后端能力）

- [x] 增加逐日时间线视图。
- [x] 增加 Google 地图/路线视图和地点详情面板（同屏查看）。
- [x] 支持调整活动顺序、时间和地点，并显示路线、时间和预算冲突。
- [x] 接入真实 Google Places、Routes、Time Zone；支持预览、应用、撤销与本地保存恢复。
- [x] 地图固定进入右侧工作区，并与活动选择、日期和运行时 Places 解析联动。
- [x] 增加用户主动触发的设备定位、独立位置标记、权限错误恢复和无地图降级列表。
- [ ] 后续：真实 Booking 与 on-trip mode（本轮明确不包含）。

## 主要文件范围

优先修改：

- `apps/web/components/FiltersPanel.tsx`
- `apps/web/components/TripSection.tsx`
- `apps/web/components/TripPanel.tsx`
- `apps/web/components/ChatPanel.tsx`
- `apps/web/components/Header.tsx`
- `apps/web/components/Workspace.tsx`
- `apps/web/app/globals.css`

必要时补充：

- `apps/web/app/api/**`：UI 操作需要新的明确 API 入口时再增加。
- `packages/shared/src/**`：只有现有 `TripPlan`/HITL 契约不足以表达 UI 操作时才修改，并在变更前同步说明。
- `packages/services/src/memory/**`：保存和恢复体验需要持久化时，与 UI 一起接入。

## 验收标准

- 用户可以修改目的地、日期、人数、预算和偏好，并看到新的计划结果。
- 每个行程分段都显示可读的详情卡，不再把原始 JSON 作为主要界面。
- `needs_you` 状态会显示对应的 checkpoint，用户可以完成或跳过明确的操作。
- 加载、空结果、接口错误和重试状态都可理解且不会破坏当前计划。
- review 流程能清楚展示待确认项、预算变化和冲突。
- 页面在桌面和窄屏下都能使用，关键操作支持键盘访问。
- 通过 `pnpm typecheck`、`pnpm lint`、`pnpm test` 和 `pnpm build`。

## 暂不处理

- 多用户协作、社交功能、支付和真实 booking fulfillment。
- 在 UI 尚未稳定前大规模重写 Specialist、orchestrator 或共享契约。
- 把 mock Places/Booking 误包装成真实供应商数据；来源和新鲜度必须明确标注。

## 每个 UI 切片的交付要求

每完成一个 P0/P1 切片：

1. 补充对应组件测试或可重复的手动验收步骤。
2. 更新本文件的复选项。
3. 在 `docs/session-logs/` 新增一条简短记录，说明改动、验证结果和遗留问题。

## 本轮接口与验收补充

- `TripBrief.accommodation` 为可选字段，使用 shared/individual、0–10 评分和免费取消约束；未提供时保持旧调用兼容。
- `ChatRequest.mode = "plan"` 必须携带 brief，跳过自然语言提取；旧 chat 请求与最终 ChatResponse 不变。新增协调器阶段及安全摘要进度事件。
- proposal 增加可选住宿段/候选与来源信息；TripPlan 增加可选冲突列表。`POST /api/hitl` 接收计划快照、checkpointId、action 和可选 candidateId，返回 `{ plan }`。
- HITL 支持 approved/rejected/deferred；deferred 仍待处理。确认全程前必须处理其他决策；换酒店或重新规划会重置必要确认。接受冲突后仍展示冲突事实。
- 当前快照兼容版本 1/2；多对话、多行程与面板偏好使用版本 3 目录并在恢复时校验、迁移。损坏数据不自动覆盖，容量不足时保留内存状态。存储仅限同一浏览器，不接入数据库或登录。
- 客户端不是供应商事实来源：酒店决定会重新查询现有 booking port；全程总价从 proposal 项目重新计算。当前 booking 仍为模拟数据，其他计划估算不代表实时供应商报价。
- 自动化与浏览器验收记录见 `docs/session-logs/2026-09-16-ui-p0.md`、`2026-09-16-ui-p1.md`、`2026-09-16-ui-p2.md`。

### P3 验收记录

详见 `docs/p3-implementation.md` 与 `docs/session-logs/2026-09-17-p3-*.md`。Google Maps/Places/步行 Routes/Time Zone 已真实联调；公共交通成功班次未进行真实验收，其日期限制和失败边界通过固定响应验证。

右侧纯地图工作区、覆盖式抽屉、空白新对话、运行时地点解析、设备定位与 Chats/Trips 目录的后续验收见 `docs/session-logs/2026-09-17-workspace-map-shell.md`。

## 工作区界面与交互改版（2026-09-17）

审计发现上一轮提交存在以下缺口，本轮已修复：

- 地图区复用了 `TripEditor` 的 map-only 分支，导致时间线、路线校验、活动移动/改时间/换地点、预览与撤销在界面上完全不可达。
- New chat 只用 `freshChat` 标记隐藏旧计划，内存和首帧中仍持有上一段 Tokyo/demo 计划；空白会话的偏好表单不会保存，刷新后丢失。
- 空白会话用自然语言发送时不带 brief，服务端会用 `DEMO_BRIEF` 补齐缺失字段，把 Tokyo 的日期、人数、预算带进新行程。
- `overflow: hidden` 的工作区仍可被 `scrollIntoView` 横向滚动，露出本应在视口外的抽屉并使地图整体左移。
- 自动保存有 350ms 防抖，在此窗口内点击 New chat 或切换会话会丢弃上一会话的最后修改。
- New chat 中止旧请求后没有复位 `busy`，输入框可能保持禁用。

### 当前结构

| 区域                  | 内容                                                                                         | 实现                                  |
| --------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| 左侧历史栏            | Chats / Trips 搜索、新建、重命名、删除、保存状态                                             | `WorkspaceSidebar`                    |
| 中间聊天              | 对话、规划进度、确认卡片；空白会话显示起步提示                                               | `ChatPanel`                           |
| 右侧地图              | 仅地图、编号标记、地点列表、地图状态、View all places / Show my location                     | `TripMapCanvas` + `TripMap`           |
| 地图右上角            | Preferences 与 Trip 胶囊按钮；Trip 最靠右并显示待处理数量                                    | `Workspace`                           |
| Your Trip 抽屉        | 预算、Overview（分段详情、住宿选择与确认事项）、Timeline & routes（原编辑器）、Review / Save | `Drawer` + `TripPanel` + `TripEditor` |
| Trip Preferences 抽屉 | 结构化偏好表单，从左侧工作区边缘滑入                                                         | `Drawer` + `FiltersPanel`             |

- 地点解析集中在 `useTripPlaces`：地图与时间线共享同一份 Google 地点缓存和选中活动；活动列表变化即中止旧查询，旧 Trip/Chat 的响应不能添加标记。匹配结果只在内存中，不写入计划或 localStorage。部分活动无法匹配时，地图右下角显示紧凑提示和 Retry，不遮挡地图。
- `Drawer` 统一处理 `role="dialog"`、`aria-modal`、`aria-hidden`、`inert`、打开后聚焦关闭按钮、Tab 焦点循环、Escape（内层编辑预览和原生 dialog 优先）以及关闭后把焦点还给触发按钮。
- 抽屉为工作区内的绝对定位层，关闭时平移到自身宽度加侧栏与阴影之外；工作区使用 `overflow: clip`，不可被程序化滚动。桌面 Trip 抽屉宽 `min(max(62vw, 560px), 100% - 24px)`，动画 240ms `cubic-bezier(0.32, 0.72, 0, 1)`，并尊重 `prefers-reduced-motion`。拖动缩放栏已移除（目录版本 3 中的 width 字段仅为兼容保留）。
- 首次渲染前通过 `restoreWorkspace()` 一次性读取存储：活动会话为空白时直接渲染空白状态，不闪现旧行程。（后续导航改版已删除 demo 启动路径，刷新也不再自动打开旧行程，见下一节。）
- 空白会话在 `ConversationRecord.draft` 中保存未完成表单（目录仍为版本 3，字段可选，旧数据兼容）；生成计划后会话以新的 `tripId` 与 Trip 记录关联，标题更新为目的地与日期。
- `ChatRequest.mode = "start"` 用于空白会话的自然语言起步：只从消息中提取字段，缺少目的地、日期、人数或预算时返回可读错误，不回退到 demo brief。
- 切换会话/行程或 New chat 前先立即写出挂起的自动保存，再中止请求并清理进度、错误、选中活动和地图路线。
- 窄屏（≤1000px）继续使用 History / Preferences / Chat / Map / Trip 视图切换；抽屉在该模式下作为静态视图显示，隐藏遮罩、地图浮动按钮和抽屉关闭按钮。

### 验收清单

- [x] 抽屉关闭后边界完全位于视口外，文档宽度等于视口宽度。
- [x] 打开 Trip 前后地图容器宽度与位置不变，Trip 从右侧覆盖地图和部分聊天区。
- [x] 抽屉标题与关闭按钮不重叠；关闭按钮、遮罩、Escape 均可关闭并恢复焦点；两个抽屉互斥。
- [x] New chat 后目的地、日期、人数、预算与聊天输入为空，聊天、地图和 Trip 抽屉中无 Tokyo/demo 内容。（后续改版中空白会话显示地图占位，不再显示世界地图。）
- [x] 地图区域不含时间线、路线编辑器或完整行程卡片；时间线与编辑功能在 Your Trip 抽屉内可用。
- [x] 空白会话保存表单和输入并在刷新后恢复；生成计划前不创建 Trip 记录，生成后稳定关联。
- [x] 地图地点查询与聊天请求可并行，旧查询结果被丢弃。
- 详细验证见 `docs/session-logs/2026-09-17-workspace-redesign.md`。

## 导航、地图定位与空白启动改版（2026-09-17）

基线：`codex/ui-improvements` 的 `fd92058`，与 `origin/codex/ui-improvements` 一致，`origin/main` 无新提交。

### 布局

- 左侧栏为全高产品导航：顶部显示品牌 Logo（`apps/web/public/brand/ai-trip-planner-logo.svg`，原样复制，只通过 URL 引用）；展开态显示 “AI Trip Planner” 文字，折叠态只显示 Logo 并使用 “AI Trip Planner” 作为替代文本。
- 导航项：New chat（加号、品牌色）、Search（放大镜）、Chats（聊天气泡、浅蓝、数量）、Trips（行李箱、浅紫、数量）、Saved trips（书签、浅琥珀、数量），底部为 Language 和 Local account。未加入 Explore、Updates、Inspiration 等不存在的功能。图标为 `components/icons.tsx` 中统一 24px 网格、1.8 线宽的 SVG。
- Chats/Trips 切换历史列表；当前项同时用背景、加粗文字、实心图标和左侧色条表达，并带 `aria-current`。历史仍支持搜索、选择、重命名和删除。
- 侧栏可展开（240px）或折叠（64px）。折叠态隐藏文字和历史，图标保留 `aria-label`、tooltip 和焦点样式；Search/Chats/Trips 图标会展开侧栏（Search 同时聚焦搜索框）。切换按钮使用 `aria-expanded`，宽度动画 200ms 并尊重 `prefers-reduced-motion`。折叠偏好保存在目录 `layout.sidebar.collapsed`；布局字段损坏或来自旧版本时逐项回退默认值，不再让整份历史不可读。
- 原全局 Header 移除：Saved trips 进入侧栏，Language/Local account 进入侧栏底部，原 My trips 对话框中的“恢复上次工作区”并入 Saved trips 对话框。
- 工作区顶栏位于侧栏右侧、横跨聊天与地图，是真实布局行（60px）。左侧显示目的地及“天数 · 人数 · 预算”（只使用计划中的真实值；空白会话显示 “New trip / Not planned yet”），右侧为 Preferences 和最右的 Trip（带待处理数量）。
- Preferences / Trip / 窄屏导航抽屉定位在顶栏下方的聊天与地图区域内，不覆盖 Logo、侧栏或顶栏按钮；遮罩、Escape、焦点返回、`inert` 和关闭后完全移出视口的行为保持不变。
- Google 地图的全屏按钮已关闭，地图只填充顶栏下方空间。
- 窄屏（≤1000px）：顶栏保留菜单、Preferences、Trip，并提供 Chat / Map 切换；左侧导航变为可关闭的抽屉；Preferences 和 Trip 抽屉占满内容区宽度；≤520px 时顶栏按钮只显示图标（保留可访问名称）。

### 空白启动

- 删除 `apps/web/app/api/demo/route.ts` 与 `apps/web/lib/demoPlan.ts`；`Workspace` 不再请求 demo，也没有 demo 初始化或错误回退。`DEMO_BRIEF` 仍留在 orchestrator，仅用于旧聊天接口在缺少 brief 时的兼容基线和单元测试，前端不会走到该路径。
- 页面加载始终进入空白规划入口：刷新不会重新打开上一个行程；上一段空白会话（表单、输入）会继续；没有空白会话时复用一个未改动的空白会话，避免每次刷新新增 “New chat”。已有 Chats、Trips 和 Saved trips 只在用户选择时恢复。
- 空白表单的最低评分默认 `0`（schema 默认值，表示不限），避免空表单提交时报出原始数字校验错误。

### 地点解析

- `lib/place-query.ts` 决定是否查询 Places，优先级：已保存 `placeId` → 活动 `location` 地点名 → 本身就是地点名的短标题（有专有名词、无句子标点、无 visit/walk/arrival 等活动词）。说明性描述、mock 工具占位名（如 “Mock attraction near …”）不查询，也不编造地点。
- 目的地按 “&” 拆成城市，单独用城市名查询，用于地图取景。
- `/api/places/search` 与 `/api/places/details` 区分失败：参数错误 400、失效的地点 404、限流 429、其他上游失败 502，错误文案不包含查询字符串或供应商原始信息。
- `useTripPlaces` 按查询逐个写入结果；无明确地点或无匹配记为“地点待确认”，限流/超时/网络失败记为可重试。地图上只显示轻量状态（如 “2 activities have no confirmed place yet”），已成功的标记保留；Retry places 只重试可重试的失败查询。时间线中对应活动显示 “Location to be confirmed”。

### 地图视角

- `lib/map-view.ts` 的 `MapViewController`（不依赖 Google SDK，可单测）：先按目的地取景（单城市缩放 12，多城市 `fitBounds` 且最大缩放 12，城市逐个解析时逐步扩大范围），有活动标记后对标记执行一次 `fitBounds`（最大缩放 15，单个地点缩放 14）。
- 视角只在行程或目的地变化、或点击 View all places 时重新计算；抽屉开关、重渲染不会移动地图。拖动、缩放（包括控件和键盘）以及 Show my location 都视为用户移动，之后不再自动抢回视角。
- 在有目的地或标记之前不创建 Google 地图，显示中性占位；目的地无法定位或 Places 失败时保留计划并提示，可重试。容器尺寸变化（侧栏动画、窗口变化）时保持地图中心。

详细验证见 `docs/session-logs/2026-09-17-navigation-map-framing.md`。
