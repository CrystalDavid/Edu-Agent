# Gate 2.9 — 课堂实施、课后反思与教学改进闭环

状态：工程实现完成，等待人工验收。

## 产品目标与裁决

Gate 2.9 在既有 Lesson、TeachingPlan、Evidence、Task 和教师工作台之上建立可恢复闭环：教师确认实际课堂实施，确认少量可追溯观察，以明确选择的上下文生成 Reflection 草稿，再显式确认反思和创建后续行动。

本 Gate 固定以下语义：

1. `approved TeachingPlan` 是批准的计划，不是已经发生的课堂事实；
2. Proposal、accepted disposition 和模型输出都不能证明教学动作已经发生；
3. 只有教师确认的 Lesson Delivery Revision 和 Observation Revision 是正式实施事实；
4. confirmed revision 不可原地修改，修订产生新 revision 并保留 supersedes 关系；
5. Reflection 是独立 Artifact，不覆盖 TeachingPlan；模型只能生成 Reflection draft；
6. Reflection 后续的备课 Task、Assignment draft 或 TeacherTodo 均由教师显式创建；
7. 单次课堂观察不生成长期 learner 能力标签。

## 状态所有者

| 对象 | 所有模块 | 真值与职责 |
|---|---|---|
| Lesson、CourseRun、LearningObjective | Education | 课程范围和目标 |
| LessonDelivery / DeliveryRevision | Education | 实际课堂场次、实施差异、教师确认事实和修订历史 |
| ClassroomObservation / ObservationRevision | Education | 班级、目标、活动或明确匿名 learner 范围的教师观察 |
| LessonReflection / ReflectionRevision | Artifact | 课后反思 draft、confirmed 与历史；与 Delivery、计划和已选 Evidence 的关联 |
| Reflection follow-up relation | Work | Reflection 与后续 lesson preparation Task、Assignment draft、TeacherTodo 的来源关系 |
| TaskWorkingSet / AuthorizedContextPlan / ContextManifest | Work / Runtime | 每次生成所选上下文、重新授权和封存 |
| ModelExecution / Proposal | Capability / Runtime / Artifact | 事务外模型执行和可恢复 Reflection draft 生成；不确认事实 |
| Workbench projection | Work | 根据源事实重建待记录、待反思和后续行动提醒，不拥有源状态 |

没有新增第八模块，也没有创建第二套 Lesson、Task、TeachingPlan 或 Evidence 真值。

## 课堂实施

一次 `LessonDelivery` 由 `tenant + lesson + sessionKey` 唯一识别，并引用明确的 current approved TeachingPlan Revision。Delivery Revision 保存实际起止时间以及采用、调整、跳过、新增的环节、节奏变化、未解决问题和后续事项。

生命周期为：

```text
draft revision
  └─ teacher confirm → current_confirmed revision
       └─ amend → new draft revision
            └─ teacher confirm → new current_confirmed
                                  old current → historical_confirmed
```

确认和修订不会修改被引用的 approved TeachingPlan。相同场次创建使用业务键锁和数据库唯一约束；确认使用 expected version、幂等键和行锁，并发只有一个成功。

## 课堂观察与 ObservedPedagogicalMove

Observation 必须引用 Lesson 和 Delivery Revision，并保存观察时间、观察类型、作用范围、确认教师和可选 Objective、Assignment、Item、匿名 learner 或教学活动引用。范围分为 `class`、`learning_objective`、`assignment_item`、`learner` 和 `teaching_activity`。

Observation draft 不是正式 Evidence。教师确认后才形成 current confirmed Observation Revision；修订时原 revision 转为 historical/superseded，历史不被覆盖。教学动作类观察可明确表达为 `ObservedPedagogicalMove`，但 Agent 无权直接创建或确认它。

Lesson 与学生页只读取 current confirmed 观察。班级观察和 learner 范围观察在 API 与界面中明确区分；不会把一次观察转换为长期标签。

## Reflection 生命周期

Reflection 绑定明确的 Delivery Revision、approved TeachingPlan Revision、教师选择的 Observation Revision 和 Assignment Evidence refs。

```text
draft
  ├─ teacher edit → draft revision
  ├─ model generate → persisted draft revision
  └─ teacher confirm → current_confirmed
                          └─ amend → new draft → new current_confirmed
                                      old current → historical_confirmed
```

同一 Delivery 同时最多一个 active draft/current confirmed Reflection；数据库部分唯一索引、业务键锁和幂等记录共同保护并发。confirmed Reflection 不可原地修改。

Reflection 内容包括目标达成、planned vs implemented、有效与未达预期环节、课堂观察、Assignment Evidence 的一致或冲突、未知项、下一课建议、练习建议和教师补充。

## Agent 上下文与模型边界

教师先在 Reflection draft 中明确选择 confirmed Delivery、current confirmed Observations 和少量 current Assignment Evidence。生成命令创建 Task/TaskRun、TaskWorkingSet Revision、AuthorizedContextPlan、ContextManifest 和 queued ModelExecution；事务提交后由既有租约 Worker 在事务外调用 Mock 或 Volcengine Ark。

