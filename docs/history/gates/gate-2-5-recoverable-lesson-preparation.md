# Gate 2.5 — 最小可恢复备课闭环

## 1. 产品目标

Gate 2.5 把 Gate 2.4 已验证的 Copilot 审阅链路放进一条真实、持久化、可恢复的普通教师备课工作流：

> 课程与课时 → 备课 Task → 显式上下文 → Proposal → `in_review` TeachingPlan → 单独批准 → 已准备 → 教师显式完成。

本 Gate 继续使用确定性 `MockModelProvider`。重点是课程、课时、任务、授权上下文、教学计划版本和页面联动的正确性，不是模型能力扩展。

## 2. 三项产品裁决

### 2.1 复用 Task，不创建 TeacherWorkItem

- `work.task` 是唯一任务真值源；
- 备课任务用 `task_kind = lesson_preparation` 表达；
- Work 模块增加一对一扩展数据和状态历史，但不建立第二套任务聚合；
- 备课状态和版本由 Work Application Service 控制，前端、Agent 和 Runtime 都不能直接决定。

### 2.2 最小课程层级固定为 CourseRun → CurriculumUnit → Lesson

- `CourseRun` 继续表示一个班级在一个学期中的课程运行；
- `CurriculumUnit` 在界面显示为“单元”；
- `Lesson` 在界面显示为“课时”；
- 本 Gate 不增加平行 Course 聚合，也不增加 Chapter、Section、Topic。

### 2.3 复用现有上下文链，不创建 AgentContextBinding

教师选择先进入 Work-owned `TaskWorkingSet`。每次 AgentRun 都重新授权，并封存：

```text
TaskWorkingSet
  → ResolvedLearningInteractionContract
  → AuthorizedContextPlan
  → ContextManifest
```

历史 `AuthorizedContextPlan` 和 `ContextManifest` 只解释当次运行，不能作为下一次运行的永久授权。

## 3. 领域对象与状态所有者

| 对象 | 状态所有者 | 说明 |
|---|---|---|
| CourseRun | Education | 班级、学科、学期中的课程运行 |
| CurriculumUnit | Education | CourseRun 下的有序单元 |
| Lesson | Education | Unit 下的有序课时；备课状态字段是 Work 状态的只读投影 |
| Task (`lesson_preparation`) | Work | 备课工作的唯一聚合与状态真值源 |
| LessonPreparationTaskDetails | Work | Task 的一对一类型化扩展，不形成独立聚合 |
| TaskWorkingSet | Work | 教师为下一次运行显式选择的课程、目标、Evidence、基线计划和字段范围 |
| ResolvedLearningInteractionContract | Work | 绑定具体 TaskRun 的不可变交互合同 |
| AuthorizedContextPlan | Runtime | 当次重新授权后的允许、拒绝资源和字段范围 |
| ContextManifest | Runtime | AgentRun 实际收到的已封存上下文 |
| Proposal / TeachingPlan Revision | Artifact | 不可变教学成果版本 |
| SuggestionDisposition | Work | 教师对一个 Proposal 版本的唯一最终处置 |

## 4. Task 与 Lesson

一个备课 Task 必须且只能引用一个 CourseRun、一个 CurriculumUnit 和一个 Lesson。Task 可以有多个 TaskRun 和 Proposal；Lesson 可以在不同时间拥有多个 Task，但同一时刻只允许一个未关闭的备课 Task。

`approved_plan_ref` 只在批准完成后指向当前 approved Revision。它不能引用 draft、active in-review 或 superseded Revision。

## 5. 备课状态机

```text
planned
  → in_progress
  → awaiting_plan_review
  → ready_for_use
  → completed

planned / in_progress / awaiting_plan_review / ready_for_use
  → cancelled

completed / cancelled
  → in_progress  （仅显式 reopen）
```

规则：

- 创建为 `planned`；
- 教师启动为 `in_progress`；
- 产生 Proposal 后为 `awaiting_plan_review`；
- rejected/deferred 不进入 `ready_for_use`；
- 批准 TeachingPlan 后为 `ready_for_use`；
- 批准不等于完成，必须由教师显式执行 complete；
- 没有 approved TeachingPlan 时 complete 返回结构化 `409`；
- completed Task 不会被 Agent 静默重开；
- 每次转换都要求 expected version、幂等键、AuthorizationDecision、Audit 和 Outbox。

