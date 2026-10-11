# Phase 8A-6 下一课优化闭环实施报告

## 1. 结果

Phase 8A-6 已把 Teaching Workspace 的末端从“保存一份 Reflection”推进为教师可治理的下一课行动闭环：

```text
Confirmed Reflection Revision
  -> 教师显式请求下一课建议
  -> next-lesson-adjustment@1
  -> sealed ContextManifest + AgentRun
  -> 最多三个 NextLessonActionCandidate
  -> 教师修改 / 接受 / 拒绝
  -> 既有正式 follow-up Application Service
  -> Preparation Task | Assignment draft | TeacherTodo
  -> 目标 Lesson 的 Brief / Preparation Journey
```

确认 Reflection、生成候选、接受候选是三个不同命令。前两个命令都不会创建下一课、作业或待办；只有教师接受某一候选后，系统才调用原状态所有者的正式写入路径。

## 2. 状态所有权

| 对象 | Owner | 语义 |
|---|---|---|
| Confirmed Reflection Revision | Artifact | 教师确认的课后反思；只作为来源，不被行动候选修改 |
| LessonDelivery / Evidence | Education | 已确认课堂与学习事实；只读且必须在当前授权范围 |
| AgentRun / ContextManifest / Evaluation | Runtime | 本次建议如何生成、实际读取了什么、缺少什么 |
| NextLessonActionCandidate / History | Work | 教师待处置的版本化工作建议及不可变决策历史 |
| lesson preparation Task / TaskWorkingSet | Work | 教师接受“调整下一课”后产生或复用的正式备课任务 |
| Assignment draft | Education | 教师接受补充练习后创建的正式草稿；不会自动发布 |
| TeacherTodo | Work | 教师接受个人复核事项后创建的正式待办；不会自动完成 |

没有新增第二套 Lesson、TeachingPlan、Evidence、Assignment 或 Todo 真值。

## 3. NextLessonActionCandidate 生命周期

候选支持：

- `candidate`：已生成，等待教师决定；
- `accepted`：教师接受，且正式目标对象已经由 owning Application Service 创建；
- `rejected`：教师拒绝，不创建目标对象；
- `expired`：被教师显式重新生成的新一轮候选取代，或超过可处置时间后拒绝继续写入。

每个候选保存稳定 ref、tenant/teacher、来源 Reflection Revision、来源 AgentRun、ContextManifest、类型、原因、置信口径、目标 Lesson、版本、正式目标 ref/deep link、Skill ref 与时间字段。创建、修改、接受、拒绝和过期均写入 `work.next_lesson_action_history`，历史表禁止 UPDATE/DELETE。

重新生成使用 Reflection Revision 级事务锁：同一教师针对同一 Reflection 显式发起新一轮生成时，旧的未决候选在同一事务中变为 `expired`，新候选再写入；已接受或已拒绝的历史不被覆盖。

所有教师处置命令使用 `expectedVersion`。相同幂等键相同 payload 返回原结果；相同幂等键不同 payload fail closed。并发接受复用 candidate-specific 的正式目标幂等键，只能得到同一个 Task、Assignment 或 Todo。

## 4. `next-lesson-adjustment@1`

这是一个 published、版本化、必须人工确认的 Proposal Skill。它只读取 Runtime 提供的授权快照：

- 当前教师确认的 Reflection Revision；
- Reflection 精确绑定的 confirmed Delivery；
- Reflection 中教师明确选择且当前仍有权限的 Evidence；
- 当前 teacher/tenant 下 active confirmed Preference；
- 来源 Lesson 与教师选择的、同一 CourseRun 内不同于当前课时的目标 Lesson；
- 可选的一句话教师补充要求。

Context Builder 对 Evidence 做授权交集、数量限制和字段压缩；未授权或超出预算的引用只进入 Manifest 的 excluded information，不进入 Skill 输入。Manifest 记录 refs、versions、hashes、provenance、缺口、字段掩码和估算 token。

Phase 8A-6 不进行第二次模型调用。`reflection-analysis@1` 的输出已经经过模型生成和教师确认；`next-lesson-adjustment@1` 以确定性规则把已确认的下一课建议、练习建议和不确定项归一化为最多三个行动候选。因此本步 model token、重试和模型成本均为 0，同时仍创建可解释 AgentRun、ContextManifest 和 Evaluation。未来若加入知识来源或模型增强，应发布新 SkillVersion，不能覆盖 `@1`。

## 5. 教师决策与正式写入

候选类型与接受后的正式目标：

| Candidate type | 接受后的命令 | 正式结果 |
|---|---|---|
| `adjust_next_lesson_focus` | `lesson-reflection.create-follow-up` | 创建或复用目标 Lesson 的 `lesson_preparation` Task，并将 Reflection、Delivery、Observation、Evidence 加入 TaskWorkingSet |
| `create_practice_task` | `lesson-reflection.create-follow-up` | 创建绑定目标 Lesson 的 Assignment draft；不发布 |
| `create_teacher_todo` | `lesson-reflection.create-follow-up` | 创建当前教师 Todo |
| `review_student_issue` | `lesson-reflection.create-follow-up` | 创建高优先级教师复核 Todo；不生成学生画像或长期标签 |

