# UI 改进分支计划

## 目标

在 `codex/ui-improvements` 分支上，把现有的三栏演示骨架推进为可操作的单用户旅行规划工作区：用户可以填写需求、查看结构化行程详情、处理需要确认的事项、修改计划并看到清晰的加载和错误状态。

本分支基于 `codex/langchain-agent-refactor` 的最新提交创建。后端编排、五个 Specialist、`TripPlan` 数据结构和 `/api/chat` 已经可用，因此 UI 优先复用现有契约，避免重新设计后端领域模型。

## 文档审计（2026-09-16）

本轮覆盖 P0–P2，保存方式为浏览器本地存储。审计发现旧基线有三处不准确：Filters 已是只读受控输入而非 `defaultValue`；详情已是基础卡片而非原始 JSON；原来勾选的协调器阶段与可展开摘要尚未完整实现。本轮已补齐下面列出的功能。

## 当前基线

已经具备：

- 左侧 Chats / Trips 目录、聊天区、常驻地图，以及覆盖式 Trip Preferences / Your Trip 抽屉。
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
- [x] New chat 创建独立空白会话和空白表单，不继承 demo 或上一段行程；demo 只用于首次示例填充。

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
