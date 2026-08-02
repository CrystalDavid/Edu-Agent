# Gate 2.8 — 日程、待办与教师统一工作台

> 状态：HISTORICAL / VERIFIED。功能 HEAD `996400123fd2433d145ee8056bda639c61208ce4`，PR #8，Merge `44a67ef0ffa519d0ef9c6c2b84e42ab9204561d0`，annotated tag `gate-2-8-verified`。

## 1. 产品目标

Gate 2.8 把教师每天需要处理的工作集中到概览和日程，但不复制备课、作业、批改、TeachingPlan、模型执行或文件的业务真值。教师可以创建个人 Todo 和手工 CalendarEvent；源业务事项以只读、可重建投影出现，并通过 deep link 回到所属模块完成真实动作。

核心闭环是：

```text
概览 / 日程
  ├─ 手工 Todo ──安排到日历──> 手工 CalendarEvent
  ├─ 备课 / TeachingPlan 投影 ──> Lesson / Task / Review
  ├─ Assignment / 批改投影 ───> Assignment / Grading
  ├─ 模型失败 / Proposal 投影 ─> Copilot / Runs
  └─ 最近文件 ─────────────────> FileAsset
```

## 2. 产品裁决

1. `TeacherTodo` 与 `CalendarEvent` 都由 Work 模块拥有，二者有独立生命周期；把 Todo 安排到日历会创建 `TodoCalendarLink`，不会改变 Todo 类型，也不会互相自动完成。
2. 来源业务事项由 `TeacherWorkProjection` 表达。投影只保存来源、版本、展示状态、建议动作和 deep link，不拥有源业务状态。
3. `TeacherWorkPreference` 只影响当前教师对特定 source version 的置顶、稍后提醒和隐藏；它不修改 Assignment 截止时间、备课状态、TeachingPlan、GradeDecision、ModelExecution 或 FileAsset。
4. Todo 进入 Agent 只封存 Todo ref 与教师明确关联的资源；教师仍需输入请求。Agent 不自动执行或完成 Todo。
5. 日、周、月视图读取同一 Calendar API；URL 保存 view/date 这一导航状态，业务数据只来自 PostgreSQL。

## 3. Work 领域对象与状态所有者

| 对象 | 所有者 | 语义 |
|---|---|---|
| `TeacherTodo` | Work | 教师个人手工待办，状态为 `active / completed / cancelled`，支持显式 reopen |
| `CalendarEvent` | Work | 教师手工时间段，状态为 `scheduled / completed / cancelled` |
| `TodoCalendarLink` | Work | Todo 与日历时间块的显式关联；二者状态独立 |
| `TeacherWorkProjection` | Work 读取投影 | 对源业务事实的可重建展示，不是第二套业务真值 |
| `TeacherWorkPreference` | Work | 当前教师、当前 source version 的置顶/稍后/隐藏偏好 |
| `TeacherTodoStatusHistory` | Work | 不可变 Todo 状态历史 |
| `CalendarEventStatusHistory` | Work | 不可变日历事件状态历史 |

备课仍由 `work.task` 与 `lesson_preparation_task_details` 拥有；Assignment、Submission 和 GradeDecision 仍由 Education 拥有；TeachingPlan、Proposal 和 FileAsset 仍由 Artifact 拥有；ModelExecution 仍由 Capability 拥有。

## 4. 生命周期

### 4.1 TeacherTodo

```text
active ──complete──> completed
active ──cancel────> cancelled
completed/cancelled ──reopen──> active
```

编辑、置顶、稍后提醒、关联资源和安排日历不会伪造完成。所有写入要求 expected version 和幂等键。

### 4.2 CalendarEvent

```text
scheduled ──complete──> completed
scheduled ──cancel────> cancelled
```

只有 `scheduled` 手工事件可编辑或移动。来源业务日历项是只读投影，修改源时间必须进入源页面。

## 5. 来源业务投影

