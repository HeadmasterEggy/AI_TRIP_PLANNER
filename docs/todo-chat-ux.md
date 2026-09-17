# 待办：聊天输入、货币与地区、输出语言与侧边栏

本文件是一份**执行清单**，不是已完成工作的记录。五项待办全部落地后，本文件应删除，或移入
[`archive/`](archive/) 并把结论并入 [`workspace-ui.md`](workspace-ui.md) /
[`architecture.md`](architecture.md)。

调研基于 `eb2275a`（已通过 PR #15 合入 `main`）。所有行号对应该提交，改动时会漂移，请以函数名为
准。

## 已确定的决策

| 议题 | 决定 | 备注 |
| --- | --- | --- |
| 货币实现方式 | **方案 A：只改显示层** | 内部一律保持 USD；`packages/shared` 契约零改动 |
| 汇率来源 | **先静态**（代码内常量表） | 离线、可测、无外部依赖；后续如需实时再换适配器 |
| 语言的层次划分 | **分 3 层，机制不混** | 对话/计划内容走模型；界面走字典；数字日期走 `Intl` |
| 地区格式化（locale） | **并入货币分支** | `Intl` 是货币与语言的天然交汇点，落点是同一批代码 |
| Agent 输出语言 | **走模型 prompt 注入**，不走字典 | 计划内容是模型生成的，文案无限，字典翻不了 |
| 界面 i18n | **本次不做** | 收益/成本比最低；方案已完整记录在末节，想做时可直接照做 |
| 货币设置入口 | **`Trip Preferences` 抽屉内**，紧挨 `Total budget` 字段 | 预算就在那里输入，位置最自然，且不新增弹窗 |
| ⋮ 菜单位置 | **侧边栏历史项右侧**，交互对齐 Codex / Claude | 不是聊天面板头部 |
| 分支策略 | **拆 4 个分支** | 见下表 |

## 分支与执行顺序

按「独立、风险低、可快速 review」优先：

| 顺序 | 分支 | 内容 | 主要落点 | 依赖 |
| --- | --- | --- | --- | --- |
| 1 | `fix/duplicate-new-chat` | New chat 重复点击产生多个空对话 | `apps/web` | 无 |
| 2 | `feature/sidebar-chat-menu` | Rename / Delete 收进 ⋮ 菜单 | `apps/web` | 无 |
| 3 | `feature/chat-date-parsing` | 日期输入放宽到多格式 | `packages/orchestrator` | 无 |
| 4 | `feature/currency-and-locale-display` | 预算按设置显示货币 + 地区化数字/日期格式 | `apps/web` + `packages/*` 文案 | 无（设置入口已定为 Trip Preferences 抽屉） |
| 5 | `feature/agent-output-language` | Agent 按用户语言输出计划内容与回复 | `packages/orchestrator` + `packages/agents` | 无 |
| — | *(未排期)* `feature/ui-i18n` | 界面文案字典 | `apps/web` | 见末节；**先不建分支** |

1 和 2 都是纯前端、互不冲突，可以并行。3 独立。4 和 5 分别改 `apps/web` 与 `packages/*`，彼此不冲突，
但都建议在前三项合入后再开。界面 i18n 未排期。

---

## 1. 日期输入放宽

**分支**：`feature/chat-date-parsing`

### 现象（已用真实函数实测复现）

| 输入 | `extractBriefPatchLocally` 结果 |
| --- | --- |
| `Tokyo, 2026-10-01 to 2026-10-05, 2 people, budget 3000` | ✅ destination + dates + groupSize + budget |
| `Tokyo, Oct 1 to Oct 5 2026, 2 people, budget 3000` | ❌ **dates 丢失** |
| `东京，2026年10月1日到10月5日，2人，预算3000` | ❌ **dates 丢失** |
| `Tokyo, 01/10/2026 to 05/10/2026` | ❌ **dates 丢失** |
| `Tokyo, 2026-10-01 ~ 2026-10-05` | ❌ **dates 丢失**（`~` 不在分隔符表内） |

后果：`mode: "start"` 下抛 `IncompleteBriefError`，前端提示
`To start planning, include the start and end dates (YYYY-MM-DD), ...`，用户只能重发。

### 顺带发现的两个同类缺陷

| 输入 | 问题 | 位置 |
| --- | --- | --- |
| `... ，2个人，预算3000` | **`2个人` 丢失**：正则要求数字后直接跟 `人`；中文分支只认「一/二/两…」，阿拉伯数字 + `个` + `人` 两边都不认 | `chat.ts:107`、`chat.ts:110` |
| `东京，2026-10-01 到 2026-10-05，2人` | **destination 丢失**：中文目的地正则强制要求 `去` / `前往` / `目的地` 前缀，直接说地名不行 | `chat.ts:136` |