Reflection PromptBundle 要求模型只整理授权事实、标注未知项并输出结构化草稿。输出经过 JSON、Zod、Lesson、TeachingPlan、Delivery、Observation、Evidence 和权限校验。成功只更新 Reflection draft，不创建 confirmed Observation，不修改 approved TeachingPlan，也不自动创建后续任务。

刷新可从 PostgreSQL 恢复 queued/running/validating/succeeded 或失败状态。相同生成请求复用既有执行和草稿；retry、cancel 和 Worker lease recovery 沿用 Gate 2.6A 语义。

## 显式后续行动

只有 confirmed Reflection 可以创建后续行动：

- 下一课 `lesson_preparation` Task，并把 source Reflection、Delivery、selected Observation 和 Evidence 写入 TaskWorkingSet；
- Assignment draft；
- TeacherTodo。

每项行动都要求教师点击确认、独立幂等键和来源关系。确认 Reflection 本身不会自动创建任何行动。后续备课继续复用 Gate 2.5/2.6A 的 Proposal、in-review、批准和显式完成语义。

## API 与读取模型

所有 DTO、路由和 Zod Schema 位于 `packages/contracts`。产品路由包括：

- Delivery：create draft、detail、update draft、confirm、amend、history；
- Observation：create/update draft、confirm、supersede/amend、按 Lesson/Objective/learner 读取；
- Reflection：create draft、detail、update、generate、confirm、history、cancel/retry invocation；
- Follow-up：创建 lesson preparation Task、Assignment draft 或 TeacherTodo；
- Read models：Lesson implementation summary、planned vs implemented、pending reflection queue、recent confirmed observations、follow-up status 和 Workbench projection。

读取接口按业务对象拆分，没有新增万能 classroom dashboard 真值表。

## Migration

Gate 2.9 增加 5 个前向 Migration，总数 41：

- Education `0006_gate2_9_classroom_implementation.sql`：Delivery、immutable revisions、Observation revisions、状态历史和唯一/不可变约束；
- Artifact `0009_gate2_9_lesson_reflections.sql`：Reflection scope、Artifact Revision 状态、active/current 唯一约束和事件；
- Work `0009_gate2_9_reflection_workflow.sql`：Reflection follow-up、TaskWorkingSet source refs 和工作投影来源类型；
- Capability `0006_gate2_9_model_result_kind.sql`：Reflection draft 模型结果类型；
- Governance `0004_gate2_9_reflection_model_data.sql`：Reflection purpose/data categories；
- 既有 Gate 2.9 演示上下文通过正式 Seed Service 写入，不改写历史 Migration。

Migration 保持七 Schema ownership、checksum、空 Volume 前向执行和 Gate 2.8 数据兼容；应用不以超级用户运行。

## 权限、事务、审计与事件

正式写入继续遵守：

```text
ActingContext → ActionIntent → AuthorizationDecision
→ owning Application Service → transaction/outbox/audit
```

模型调用不持有数据库事务。确认 Delivery、Observation 和 Reflection 同步提交所属事实；Outbox Worker 只更新可重建工作投影、执行模型调用和幂等消费。Worker 停止不会回滚业务事实，恢复后可追上，且不声称 exactly-once。

所有 tenant、CourseRun、Lesson、learner 和 Evidence 引用均重新授权；相同幂等键不同 payload 返回结构化 409。日历时间结束只生成提醒，不自动产生实施事实。

## 页面接入

- Lesson：并列显示 approved plan、实际实施、正式观察、Reflection 和显式后续行动；
- Reflection Agent：显示选中的 Delivery/Observation/Evidence、执行状态、编辑与确认；
- 概览/工作台：真实显示待记录实施、待确认记录、待反思、生成失败和已创建后续行动；
- 日程：已结束课程只提供“记录课堂实施/完成反思”入口；
- 学生：在 Assignment Evidence 之外单列教师确认的 learner 课堂观察；
- Copilot：后续备课 Task 显示 source Reflection、Delivery、Observation 和 Evidence 上下文。

没有新增一级导航、Design Token 或卡片体系。

## 验收流程

1. 打开有 approved TeachingPlan 的 Lesson，创建实施草稿并记录采用、调整、跳过、新增环节；
2. 确认实施后检查原 approved Revision 内容与版本未变化；
3. 新建并确认班级或 Objective 观察，修订时确认历史保留；
4. 创建 Reflection draft，选择 confirmed implementation、Observation 和少量 Assignment Evidence；
5. 通过 Agent 生成并刷新恢复 draft，教师编辑后单独确认；
6. 显式创建下一课备课 Task、Assignment draft 或 Todo，确认没有自动创建其他行动；
7. 重启 API、Worker 和 Web，检查 Lesson、学生、工作台、Agent 和后续任务一致；
8. 检查 Audit、Outbox、expected-version 409、幂等重放和 tenant 拒绝。

## 非目标

本 Gate 不包含实时课堂助手、音视频采集、自动实施事实、自动考勤、长期 learner 画像、多模态课堂分析、Wellbeing、学生/家长端、正式身份/组织、云部署、设备集成或完整考试系统。