每个投影保存 `sourceModule / sourceType / sourceRef / sourceVersion`、展示状态、时间、建议动作、deep link 和最后投影时间。同一教师、投影类别和 source ref 只有一个当前投影；源版本变化时，旧版本的稍后/隐藏偏好不会永久压住新事实。

当前覆盖：

- 备课：`planned`、`in_progress`、`awaiting_plan_review`、`ready_for_use`，以及 active in-review TeachingPlan；
- 作业：draft、published deadline、已过期未关闭、未交人数、待确认批改和尚未转为调整任务的共性错误；
- Agent：需要人工处理的 Proposal，以及 `validation_failed / timed_out / retryable_failed` ModelExecution；
- 文件：最近上传或生成的文件作为概览信息；文件业务错误仍由原文件命令返回，不复制成文件状态；
- 课程：Lesson 的计划时间以只读日历项显示。

投影在读取工作台时可重建，也由现有应用级 Outbox Worker 在相关事件后刷新。Worker 停止不会改变源业务提交；恢复或事件重放时以 upsert 和 Consumer Effect 保持幂等。

## 6. TaskWorkingSet 与 Agent handoff

Todo 可以关联 Lesson、Assignment、File 或 TeachingPlan。目前产品化的 Agent handoff 要求明确关联一个 Lesson，并复用或创建该 Lesson 的 `lesson_preparation` Task。Work 模块将以下内容写入现有 TaskWorkingSet Revision：

- `sourceTodoRef`；
- `sourceResourceRefs`；
- 原有 CourseRun、Unit、Lesson、Objective、Evidence、baseline plan 和 Purpose。

每次 AgentRun 仍重新形成 AuthorizedContextPlan 和 ContextManifest。Todo 上未明确关联的资源不会因为同属当前教师而自动进入上下文，Todo 也不会因模型成功而自动完成。既有 TeachingPlan baseline、审批和状态规则不变。

## 7. API 与 Contracts

所有路由、请求和响应均定义于 `packages/contracts` 并由 Zod 校验。

| 能力 | 路由族 |
|---|---|
| Todo list/create/detail/update | `/api/v1/teacher/todos` |
| complete/reopen/cancel | `/api/v1/teacher/todos/:todoRef/{complete|reopen|cancel}` |
| pin/snooze | `/api/v1/teacher/todos/:todoRef/preference` |
| 关联资源 | `/api/v1/teacher/todos/:todoRef/resources` |
| 安排日历 | `/api/v1/teacher/todos/:todoRef/schedule` |
| Agent handoff | `/api/v1/teacher/todos/:todoRef/agent-handoff` |
| Calendar list/create/detail/update | `/api/v1/teacher/calendar-events` |
| complete/cancel | `/api/v1/teacher/calendar-events/:eventRef/{complete|cancel}` |
| 工作台摘要 | `/api/v1/teacher/workbench/overview` |
| 来源 action items/detail | `/api/v1/teacher/workbench/action-items`、`/projections/:projectionRef` |
| 来源提醒偏好 | `/api/v1/teacher/workbench/projections/:projectionRef/preference` |

前端只通过 typed API helper 调用这些路由，不维护业务数组或 sessionStorage 真值。

## 8. Migration

前向 Migration `0008_gate2_8_teacher_workbench.sql` 新增：

- `work.teacher_todo`；
- `work.teacher_todo_resource_link`；
- `work.calendar_event`；
- `work.todo_calendar_link`；
- `work.teacher_work_projection`；
- `work.teacher_work_preference`；
- 两张不可变状态历史表；
- TaskWorkingSet 及 Revision 的 Todo/resource refs。

Migration 可从空 Volume 执行并纳入 checksum/owner 验证；没有修改历史 Migration。应用继续以 `edu_app` 运行，Worker 只有各 Outbox 的读取与租约状态权限。

## 9. 页面行为