### 根因：三层都是 ISO-only

1. **规则解析器** — `packages/orchestrator/src/chat.ts:96-99`，只认 `\d{4}-\d{2}-\d{2}`，分隔符只有
   `to|through|until|–|—|至|到`
2. **GPT 提取器** — `chat.ts:168` 的 `extractionPrompt` 被三句话夹死：`Dates must be YYYY-MM-DD.` +
   `Do not infer dates` + `Budget is total USD.`。模型既「不能推断」又「不能输出非 ISO」，遇到
   `Oct 1` 只能返回 `null`
3. **Schema** — `chat.ts:20`、`chat.ts:62-68` 用 `regex(ISO_DATE)` 卡死；`chat.ts:160` 报错文案也是
   ISO 专用

### 改动清单

| 文件 | 位置 | 改动 |
| --- | --- | --- |
| `packages/orchestrator/src/chat.ts` | 新增函数 | `parseNaturalDate()`，接受 `2026-10-01`、`2026/10/01`、`01/10/2026`、`Oct 1 2026`、`October 1, 2026`、`2026年10月1日`、`10月1日`（在有年份的上下文中补年）、`10-01`（同月跨日） |
| 同上 | `chat.ts:96-99` | 放宽分隔符：`~`、`-`、`—`、`to`、`until`、`through`、`–`、`至`、`到`；结果交给 `parseNaturalDate()` 归一化 |
| 同上 | `chat.ts:107`、`chat.ts:110` | 补 `2个人` / `2 位`；顺带考虑 `two people` |
| 同上 | `chat.ts:136` | 中文目的地去掉强制 `去` / `前往` / `目的地` 前缀 |
| 同上 | `chat.ts:168` | 拆清职责：明确告诉模型「把日期归一化成 `YYYY-MM-DD` 是格式转换，不是推断」；把 `Budget is total USD` 的措辞与货币方案对齐 |
| 同上 | `chat.ts:16`、`chat.ts:20`、`chat.ts:62-68` | **保持 `ISO_DATE` 作为输出约束**，入口解析放宽、归一化后再进 schema |
| 同上 | `chat.ts:160` | 报错文案去掉 `in YYYY-MM-DD format`，改成用户能听懂的话 |
| 同上 | `chat.ts:45` | `REQUIRED_START_FIELDS` 里的 `"start and end dates (YYYY-MM-DD)"` 同步改文案 |
| `apps/web/components/ChatPanel.tsx` | `:50` | 空会话引导语 `dates (YYYY-MM-DD)` 改成人类说法 |
| `apps/web/components/FiltersPanel.tsx` | `:49-50` | 已是 `<input type="date">`，**无需改动** |

**关键设计**：`TripBrief.dates` 内部**保持 ISO 不变**，只放宽入口解析。因此
`packages/agents`、`packages/tools`、`apps/web/lib/google.ts` 一行都不用动。这是风险最低的切法。

### 测试

`packages/orchestrator/src/chat.test.ts` 目前只有 ISO 正例（`:29`、`:35-42`、`:194`）。需要补：

- 表驱动测试：一张「多种输入格式 → 同一个 ISO 输出」的映射表
- `2个人` / `2 位` 的 groupSize 用例
- 无 `去` 前缀的中文目的地用例
- 负例：`2026-02-30`（假日期）、`2026-10-05` → `2026-10-01`（结束早于开始）应继续报错
- 回归：`chat.test.ts:171` 断言了旧的提示文案 `include the start and end dates (YYYY-MM-DD)`，**改文案时必须同步改这条断言**

### 验收标准

- 上表 5 个输入全部解析出正确的 `dates`
- `TripBrief` 契约、`packages/shared`、其余包零改动
- `pnpm typecheck && pnpm test && pnpm build` 全过

---

## 2. 货币与地区格式化

**分支**：`feature/currency-and-locale-display`
**方案**：A（只改显示层）· 汇率静态 · locale 与货币合并处理

### 现状

- UI 只有一个格式化函数：`apps/web/lib/workspace.ts:17-23` 的 `money()`，硬编码 `en-US` + `USD`
- `packages/shared/src/contracts.ts:66` 注释明写 `estCost rule (currency = USD) is frozen by A`；
  字段名也是 `pricePerNightUsd`、`dailyBudgetPerPersonUsd` —— **本次不动**
