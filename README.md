# Trip Planning Multi-AI-Agent System

一个基于多智能体协作的旅行规划系统。用户输入偏好与需求后,由 Coordinator Agent 拆分任务,分发给
Travel Planner / Destination Guide / Budget & Booking Advisor 三个专项 Agent 协同生成行程,关键决策
(高风险行程确认、预算超支)由用户在 Human-in-the-loop 节点手动确认。

## 团队分工(5人,一人一模块)

| 负责人 | 模块 | 对应 Use Case |
|---|---|---|
| A | **Orchestrator / Coordinator Agent** | Set Preferences (Filter)、Submit Requirement (Chat)、Generate Itinerary、Memory Management (short/long term) |
| B | **Travel Planner Agent** | Arrange Transportation、Arrange Accommodation (Individual/Group) |
| C | **Destination Guide Agent** | View Weather-based Clothing Recommendation、View Food/Cuisine Recommendation |
| D | **Budget & Booking Advisor Agent** | Manage Budget、**Confirm Key Itinerary (Human-in-the-loop)** |
| E | **Frontend / UI + 集成** | View Itinerary Output (Mind-map/List)、Filter UI、Chat UI,负责把各Agent结果整合到界面,兼repo集成 |

> 每人只在自己负责的模块目录下开发,减少互相修改同一文件导致的冲突。跨模块的输入/输出格式(见下方"接口约定")先对齐好再各自开工。

## 仓库结构

```
/agents
  /orchestrator        ← A
  /travel_planner       ← B
  /destination_guide    ← C
  /budget_advisor       ← D
/frontend                ← E
/docs
  /session-logs          ← 每人每次AI辅助编码后填写的总结(见下方模板)
.env.example
docker-compose.yml
README.md
```

## 接口约定(Interface-first)

各 Agent 之间用 JSON 传递数据,字段在开工前由 A(Orchestrator负责人)牵头和大家一起定好,例如:

```json
// Orchestrator -> Travel Planner 请求
{ "trip_id": "...", "dates": ["2026-10-01", "2026-10-07"], "destination": "...", "group_size": 1 }

// Travel Planner -> Orchestrator 返回
{ "transportation": [...], "accommodation": {...} }
```

**约定好之后,各自可以先 mock 对方的输入输出独立开发,不用等别人写完。**

## Git 协作流程

### 分支命名
`feature/<模块>-<简述>`,例如:
- `feature/travel-planner-transport-api`
- `feature/budget-advisor-hitl-check`

Commit message 前缀:`feat: ` / `fix: ` / `docs: `

### main 分支保护规则(已在 GitHub Ruleset 配置)
- 禁止直接 push 到 `main`,必须走 Pull Request
- PR 至少需要 **1 人 approve** 才能合并
- 新 commit push 后旧的 approve 自动失效,需要重新审
- 每个 PR 自动触发 **Copilot code review**
- 禁止 force push、禁止删除 `main`

### Review 分配(交叉review,环形分摊,别自己审自己)

| PR 提出人 | Reviewer |
|---|---|
| A | B |
| B | C |
| C | D |
| D | E |
| E | A |

### Issue / 看板
GitHub Projects 里每个 Use Case 建一个 Issue,指派给对应负责人,状态走 `To Do → In Progress → In Review → Done`。

### 集成节奏
- 前期各自对着接口约定独立开发 + mock 测试
- 每周固定一次 **集成日**:五个模块真正连起来跑一遍完整流程,越早集成越能提前暴露接口不匹配问题

## 开发环境

组内 Windows / macOS 混用,统一用 Docker 避免环境不一致:

```bash
docker compose up
```

`.env.example` 里放假的 API key 格式,真实 key 各自写到本地 `.env`,**不要提交到 git**。

## Session Summary(每人每次AI辅助编码收尾必填)

写在 `/docs/session-logs/YYYY-MM-DD-姓名.md`,提交对应 PR 时附上:

```
## Session Summary
- 负责人:
- 涉及模块:
- 完成的功能:
- 修改的文件:
- 做出的假设(assumptions):
- 遗留问题:
- 需要谁review:
```