- 概览：显示今天 Todo/Calendar、待处理来源事项、待批改、待审核计划、未完成备课、模型失败和最近文件；可创建个人 Todo。
- 日程：日/周/月共用同一 API，支持导航今天、手工事件创建/编辑/取消、右侧 Todo 面板、安排时间块和来源 deep link。
- Todo 面板：手工 Todo 可完成/重开/取消/置顶/稍后；来源事项只能稍后或进入源页面，不提供伪造“完成”。
- Agent/Copilot/Runs：显示 `sourceTodoRef` 和明确资源 refs；生成、刷新恢复、审批和 Task 状态仍遵守 Gate 2.5/2.6A 语义。
- 备课组动态和学校动态继续明确标为 READ_ONLY 演示；没有假成功按钮。

## 10. 权限、幂等、时区与一致性

- Todo/Calendar 以 `tenant_ref + teacher_ref` 隔离；来源投影读取同时受 tenant、CourseRun 和既有教师授权约束。
- 正式写入继续经过 ActingContext、ActionIntent、AuthorizationDecision、模块服务、事务、Outbox 和 Audit。
- 相同幂等键和相同 payload 返回原结果；不同 payload 返回结构化 409。
- expected version 不匹配返回结构化 409，不用最后写入覆盖并发修改。
- 重复安排 Todo 不创建第二个 CalendarEvent。
- 时区必须是有效 IANA timezone；`endAt` 必须晚于 `startAt`，跨日事件受支持。
- 来源偏好不会回写源业务；源版本变化会重新评估提醒。

## 11. 自动化与验收证据

新增自动化覆盖：Todo CRUD/状态/偏好/并发/幂等，Calendar CRUD/跨日时区/移动/完成/取消，Todo→Calendar 独立状态与幂等，来源投影唯一性和版本化偏好，Assignment/批改/备课联动，Worker 重放，服务重启，tenant 隔离，Todo Agent handoff 和前端单一真值源。

Playwright 证据生成在 Git ignored 的 `output/playwright/gate-2-8/`：

- `01-manual-todo-calendar-recovery.png`；
- `02-source-reminder-agent-context.png`。

测试数据库使用独立临时 Compose Project/Volume，测试 ObjectStore 使用 `.demo/e2e/<run-id>`；二者结束后删除，开发数据库和 `.demo/uploads` 不受影响。

## 12. 人工验收路径

1. 启动 `corepack pnpm demo:dev`，进入概览创建个人 Todo。
2. 打开日程，将 Todo 安排到今天或本周，切换日/周/月并编辑时间。
3. 完成 Todo，确认关联 CalendarEvent 仍为 scheduled；刷新和重启后数据仍在。
4. 创建/发布一份带截止时间的作业并导入合成提交，确认工作台出现截止、未交和待批改提醒。
5. 对来源提醒“明天提醒”，确认 Assignment 截止时间和批改状态未变；显示已稍后提醒后可以恢复。
6. 从备课/TeachingPlan 来源提醒进入源页面，完成真实命令后回到工作台确认状态更新。
7. 创建 Todo、关联已有 approved baseline 的 Lesson，选择“在 Agent 中处理”，确认上下文只包含 Todo 和明确资源；生成 Proposal 后 Todo 仍为 active。
8. 重启 API/Worker/Web，确认 Todo、Calendar、偏好、关联和来源状态均恢复。

## 13. 非目标与已知边界

本 Gate 不实现自动替教师完成任务、修改源截止时间、外部日历同步、多人共享、复杂重复日程、定时自动 Agent、通用工作流编辑器、正式学校组织/SSO、学生端、完整考试、OCR/多模态文件理解、云部署或第二模型供应商。

当前 Todo Agent handoff 复用 lesson preparation 流程，因此生成 TeachingPlan Proposal 的 Lesson 仍需满足既有 approved baseline 约束；不满足时返回明确冲突，不静默降级为通用聊天。