- **14 处** `money()` 调用，分布在 6 个文件：

  ```
  CheckpointCards.tsx:62
  ProposalDetails.tsx:33, 64, 87
  TripPanel.tsx:57, 63
  TripSection.tsx:44
  Workspace.tsx:70, 434, 471, 886, 887, 892, 961
  ```

- 约 **30 处硬编码 `USD` 文案**，其中大部分是**服务端生成的 plan 文本**（`summary` / `detail`）：

  | 文件 | 条数 | 用户可见 |
  | --- | --- | --- |
  | `packages/agents/src/accommodation/index.ts` | 6 | 是 |
  | `packages/agents/src/dining/index.ts` | 5 | 是 |
  | `packages/orchestrator/src/budget.ts` | 4 | 否（抛错消息，正常流程不出现） |
  | `packages/orchestrator/src/hitl.ts` | 3 | 是 |
  | `packages/orchestrator/src/chat.ts` | 3 | 是（含 `:246` 的降级回复） |
  | `apps/web/components/TripEditor.tsx` | 3 | 是 |
  | `packages/tools/src/booking.ts` | 2 | 1 是（`:92` 的 mock fare detail） |
  | `packages/orchestrator/src/supervisor.ts` | 2 | 是 |
  | `packages/agents/src/transport/index.ts` | 2 | 是 |
  | `packages/orchestrator/src/workflow.ts` | 1 | 是 |
  | `apps/web/lib/workspace.ts` | 1 | 是（`money()` 本身） |
  | `apps/web/components/FiltersPanel.tsx` | 1 | 是（`Total budget (USD)` 标签） |

### ⚠️ 服务端文案必须先处理，否则 UI 会自相矛盾

方案 A 只改显示层，但 plan 的 `summary` / `detail` 是**服务端拼好的字符串**。若不处理，卡片显示
`¥10,800` 而同一张卡片下面的 detail 仍写 `USD 1480.00`。

三个选项：

| 选项 | 做法 | 评价 |
| --- | --- | --- |
| (i) 不动服务端文案 | 卡片 `¥`、detail `USD` | ❌ 自相矛盾，不能就这样发 |
| (ii) **服务端文案去掉单位** | 只留数字，单位由 UI 的 `money()` 负责 | ✅ **推荐**：符合方案 A 的「显示层负责呈现」，契约仍不变 |
| (iii) 把显示货币传给服务端 | 按货币生成文案 | ❌ 把 UI 偏好写进规划链路，破坏方案 A 的前提 |

选 (ii)。这是第 2 项里**最大的一块工作量**，涉及约 20 条字符串 + 对应测试。

### 改动清单

| 文件 | 位置 | 改动 |
| --- | --- | --- |
| `apps/web/lib/format.ts` | 新增 | 静态汇率表（USD 为基准）+ `convert()` + `formatMoney(value, code, locale)` + `formatDate(value, locale)`；支持的货币码与展示精度集中在此。若只做货币可命名为 `currency.ts` |
| `apps/web/lib/workspace.ts` | `:17-23` | `money()` 改为按货币格式化，或在 `currency.ts` 提供实现后由此转发 |
| 新增 | 货币上下文 | 用 React context + `useMoney()` 避免向 6 个组件透传 props；**推荐**，否则要改 14 个调用点的签名 |
| 上述 14 个调用点 | 见上表 | 改用 `useMoney()`（或接收新的 `code` 参数） |
| `apps/web/lib/workspace-catalog.ts` | `:42-50` `PanelLayout` | 加 `currency: { code: string }` |
| 同上 | `:61-67` `DEFAULT_LAYOUT` | 加 `currency: { code: "USD" }` |
| 同上 | `:95-125` `normalizeLayout` | 校验 `code` 是否在支持列表内，否则回退 `"USD"` |
| 同上 | `:375-393` `updateCatalog` | `layout` 合并分支里补 `currency: { ...next.layout.currency, ...patch.layout.currency }` |
| `apps/web/components/FiltersPanel.tsx` | `:59` | `Total budget (USD)` 标签改为跟随所选货币；**新增货币选择控件**，值写入 `PanelLayout.currency.code` |
| `packages/agents/src/**`、`packages/orchestrator/src/**` | 约 20 条 `summary` / `detail` | 去掉 `USD ` 前缀与 `(USD ...)` 措辞，只留数字 |
| `apps/web/components/TripEditor.tsx` | `:249`、`:386-387` | 去掉硬编码 `USD`，改用 `useMoney()` |

