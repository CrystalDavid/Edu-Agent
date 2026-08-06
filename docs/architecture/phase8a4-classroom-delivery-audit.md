# Phase 8A-4 课堂实施现状审计

## 1. 审计范围

本次审计以当前 `codex/phase8a4-classroom-delivery` 分支为事实来源，检查了：

- `education.lesson_delivery`、`education.lesson_delivery_revision` 及确认/修订流程；
- `education.classroom_observation`、`education.classroom_observation_revision` 及确认/替代流程；
- `artifact.lesson_reflection*`、Reflection 任务与 Agent 生成流程；
- approved `TeachingPlan` 与 Lesson Journey 的读取投影；
- 教师端 `ClassroomReflectionPanel`、正式 API、PostgreSQL 服务和既有回归测试。

本阶段不修改现有 Migration、LessonDelivery 核心语义、Observation 核心语义或 Runtime Kernel。

## 2. 当前课堂记录流程

```text
approved TeachingPlan Revision
  -> 教师打开“课堂实施草稿”长表单
  -> 填写实际开始/结束时间
  -> 对每个计划环节选择 adopted / adjusted / skipped / added
  -> 为每个环节填写实际实施内容与调整原因
  -> 填写课堂节奏、未解决问题和后续事项
  -> 保存 draft LessonDelivery Revision
  -> 教师另行确认
  -> confirmed LessonDelivery Revision
  -> 系统从已确认环节生成 ObservedPedagogicalMove / InstructionalDecision
  -> 教师另行创建并确认 ClassroomObservation
  -> 教师选择已确认观察和作业 Evidence
  -> 创建 Reflection Draft 并调用 Agent
  -> 教师确认 Reflection
```

当前的正确边界是：

- approved TeachingPlan 只是计划，不表示已经授课；
- draft LessonDelivery 不是正式课堂事实；
- 只有教师显式确认的 LessonDelivery Revision 才是正式实施事实；
- confirmed Revision 不可原地覆盖，后续修改创建修订并保留 parent/history；
- ClassroomObservation 必须绑定 confirmed Delivery Revision，并需再次由教师确认；
- Reflection 是独立 Artifact，不覆盖 TeachingPlan；
- Agent 生成失败不会改变 confirmed Delivery、Observation 或 TeachingPlan。

## 3. 当前需要教师填写的内容

当前 Web 主入口要求教师处理以下字段：

| 区域 | 当前输入 | 问题 |
| --- | --- | --- |
| 授课时间 | 实际开始、实际结束 | 可由课时时间预填，仅异常时需要修改 |
| 每个教学环节 | disposition | 适合快速选择，应保留 |
| 每个教学环节 | actualDescription | 对“按计划”环节重复抄写计划，负担高 |
| 每个教学环节 | rationale | 仅调整/跳过/新增时有价值，但当前始终展示 |
| 全课 | paceNotes | 可由节奏选择生成候选 |
| 全课 | unresolvedQuestions | 可由学生反应与一句补充生成候选 |
| 全课 | followUpNotes | 可由反馈生成候选，教师确认前不能成为事实 |
| 课堂观察 | scope、type、content、time | 正式观察仍需教师确认；候选可以由 Agent 预整理 |

一次普通的“基本按计划”课堂也需要打开长表单并逐项处理，违背“系统负责准备，教师负责判断”的 Teaching Workspace 原则。

## 4. 可由 30 秒快速反馈生成的信息

教师只需提供少量、明确的实际信号：

- 整体情况：基本按计划 / 有调整 / 未完成；
- 节奏：正常 / 比计划慢 / 比计划快；
- 学生反应：达成 / 部分困难 / 需要复习；
- 异常环节：导入 / 讲解 / 活动 / 练习 / 总结；
- 可选一句补充。

系统可以在 approved TeachingPlan 的计划内容基础上生成：

- 每个环节的 `actualDescription` 草稿；
- 每个环节的 `disposition` 建议；
- 节奏说明候选；
- 未解决问题候选；
- 后续处理候选；
- 班级层面 Observation Candidate；
- 后续 Reflection 的结构化输入候选。

这些输出都属于 Agent 执行事实或候选，不是正式教育事实。

## 5. 必须继续由教师确认的内容

以下动作不能由时间、日历、模型或快速反馈自动完成：

1. 确认课堂确实发生以及实际授课时间；
2. 确认 Delivery Draft 对实施差异的描述正确；
3. 将 LessonDelivery Revision 转为 `confirmed`；
4. 确认任何 ClassroomObservation；
5. 将候选现象关联到具体 LearningObjective、活动或匿名学习者；
6. 确认 Reflection；
7. 创建后续备课、作业或 Todo。