教师修改只产生 Candidate 新版本，不修改 confirmed Reflection。教师拒绝只记录决策，不创建正式对象。目标课时必须与来源课时不同且属于同一 CourseRun。

跨模块事务协调器只依赖三个 owner-specific transaction-aware Port：Governance、Runtime 与 Work 各自在本模块基础设施内封装自己的 Repository；没有扩大 Phase 3 登记的 legacy repository-orchestrator 集合。正式 follow-up 继续通过既有 Classroom Reflection / Lesson Preparation Application Service 完成。

## 6. API 与 Teaching Workspace

新增小型 API，而没有扩张 Reflection detail 为巨型响应：

- `GET /api/v1/teacher/reflections/:reflectionRef/next-lesson-actions`
- `POST /api/v1/teacher/reflections/:reflectionRef/next-lesson-actions/generate`
- `GET /api/v1/teacher/next-lesson-actions/:candidateRef`
- `PATCH /api/v1/teacher/next-lesson-actions/:candidateRef`
- `POST /api/v1/teacher/next-lesson-actions/:candidateRef/accept`
- `POST /api/v1/teacher/next-lesson-actions/:candidateRef/reject`

Reflection Workspace 在正式 Reflection 下展示：目标课时、一句话补充要求、显式生成按钮、候选来源/状态以及修改、接受、拒绝操作。选择器不允许把当前课时当作“下一课”。接受调整候选后进入既有 Preparation Agent 页面。

LessonJourneyProjection 只把候选解释为 `improve.waiting_for_teacher`；候选存在、被拒绝、过期，甚至异常地显示 accepted，都不会伪造 `follow_up_created`。只有正式 `reflection_follow_up_link` 存在时，Journey 才进入 completed。

## 7. Migration

新增前向 Migration：

`work-assistant-durable-execution/infrastructure/migrations/0011_next_lesson_action_candidates.sql`

它创建：

- `work.next_lesson_action_candidate`；
- `work.next_lesson_action_history`；
- Reflection/teacher 读取索引；
- AgentRun/type 唯一约束；
- history 不可变触发器。

43 个 Verified 基线 Migration、Phase 7A Migration 和日历分类 Migration 均未修改；当前总数为 46。回退策略是 forward-fix：不修改或删除已应用 Migration，不物理删除历史候选或正式 follow-up。

## 8. 权限、恢复与数据边界

- 所有 HTTP 身份来自服务端 Session / ActingContext；请求不能提交 tenant、actor 或 teacher；
- 候选读写同时限定 tenant 与 owning teacher，跨学校 ref 返回不暴露资源存在性的失败；
- 来源 Reflection、Delivery、Evidence、Preference 和目标 Lesson 必须在当前授权范围；
- 未授权 Evidence 不进入 ContextManifest 的 included refs；
- Skill 不 import Repository、PostgreSQL、Education/Artifact Infrastructure 或 Provider SDK；
- Runtime Application Service 只依赖 Source Reader、Store、Formal Target Port 和 Skill Registry；
- Agent 不能确认 Reflection、修改 Lesson/TeachingPlan/Evidence 或直接创建正式 follow-up；
- Candidate、AgentRun、ContextManifest、History 与正式 target 均在 PostgreSQL 中恢复；
- 测试数据库与 ObjectStore 使用每次运行独立资源，开发 Volume、`.env.local` 和本地上传未改变。

## 9. 验证结果

| 验证 | 结果 |
|---|---|
| `corepack pnpm typecheck` | PASS |
| `corepack pnpm test` | PASS：45 files / 239 tests |
| `corepack pnpm test:architecture` | PASS：20 files / 111 tests |
| `corepack pnpm test:postgres` | PASS：23 files / 111 tests；7 Schema / 46 Migration；隔离 Volume 已删除 |
| `corepack pnpm test:playwright` | PASS：23/23；隔离数据库与 ObjectStore 已删除 |
| `corepack pnpm build` | PASS：API、Web、contracts、sample-data、test-fixtures |

新增覆盖包括：Skill contract/scope/evaluation、未授权 Evidence 排除、Journey 不伪造完成、显式生成、再生成过期旧候选、修改/拒绝/接受、expected-version、幂等重放、正式 TaskWorkingSet 来源、不可变历史、跨学校隔离、重连恢复以及真实浏览器端到端流程。

## 10. 未实现与下一阶段

本阶段没有实现：

- 自动修改 Lesson、TeachingPlan 或 Assignment；
- 自动创建下一课或定时运行 Agent；
- 学生长期画像、自动长期 Memory、向量数据库；
- 教材、课程标准或考点 Knowledge Layer；
- 候选到期的定时清理 Worker；当前会在处置时 fail closed，并在显式重新生成时持久化 `expired` 历史；
- 复杂多方案优化器或第二次模型推理。

Teaching Workspace 的 Brief → Plan → Material → Delivery → Reflection → Next Lesson 闭环已经贯通。下一阶段建议先完成 Phase 8 的人工产品验收，再独立设计 Phase 9 Knowledge Foundation 的来源授权、版本、引用和更新策略；不能在没有权威来源时让 Agent 伪造教材或课程标准结论。