**无须 catalog 版本升级**：`parseCatalog` 会调 `normalizeLayout`（`:230`），旧数据缺 `currency`
时自动落到默认值。确认这一点已由现有 `normalizeLayout` 兜底逻辑覆盖。

### 货币设置入口

放在 **`Trip Preferences` 抽屉内，紧挨 `Total budget` 字段**（`apps/web/components/FiltersPanel.tsx:59`
附近）。

选择这个位置的理由：预算本来就在那里输入，用户的心智模型一致；不新增弹窗；侧边栏不再多一个常驻项
（已经有 Language / Saved trips / account）。

曾考虑但未采用：

- 新增侧边栏入口 —— 侧边栏已有 4 个常驻项，且与预算输入位置脱节
- 复用现有 `Language` 弹窗（`Workspace.tsx:972`）—— 语义混淆，且该弹窗本次明确不改

因此 `FiltersPanel.tsx:59` 的改动不只是把 `Total budget (USD)` 标签改成跟随货币，还要**新增一个货币
选择控件**（`<select>` 或等价组件），其值写入 `PanelLayout.currency.code`。

### 地区格式化（第 3 层：locale，与货币合并做）

`Intl` 是货币与语言的**天然交汇点**，两者共用同一批代码，因此不单独开分支：

```ts
new Intl.NumberFormat(locale, { style: "currency", currency })
new Intl.DateTimeFormat(locale, { dateStyle: "medium" })
```

- `apps/web/lib/workspace.ts:17-23` 的 `money()` **已经是 `Intl`**，只需把写死的 `"en-US"` 换成参数
- `locale` 与 `currency` 一样存进 `PanelLayout`（`workspace-catalog.ts:42-50`），走同一套
  `normalizeLayout` 回退逻辑
- **`locale` 与 `currency` 独立**：可以选中文界面 + 美元预算。不要从语言推导货币

这一层还负责日期显示：目前多处用 `dates.join(" to ")`（如 `workflow.ts:138`、`supervisor.ts:49`、
`hitl.ts:13`）拼英文，应该改用 `Intl.DateTimeFormat`。这恰好与下一节的「服务端文案去单位」是同一批字符串，
**一次改完**。

### 测试

- `apps/web/lib/currency.test.ts`：新增，覆盖换算、精度、未知货币码回退
- `apps/web/lib/workspace-catalog.test.ts`：`normalizeLayout` 对缺失 / 非法 `currency.code` 的回退
- `apps/web/components/ProposalDetails.test.tsx`：断言里含 USD 文案，改文案后需同步
- `apps/web/components/Workspace.test.tsx`：`:158`、`:324`、`:346` 断言了 `Total budget (USD)` 这个 label，**改名后必须同步**
- `packages/agents/src/accommodation/index.test.ts`：断言含 USD 文案，需同步

### 验收标准

- 切换货币后，**同一屏内**卡片、detail、编辑预览单位一致
- `packages/shared` 零改动
- 无货币设置时行为与改动前**完全一致**（默认 USD 是回归基线）

---

## 3. 侧边栏历史项 ⋮ 菜单

**分支**：`feature/sidebar-chat-menu`
**交互**：侧边栏历史会话项的右侧，样式与交互对齐 Codex / Claude

### 现状

`apps/web/components/WorkspaceSidebar.tsx:227-241` 在**每一个**历史项下面常驻渲染两个文字按钮：

```tsx
{section === "chats" && (
  <div className="history-item__actions">
    <button aria-label={`Rename ${item.title}`} onClick={() => onRenameChat(item.id)}>Rename</button>
    <button aria-label={`Delete ${item.title}`} onClick={() => onDeleteChat(item.id)}>Delete</button>
  </div>
)}
```

CSS：`globals.css:1259-1262` `.history-item`（注意 `overflow: hidden`）、`:1288-1297`
`.history-item__actions`（常驻 flex 行）。

### 改动清单

| 文件 | 位置 | 改动 |
| --- | --- | --- |
| `apps/web/components/WorkspaceSidebar.tsx` | `:227-241` | 删掉常驻按钮，改为 `⋮` 触发按钮 + 弹出菜单（Rename / Delete） |
| `apps/web/components/WorkspaceSidebar.tsx` | `:74-75`、`:95-96` | props 签名不变（`onRenameChat` / `onDeleteChat` 仍由上层持有） |
| `apps/web/app/globals.css` | `:1259-1262` | **`.history-item` 的 `overflow: hidden` 必须去掉或改 `visible`**，否则绝对定位菜单会被裁掉 |
| 同上 | `:1288-1297` | `.history-item__actions` 从常驻 flex 行改为绝对定位浮层；`.history-item` 加 `position: relative` |
| 同上 | 新增 | `.history-item__menu` 样式 |
| `apps/web/components/Workspace.tsx` | `:555-584` | `renameChat` / `deleteChat` 现用 `window.prompt` / `window.confirm`。**建议本次保留**（改动最小），仅当作菜单的两个 action |