## 6. TaskWorkingSet

Working Set 至少封存：

- CourseRun ref；
- CurriculumUnit ref；
- Lesson ref；
- LearningObjective refs；
- Evidence refs；
- baseline approved TeachingPlan Revision ref；
- Purpose；
- requested field mask；
- Working Set version。

CourseRun、Unit、Lesson、Purpose 是核心上下文，不能通过资源删除接口替换。Evidence 是可选上下文，教师可在运行前增删。每次变更创建新的不可变 Working Set Revision；已完成 AgentRun 继续引用原版本。

Lesson-scoped Copilot 命令同时提交 `expectedPreparationTaskVersion` 和 Working Set version；任一版本陈旧都返回结构化 `409`，不会用最新状态偷偷替换教师看到的上下文。

## 7. TeachingPlan 多版本

正式 Revision 生命周期仍为：

```text
draft → in_review → approved
```

本 Gate 不创建 `published`。

- 同一 Task 可产生多个 Proposal 和 draft；
- 同一 Lesson 同时最多一个 active in-review；
- 新 active in-review 会把旧 active 关系标记为 `superseded`，旧 Revision 不删除、不原地修改；
- 同一 Lesson 同时最多一个 current approved；
- 新批准创建新的 immutable approved Revision，旧 approved 保留为历史；
- rejected/deferred 不创建 in-review，也不改变 current approved；
- Artifact Revision 本体保持不可变；active、superseded、current 由 Artifact-owned scope lifecycle 关系表达；
- 所有读取 API 明确区分 current approved、active in-review、draft、superseded 和 history。

## 8. 权限、事务与一致性

正式写入链固定为：

```text
ActingContext
  → ActionIntent
  → AuthorizationDecision
  → owning module Application Service
  → PostgreSQL transaction
  → Outbox
  → Audit
```

- UI 不写状态值，只提交命令和 expected version；
- Agent 只产生 Proposal/draft，不能批准计划；
- Runtime 不写 Lesson 或 Task；
- 组合层协调 Work、Artifact、Education 各自 Repository；
- 同数据库同步事实在业务事务中提交；异步 Worker 不决定业务成功；
- 幂等键相同但 payload 不同 fail closed；
- 并发创建 active in-review、批准、完成只允许一个符合 expected version 的结果；
- 不声称 exactly-once。

## 9. API

所有路径和 Zod DTO 定义在 `packages/contracts`。

### 课程与课时

- list/get CourseRun；
- list/get CurriculumUnit；
- list/get Lesson；
- get lesson preparation summary。

### Lesson Preparation Task

- list/create/get；
- start/reopen/complete/cancel；
- get history；
- get TaskWorkingSet；
- add/remove optional resource selection；
- get latest AuthorizedContextPlan；
- get latest sealed ContextManifest。

`AuthorizedContextPlan` 没有脱离运行的“预授权”写接口。创建 Proposal 的命令会基于提交时的 Working Set version 重新执行授权、保存 AuthorizedContextPlan，并把其引用封入 ContextManifest；两个读取 API 只返回最近一次已经发生的运行事实。

### Copilot 与 TeachingPlan

- Gate 2.4 create/list/detail/disposition/continue-review 保持兼容；
- create Proposal 可绑定 `lesson_ref` 和 `preparation_task_ref`；
- TeachingPlan 提供 lesson-scoped current approved、active in-review、draft、superseded、history；
- approve 回写 current approved、Lesson 投影和 Task `ready_for_use`。

## 10. Migration

前向 Migration 分别由模块 owner 执行：

| Owner | Migration | 主要变化 |
|---|---|---|
| Education | `0004_gate2_5_curriculum_and_lessons.sql` | `curriculum_unit`、`lesson`、目标关联、当前 Evidence 关联和 Lesson/TeachingPlan binding |
| Work | `0005_gate2_5_lesson_preparation.sql` | Task version、备课一对一扩展、Working Set revisions、状态历史、TaskRun request 和每次 Run 的 TaskResult |
| Runtime | `0005_gate2_5_authorized_context_plan.sql` | immutable `authorized_context_plan` 及 ContextManifest 引用 |
| Artifact | `0005_gate2_5_lesson_plan_scope.sql` | TeachingPlan scope lifecycle、active in-review/current approved 部分唯一索引和 `superseded` 关系 |