一次课堂现象不得自动转化为长期学生能力标签或 Teacher Preference。

## 6. 当前数据与模块所有权

| 对象 | 状态所有者 | 当前持久化 | Phase 8A-4 处理方式 |
| --- | --- | --- | --- |
| TeachingPlan Revision | Artifact | PostgreSQL | 只读 approved Revision，不修改 |
| LessonDelivery / Revision | Education | PostgreSQL | 继续使用现有 draft/confirm/amend 写入路径 |
| ObservedPedagogicalMove | Education | PostgreSQL | 只在 Delivery 确认时由现有服务形成 |
| InstructionalDecision | Education | PostgreSQL | 只在 Delivery 确认时由现有服务形成 |
| ClassroomObservation / Revision | Education | PostgreSQL | Candidate 不写表；教师采用后仍先建 draft 再确认 |
| Reflection Revision | Artifact | PostgreSQL | 必须基于 confirmed Delivery，保持现有流程 |
| AgentRun / RunStep / ContextManifest | Runtime | PostgreSQL | 记录快速反馈生成过程与 Skill 版本 |
| Quick Classroom Feedback | Runtime 输入 | AgentRun 输入/输出 | 不创建新事实表，不写 Lesson/Plan/Evidence |

## 7. 当前 API 与服务边界

现有正式 API 已覆盖：

- `GET /api/v1/teacher/lessons/:lessonRef/implementation-summary`；
- `POST /api/v1/teacher/classroom/deliveries`；
- `GET/PUT /api/v1/teacher/classroom/deliveries/:deliveryRef`；
- `POST .../confirm`、`POST .../amend`；
- ClassroomObservation create/update/confirm/supersede/list；
- Reflection create/generate/confirm/follow-up。

现有 `PostgresClassroomReflectionService` 已承担授权、幂等、版本冲突、历史保留和 outbox。Phase 8A-4 应复用它创建 Delivery Draft，而不是新建第二条教育事实写入路径。

新增能力应是一个窄的 Application/Runtime 编排：

```text
authenticated ActingContext
  -> approved-plan / lesson authorized read
  -> classroom-reflection@1
  -> validated Agent output
  -> existing createDelivery(draft)
  -> teacher confirm via existing API
```

Skill 不访问 Repository；HTTP 不直接访问 Repository 或 Provider SDK。

## 8. 现有 Journey 解释

当前 `LessonJourneyProjection` 已遵守关键语义：

- 有 approved plan/materials、但无 Delivery 时，进入 `deliver`，下一步为记录实施；
- 有 draft Delivery 时为 `deliver.waiting_for_teacher`；
- 只有 confirmed Delivery 才能进入 `reflect`；
- confirmed Reflection 不会反向声称 TeachingPlan 已被执行或修改。

Phase 8A-4 只需把 `deliver.ready` 的主动作替换为低成本快速反馈入口，并保持完整草稿编辑为次级操作。

## 9. 风险与裁决

### Observation Draft 的时序

现有核心语义要求 ClassroomObservation 绑定 confirmed Delivery Revision。因此首次快速反馈生成时，不存在可合法绑定的正式 Observation Draft。Phase 8A-4 的裁决是：

- Skill 输出 `ObservationCandidate`；
- Candidate 明确标记“未经教师确认”；
- Delivery 确认后，教师可以采用 Candidate 创建 Observation Draft；
- Observation 仍需第二次显式确认；
- 不放宽现有数据库约束或状态语义。

### 生成失败

Skill 校验或执行失败时，不调用 Delivery 写入端口；已有 Delivery 状态保持不变。重试使用相同幂等键可恢复，不产生重复 Delivery。

### 无 approved plan

快速反馈生成依赖 approved TeachingPlan Revision。无 approved plan 时不得伪造计划基线，页面应引导教师先完成方案审批。

### Evidence

仅允许使用 ActingContext 授权、与当前 Lesson/CourseRun 匹配且已确认的 Evidence。未选择或未授权 Evidence 不进入 ContextManifest；没有 Evidence 时明确记录缺口，不阻塞教师记录课堂。

## 10. 审计结论

现有正式事实模型无需新增 Migration，也无需修改 LessonDelivery/Observation 核心语义。高价值改动是：

1. 新增 `classroom-reflection@1` 版本化 Skill；
2. 新增快速反馈契约和 Application 入口；
3. Skill 输出现有 DeliveryContent 可接受的草稿，以及 Observation/Reflection 候选；
4. 复用现有 Delivery draft/confirm/amend 写入路径；
5. Teaching Workspace 默认显示 30 秒选择式反馈，完整表单降级为“查看/调整草稿”；
6. 用边界、幂等、权限、恢复和 Journey 测试守住“Agent 只生成候选，教师确认事实”。