### 无障碍要点

项目在这块一直做得比较细，建议跟上：

- 触发按钮：`aria-haspopup="menu"`、`aria-expanded`
- 菜单项：`role="menuitem"`；菜单容器 `role="menu"`
- `Escape` 关闭菜单，且**不要冒泡去关抽屉** —— 注意 `Drawer.tsx:52-54` 已有
  `if (document.querySelector("dialog[open]")) return;` 这类先手处理，菜单要么走原生 `<dialog>`，
  要么显式 `stopPropagation` 并在 `Drawer` 的 Escape 判断里登记
- 点击外部关闭；关闭后焦点回到 `⋮` 按钮
- 折叠态（64 px 图标栏）下历史列表本就不渲染（`:204` 的 `{!isCollapsed && ...}`），**无需处理**

### 测试

`apps/web/components/Workspace.test.tsx` 与侧边栏相关用例需要调整：目前 Rename / Delete 是可直接
`getByRole("button", { name: /Rename/ })` 命中的常驻按钮，改成菜单后必须先点 `⋮`。需要补：

- 默认状态下 Rename / Delete **不可见**
- 点 `⋮` 后菜单出现、两项可点
- `Escape` / 点击外部关闭，焦点回到 `⋮`
- 折叠态下无 `⋮`

### 验收标准

- 历史项默认只显示标题 / 副标题 / 时间，视觉干净
- 键盘可完整操作（Tab 到 `⋮` → Enter → 选 Rename → 焦点回位）
- 菜单不被 `.history-item` 裁切

---

## 4. New chat 重复点击 bug

**分支**：`fix/duplicate-new-chat`

### 现象（已用真实组件测试复现）

```
点击 3 次 New chat 后：
["New chat", "New chat", "New chat", "Sydney · 2026-10-01 – 2026-10-04"]
对话总数: 4          ← 正确应为 2
```

### 根因：有两套「复用空对话」逻辑，只有一套生效

**① 页面加载路径（有效）** — `apps/web/lib/workspace-catalog.ts:444-472`

```ts
const isBlank = (item) => !item.tripId && !item.snapshot;
// Untouched 表示用户没有输入任何行程信息；筛选器默认值不算。
const untouched = (item) =>
  isBlank(item) && !item.messages.length && !item.input.trim() &&
  (["destination","start","end","groupSize","budgetTotal","nationality"] as const)
    .every((key) => !item.draft?.[key]?.trim());
// 取 updatedAt 最新者复用
```

**② 按钮点击路径（失效）** — `apps/web/components/Workspace.tsx:531-554`

```ts
function newChat() {
  const id = `conversation:${crypto.randomUUID()}`;   // ← 无条件新 id
  ...
  setCatalog((current) => upsertConversationDraft(current, { id, ... }));
}
```

而 `upsertConversationDraft`（`workspace-catalog.ts:326-350`）判重靠 id：

```ts
const existing = next.conversations.findIndex((item) => item.id === conversation.id);
...
} else next.conversations.unshift(record);   // ← 新 UUID 永远走这里
```

**结论：刷新页面能去重，点按钮不能。**

### 改动清单

| 文件 | 位置 | 改动 |
| --- | --- | --- |
| `apps/web/lib/workspace-catalog.ts` | 新增导出 | 把 ① 的 `untouched` 判断提成**唯一**函数，例如 `reusableBlankConversation(catalog)` |
| 同上 | `:444-472` | `readHistory` 改为调用该函数，消除双实现 |
| `apps/web/components/Workspace.tsx` | `:531-554` | `newChat()` 先查可复用的空对话：有则复用其 id、只刷新 `updatedAt`，**不再 `unshift` 新记录** |

`newChat()` 里的 `resetTransient()` / `setPlan(undefined)` / `setDraft(blankDraft())` /
`setMessages([])` / `freshTripId.current = ...` 等清空动作**照旧保留** —— 这是用户点 New chat 的真实
意图，只是不再新增历史记录。

### 必须处理的边界情况