迁移注册总数为 25。迁移器以 owner 角色运行，记录 checksum；应用继续使用非超级用户 app/worker 角色。空 Volume 从 `0001` 到 Gate 2.5 可一次执行，Gate 2.4 数据通过前向回填 TaskRun request 和 TaskResult→TaskRun 关联后保留，不修改已应用 Migration。

前向修复原则：若上线前发现旧数据不满足 `task_result.task_run_ref NOT NULL`，应先新增独立 Work owner 修复 Migration 对异常记录显式报告或补齐，再增加约束；不得改写此 Migration 或手工绕过 checksum。

## 11. 应用事件

同步提交业务事实并写入以下事件：

- `LessonPreparationTaskCreated`；
- `LessonPreparationStarted`；
- `LessonPreparationReopened`；
- `TeachingPlanReviewCreated`；
- `LessonPreparationReviewContinued`；
- `TeachingPlanApproved`；
- `LessonPreparationReadyForUse`；
- `LessonPreparationCompleted`；
- `LessonPreparationCancelled`。

Task 状态/历史、Working Set、Plan Revision/指针和 Lesson/Task 关联均同步提交。现有本地 Worker 负责租约领取、重试和幂等 Consumer Effect，当前 Gate 2.5 事件的 effect 明确记录 `projectionMode = none-business-state-synchronous`；它不重复决定业务状态。Worker 停止不影响业务事实，恢复后可追上未处理或租约过期事件。

## 12. 本地 Seed

正式 Repository 幂等写入：

- CourseRun：八年级 3 班数学 · 当前学期；
- Unit：一次函数；
- Lessons：变量与函数、一次函数的概念、斜率与图像变化、待定系数法、一次函数的应用；
- “斜率与图像变化”关联 LearningObjective、Evidence 和现有 approved TeachingPlan；
- 另一个课时关联一个未完成的演示备课 Task。

前端不得为这些对象保留第二套业务数组。

## 13. 端到端流程

1. 从“斜率与图像变化”创建 Task，进入 Agent，检查 Working Set，提交真实要求并刷新恢复 Proposal；
2. 修改后接受形成 active in-review，current approved 不变；单独批准后更新 current approved，Task 进入 `ready_for_use`；
3. 教师显式完成，概览待办减少，Lesson 显示“已准备”，刷新和服务重启后保持；
4. 创建第二 Proposal 并 rejected，不创建 in-review，不改变 current approved，也不静默重开 completed Task。

## 14. 非目标

本 Gate 不实现通用 Todo/Calendar、文件上传、ObjectStore、二进制文件、PPTX/DOCX、新 Artifact 类型、完整课程资源树、作业/考试闭环、学生长期模型、DeepSeek、云部署、多角色、多 Agent、自动化或 v0.4。

## 15. 验收

除 Gate 1A、1B、2、2.4 全部回归外，Gate 2.5 自动验收覆盖：

- 空库和升级库 Migration；
- 真实 PostgreSQL 领域、事务、并发和重启恢复测试；
- 课程/课时、Task、Working Set、Proposal、Plan 和冲突 HTTP 测试；
- 完整 Playwright A/B/C/D 流程及 `output/playwright/teacher-portal-ui-v1/final/19-gate2-5-recoverable-lesson-preparation.png`；
- Production build、Architecture tests、Secret scan、Demo Doctor、`git diff --check`；
- E2E 临时 Volume 清理和长期开发状态不变验证。

浏览器流程不使用假成功 fallback；API 失败显示真实错误，浏览器控制台错误会使测试失败。测试和 Demo 均不进行真实网络或模型请求。

Gate 2.5 完成时的验证快照：

| 门禁 | 结果 |
|---|---|
| TypeScript | 4 个 workspace project 通过 |
| Vitest | 11 files / 53 tests 通过 |
| Architecture | 4 files / 28 tests 通过 |
| HTTP E2E | 1 file / 5 tests 通过 |
| Node smoke | 5 tests 通过 |
| PGlite Migration | 1 test 通过，空库含 25 个已注册 Migration |
| PostgreSQL | 9 files / 50 tests 通过，独立临时 Volume 已清理 |
| Playwright | 11 tests 通过，独立临时 Volume 已清理 |
| Production build / bundle analysis | 通过 |
| Demo Doctor / Secret scan / `git diff --check` | 通过 |