1. **当前已在空对话里点 New chat** → 应为无操作（已经是空的），而非重建
2. **历史里存在多个空对话**（旧数据，或用户手动 rename 过的）→ 复用最新的一个；**不主动删多余的**
   （删除是破坏性操作）。是否需要一次性清理可另开任务
3. **用户 rename 过的空对话**（`renamed: true`）→ `upsertConversationDraft:344-348` 会保留自定义
   title；复用时要确保不把用户起的名字改回 `New chat`
4. **正在规划中**（busy）点 New chat → 现有逻辑会 abort 请求（`Workspace.tsx:381` 附近的 late-response
   防线），复用方案**不能破坏**它
5. **`activeTripId` 必须清掉** —— `upsertConversationDraft` 末尾有 `delete next.activeTripId`，改用
   复用路径后要显式保留这个语义

### 测试

`apps/web/components/Workspace.test.tsx` 现有用例 `:136-175`
（`starts a blank conversation instead of carrying the demo trip into New chat`）断言点 1 次后
`conversations` 长度为 2。需要补：

- 连点 N 次 → 长度仍为 2
- 点 New chat 后刷新页面 → 长度仍为 2
- 已在空对话里点 New chat → 长度不变、输入框已清空
- rename 过的空对话被复用 → title 保持用户输入
- 规划中（busy）点 New chat → 请求被 abort，且不新增记录

### 验收标准

- 任意次点击 New chat，空白对话**最多一条**
- 刷新页面行为与改动前一致（不回归现有去重）
- 单一实现：`untouched` 判断只存在于 `workspace-catalog.ts` 一处

---

## 5. Agent 输出语言

**分支**：`feature/agent-output-language`
**对应层次**：语言问题的第 1 层（对话与计划内容）

### 现状

「语言」在本项目里是**三个独立问题**，机制必须分开，用同一个方案解会失败：

| 层次 | 现状 | 证据 |
| --- | --- | --- |
| **A. 对话回复** | ✅ **已经做对** | `chat.ts:270` 的 `replyPrompt` 已含指令 `Detect the language of the traveler's latest message and reply in that exact same language. Do not default to English` |
| **B. 计划内容**（卡片 `summary` / `detail`、HITL checkpoint） | ❌ 英文硬编码，**即使配了模型也不会变中文** | 5 个 specialist 的 `systemPrompt` 里没有任何输出语言指令；确定性兜底约 **48 处**英文拼装 |
| **C. 界面文案** | ❌ 英文硬编码，零 i18n 框架 | 见末节「未排期」 |

所以 Language 弹窗里那句 `You can chat in your preferred language` 目前**只对回复成立，对计划内容不成立**。

### 根因

计划内容是**模型生成**的，文案空间无限，用字典翻译不可行。唯一正确的做法是**让模型用目标语言输出**。

### ⚠️ 有一个共享契约要动（与第 2 项不同）

`locale` 是浏览器里的设置，必须传给服务端；而客户端→服务端的契约是
`packages/shared/src/chat.ts:9-18` 的 `ChatRequest`。所以**本项无法像第 2 项那样做到
`packages/shared` 零改动**。

两种设计：

| 设计 | 做法 | 代价 |
| --- | --- | --- |
| **1. 服务端从消息推测语言** | 复用 `replyPrompt` 已有的「检测用户消息语言」思路，服务端自己定语言 | `packages/shared` 零改动，但**没有真正的设置** —— 用户设了中文却打英文提问就会变英文 |
| **2. 显式传 `locale`** | `ChatRequest` 加一个**可选**字段 | 动 `packages/shared/src/chat.ts`，但**只是新增可选字段**，不是改 `TripBrief` / `estCost` / `pricePerNightUsd` |

**推荐设计 2 + 设计 1 做兜底**：传了 `locale` 就用它；没传（旧客户端）则回退到消息语言检测。这样既是真正的设置，
也保持向后兼容。

> 注意：`ChatRequest` 属于「会话请求」契约，和 `team-workflow.md` 里那句「Don't edit `packages/shared` without
telling the team」所指的**冻结行程契约**（`TripBrief`、`estCost` 规则）不是一回事。新增一个可选字段风险低很多，
但依旧要知会团队并在 `api.md` 里补上。

### 改动清单

| 文件 | 位置 | 改动 |
| --- | --- | --- |
| `packages/shared/src/chat.ts` | `:9-18` `ChatRequest` | 加**可选** `locale`（如 `z.enum(["en","zh"]).optional()`）；`agents/destination-guide/dining.ts` 现有的可选字段（`mode`）就是先例 |
| `apps/web/components/Workspace.tsx` | 发 `/api/chat` 处 | 把 `PanelLayout.locale` 一并放进请求体 |
| `apps/web/app/api/chat/route.ts` | `:5` 附近 | 校验通过后把 `locale` 转交给 `runTripChat` |
| `packages/orchestrator/src/chat.ts` | `runTripChat` / `TripChatOptions` | 接收 `locale`，转成 `OrchestratorOptions.locale` |
| `packages/orchestrator/src/workflow.ts` | `OrchestratorOptions` | 加可选 `locale` |
| `packages/orchestrator/src/workflow.ts` | 调用 specialist 处 | 把 `locale` 透传进 `AgentContext` 或 prompt 构造 |
| `packages/agents/src/{itinerary,destination-guide,dining,transport,accommodation}/index.ts` | `systemPrompt` | 注入一句「Output all traveler-facing text in {language}」，语言名由 `locale` 映射 |
| `packages/orchestrator/src/supervisor.ts` | `:163` 的 `systemPrompt` | 同上 |
| `packages/orchestrator/src/chat.ts` | `:270` `replyPrompt` | **保留**现有的语言检测指令；传了 `locale` 时改成「用 {language} 回复」，否则维持检测 |
| `packages/orchestrator/src/chat.ts` | `:238` `fallbackReplyFor` | 保持英文即可；在文档里记录这是降级路径的限制 |

**关键设计**：`locale` 进 `ChatRequest`（请求契约）而**不进** `TripBrief` —— 输出语言是**请求级偏好**，
不是行程数据。这样 `packages/shared` 的行程契约与 `estCost` 规则完全不受影响。

### 必须记录的限制

无 API key（或模型调用失败）时走确定性兜底，那约 48 处文案仍是英文。这是**可接受的降级**，但必须写进
`architecture.md`，避免以后被当成 bug 报。

### 测试

- `packages/orchestrator/src/chat.test.ts`：传入 `locale` 后 specialist / `replyPrompt` 包含目标语言指令；不传时保持现有行为
- `packages/shared`：`ChatRequest` 在不带 `locale` 时依旧校验通过（向后兼容用例）
- `apps/web/components/Workspace.test.tsx`：断言请求体带上了当前 `locale`
- `packages/agents/src/*/index.test.ts`：对 prompt 构造函数做纯函数断言
- **不要**引入真实模型调用的测试：保持现有「无 key 走确定性路径」的风格

### 验收标准

- 有模型时，中文提问得到**中文回复 + 中文计划卡片内容**
- `ChatRequest` 的 `locale` 为可选；不传时行为与改动前**完全一致**（向后兼容回归基线）
- `TripBrief`、`estCost` 规则、`pricePerNightUsd` 等冻结契约**零改动**
- `docs/api.md` 补上 `locale` 字段

---

## 未排期：界面 i18n（第 2 层）

**建议先不做。** 理由与将来要做时的完整方案都记在这里，避免以后重新调研一遍。

### 为什么不现在做

- **收益/成本比最低**：纯机械劳动，而产品当前只有单用户（`README` 的 Scope 段与 `workspace-ui.md` 的
  Out of scope 都已写明）
- 第 1 层能带来实际价值（中文用户拿到中文计划），第 2 层只是把按钮文字换掉

### 规模（已实测）

| 项 | 数量 |
| --- | --- |
| JSX 正文文案 | 43 |
| `aria-label` / `title` / `placeholder` | 25 |
| 现有 i18n 依赖 | **0** |

### 方案：手写字典，不引 next-intl

```ts
// apps/web/lib/i18n.ts
export const messages = {
  en: { newChat: "New chat" /* ... */ },
  zh: { newChat: "新对话" /* ... */ },
} as const;
export type Locale = keyof typeof messages;
```

- **不要路由**：语言是**设置项**，不是 URL 段 —— 不需要 `/en/`、`/zh/`。next-intl 的主要价值在路由、
  pluralization、规模化日期本地化，这里都用不上
- 2 个语言、约 70 个 key → 手写约 60 行，`keyof` 保证类型安全，**零依赖**
- `locale` 存进 `PanelLayout`，与第 2 项的 `currency` 同一个模式

### ⚠️ 必须提前决定：113 处测试按英文无障碍名查询

`apps/web/components/*.test.tsx` 里有 **113 处**这种查询：

```
getByRole("button", { name: "New chat" })
getByLabelText("Total budget (USD)")
getByRole("tab", { name: "Timeline & routes" })
```

界面一旦可切换语言，这些**全部会挂**。

| 方案 | 做法 | 评价 |
| --- | --- | --- |
| **(a) 测试固定 `locale: "en"`** | 默认 locale 保持 `en`，测试显式注入 | ✅ **推荐**：改 1 处 setup，113 处不动 |
| (b) 测试也走 `t()` | `name: t("newChat")` | 更真实但改动不成比例 |
| (c) 改用 `data-testid` | 最稳 | ❌ 违背项目「按无障碍名查询」的现有风格，削弱 a11y 测试价值 |

### 容易漏的地方

- **`aria-label` 也属于界面语言**：`WorkspaceSidebar.tsx:274` 硬编码 `aria-label="Language: English"`
- 侧边栏的 `EN` 标签同样是写死的，要改成当前 locale
- `Workspace.tsx:972` 的 Language 弹窗要从占位文案变成真正的选择器
- 弹窗里那句 `interface translation is not available yet` 届时必须删掉

---

## 全局约定与风险

- **`packages/shared` 的变更分两类，不要混**：
  - 第 2 项（货币/地区显示）**真正零改动** —— 格式化全在客户端
  - 第 5 项会**新增一个可选字段**到 `ChatRequest`（`packages/shared/src/chat.ts`）。这是**请求契约**，
    不是被冻结的行程契约（`TripBrief` / `estCost` / `pricePerNightUsd`），后者必须始终不动。
    新增可选字段风险低，但要知会团队并在 `docs/api.md` 里补上
  - `team-workflow.md` 里「Don't edit `packages/shared` without telling the team」指的是后者
- **第 1 项的归一化边界**：`TripBrief.dates` 内部恒为 ISO。任何「把本地化日期存进契约」的做法都会
  波及 `packages/agents`、`packages/tools` 和 Google Routes 调用
- **第 2 项的静态汇率**是**展示近似值**，不是结算汇率。`workspace-ui.md` 里已有一条原则
  「Mock places and bookings must never be presented as real supplier data」，货币同理：界面上应
  明确这是估算换算，不能让用户以为可以据此付款
- **第 5 项的降级限制**：无模型时计划内容仍为英文。这是设计上的取舍，不是缺陷，必须在
  `architecture.md` 里写明，否则会被当成 bug 反复排查
- **`locale` 与 `currency` 相互独立**：不要把货币从语言推导出来（中文界面 + 美元预算是完全合理的组合）
- 每个分支都要跑通 `pnpm typecheck && pnpm lint && pnpm test && pnpm build`（CI 的四个门禁）
- `apps/web` 的 test 脚本是 `NODE_OPTIONS=... vitest run`，**POSIX 语法**；Windows 下需 WSL / Git Bash

## 收尾：文档同步清单

五项全部落地后，除本文件外还需改：

| 文件 | 位置 | 内容 |
| --- | --- | --- |
| `docs/workspace-ui.md` | `:24` | 「History supports search, select, rename and delete」→ 补「通过每一项的 ⋮ 菜单」 |
| `docs/workspace-ui.md` | `:47-48` | 「...reused, so **refreshing** does not add empty chats」→ 「...so **clicking New chat or refreshing** does not add empty chats」 |
| `docs/workspace-ui.md` | `:16` | Trip Preferences 抽屉那行补上货币选择；`Total budget` 不再硬编码 USD |
| `docs/workspace-ui.md` | `:50` | `New chat` 条目补「不新增重复空对话」的行为说明 |
| `docs/api.md` | `POST /api/chat` 段 | 若第 1 项改了 `mode: "start"` 的缺字段提示文案，同步错误示例 |
| `docs/architecture.md` | Agents and models / Contracts 段 | 若第 2 项去掉了服务端文案里的 `USD`，说明「金额一律以 USD 存储与计算，单位由 UI 呈现」 |
| `docs/architecture.md` | Agents and models 段 | 第 5 项：说明 agent 输出语言由 `OrchestratorOptions.locale` 控制，且**确定性兜底始终为英文** |
| `docs/workspace-ui.md` | `:16` | Trip Preferences 抽屉那行补上货币与语言选择 |
| `docs/workspace-ui.md` | `:11` | 侧边栏那行的 `Language` 与 `EN` 标签改为跟随 locale |
| `docs/roadmap.md` | `:14` 附近 | 第 4 项是 bug 修复，可并入当前进行中的第 3 步；第 2 项如涉及持久化偏好则提一句 |
| `README.md` | Scope 段 | 若第 5 项落地，说明「计划内容语言跟随对话语言；离线兜底为英文」 |
| 本文件 | — | 删除或移入 `docs/archive/` |
