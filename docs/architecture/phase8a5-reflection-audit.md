# Phase 8A-5 Reflection 流程审计

## 1. 审计范围

本次审计以 `codex/phase8a5-reflection-optimization` 分支的当前代码为事实来源，检查了：

- `artifact.lesson_reflection*`、Reflection Revision 及确认历史；
- `education.lesson_delivery*`、ClassroomObservation 与 Assignment Evidence；
- Reflection Task、TaskWorkingSet、AuthorizedContextPlan、ContextManifest 和 ModelExecution；
- `lesson-reflection@1` Prompt/输出校验和模型失败恢复；
- Reflection follow-up 与 Lesson Journey 的 `reflect` / `improve` 读取解释；
- Teaching Workspace、Reflection Agent 页面以及 PostgreSQL、Playwright 回归。

本阶段不修改已有 Migration、Runtime Kernel、TeachingPlan、Evidence、LessonDelivery 或 Reflection 的正式状态语义。

## 2. 当前 Reflection 流程

```text
confirmed LessonDelivery Revision
  -> 教师选择 confirmed ClassroomObservation
  -> 教师选择当前 Lesson 范围内的 Assignment Evidence
  -> 创建 Reflection Draft 与 Reflection-owned Task
  -> 每次生成重新建立 AuthorizedContextPlan / ContextManifest
  -> lesson-reflection@1 Prompt 调用 ModelProvider
  -> 本地 Schema、scope、Evidence 和 policy 校验
  -> 新建 Agent Reflection Draft Revision
  -> 教师编辑
  -> 教师显式确认
  -> confirmed Reflection Revision
  -> 教师显式创建 lesson preparation / assignment draft / teacher todo
```

当前边界正确之处：

1. 没有 confirmed Delivery 时不能创建 Reflection；
2. Reflection 只接受教师明确选择的、已确认 Observation 和当前 Lesson 的有效 Assignment Evidence；
3. 每次模型生成均封存授权计划与实际上下文，未选择 Evidence 不进入 Manifest；
4. 模型结果只创建新的 draft Revision，不会覆盖教师正在编辑的版本；
5. 教师确认才创建 confirmed Reflection Revision；
6. confirmed Reflection 不修改 approved TeachingPlan；
7. follow-up 仅能从当前教师确认的 Reflection Revision 显式创建；
8. 幂等、并发版本冲突、失败重试和服务重启恢复已有 PostgreSQL 回归。

## 3. 当前正式对象与状态所有者

| 对象 | 所有者 | 当前作用 | Phase 8A-5 裁决 |
| --- | --- | --- | --- |
| TeachingPlan Revision | Artifact | 已批准计划基线 | 只读，不修改 |
| LessonDelivery Revision | Education | 教师确认的课堂实施事实 | Reflection 的必需输入 |
| ClassroomObservation Revision | Education | 教师确认的课堂观察 | 仅显式选择后进入 Context |
| Assignment Evidence | Education | 可追溯学习证据 | 仅显式选择且授权后进入 Context |
| Reflection / Revision | Artifact | draft、confirmed、superseded 历史 | 继续使用现有 Application Service |
| Reflection Task / Follow-up | Work | 生成任务和显式后续行动关系 | 不自动创建 follow-up |
| AgentRun / ContextManifest / ModelExecution | Runtime / Capability | 执行、授权上下文、模型结果和恢复 | 绑定新的 SkillVersion |
| Lesson Journey | Work 读取投影 | 对正式状态的可重建解释 | 不创建第二套状态表 |

## 4. 当前自动生成能力

现有模型输出 `lesson-reflection@1` 已能生成：

- 目标达成解释；
- 计划与实施差异；
- 有效和未达预期环节；
- 课堂观察摘要；
- 与 Assignment Evidence 的一致或冲突；
- 不确定问题；
- 下一课和补充练习建议；
- 教师补充说明。

生成结果带有 TeachingPlan、Delivery、Observation 和 Evidence 引用，并强制 `teacherApprovalRequired=true`。输出通过本地 Zod、授权范围、来源引用和禁止自动行动规则校验后，才会形成新的 Reflection Draft Revision。

## 5. 当前缺失能力

### 5.1 尚未进入 Versioned Skill Registry

当前 Reflection 模型路径由 `lesson-reflection-prompt-bundle.ts` 和 `reflection-output-validation.ts` 直接驱动。Run 虽然记录 Prompt 版本，但没有绑定 `reflection-analysis@1` 的 Skill id、version、manifest hash、context policy 和 evaluation。

### 5.2 事实、解释和行动候选未显式分层

`ReflectionContent` 是兼容既有正式 Revision 的编辑模型，但页面和 Runtime 输出没有明确区分：

- `What happened`：只可引用 confirmed facts；
- `What it means`：Agent interpretation，不能冒充事实；
- `What next`：最多三个、尚未执行的 action candidate。

因此教师仍需从较长的字段列表中自行辨别事实与建议。

### 5.3 Lesson Brief 未进入 Reflection Context

当前生成上下文包含 approved TeachingPlan、confirmed Delivery/Observation、selected Evidence 和 LearningObjective，但没有读取同一课时已采用的 Lesson Brief。Phase 8A-5 应把 adopted Brief 作为可选、可追溯解释来源；不存在时记录缺口，而不是伪造洞察。

### 5.4 Follow-up 候选与正式命令之间缺少产品映射

现有后端已经支持三类显式 follow-up，但模型输出只提供字符串建议，页面以通用下拉框创建。需要把建议映射为最多三个候选卡片，同时保持“候选不自动创建”的边界。

## 6. 必须由教师确认的内容

以下内容不能由 Agent、日历、Worker 或 Journey 投影自动完成：

1. Classroom Delivery 是否准确；
2. ClassroomObservation 是否成为正式观察；
3. Reflection Draft 的事实陈述是否准确；
4. Agent interpretation 是否接受、修改或标记不确定；
5. Reflection Revision 是否确认；
6. 是否调整下一课、创建补充练习或创建个人 Todo；
7. 任何后续 TeachingPlan 审批或 Assignment 发布。

## 7. Journey 现状

现有 `LessonJourneyProjection` 已满足关键顺序：

| 真值条件 | 读取解释 |
| --- | --- |
| 无 confirmed Delivery | 不能进入 Reflection |
| confirmed Delivery、无 Reflection | `reflect.ready` |
| Reflection 正在生成 | `reflect.waiting_for_agent` |
| Reflection Draft 可审阅 | `reflect.waiting_for_teacher` |
| confirmed Reflection、无 follow-up | `improve.needs_attention` |
| 已显式创建 follow-up | `improve.completed` |

因此本阶段不增加 Journey 表或业务状态，只扩充 Reflection Skill 输出和教师审阅体验。

## 8. 风险与实现裁决

### 8.1 Draft 与事实

模型输出和 Skill 输出都只能是 Draft/Candidate。只有现有 `confirmReflection` Application Service 可以形成 confirmed Reflection Revision。

### 8.2 Evidence 授权

沿用 Reflection Draft 上封存的 `assignmentEvidenceRefs`。生成时再次验证 tenant、Lesson、未被替代状态和 ContextManifest 一致性；Skill 不直接访问 Repository。

### 8.3 Lesson Brief 缺失

仅使用当前教师、当前学校、当前 Lesson 的 adopted Brief。没有 adopted Brief 时在 Context/输出 `knownGaps` 中明确记录，不阻塞基于 confirmed facts 的 Reflection。

### 8.4 后续行动

Skill 只产生最多三个 Action Candidate。只有教师点击候选后，既有 `createFollowUp` 命令才创建 Task、Assignment Draft 或 TeacherTodo。生成或确认 Reflection 本身不得自动调用该命令。

### 8.5 兼容性

现有 `ReflectionContent`、正式 Revision、API 路由、ModelExecution `resultKind` 和历史 Run 保持可读取。新增 Skill 在 Runtime 中记录版本和分层分析，并把兼容内容交给现有 Reflection Application Service。

## 9. 审计结论

Phase 8A-5 不需要数据库变更。高价值且低风险的实现路线是：

1. 新增并注册 `reflection-analysis@1`；
2. 复用现有授权 Reflection Context，补入可选 adopted Lesson Brief；
3. 把已校验的模型输出规范化为 `facts / interpretation / actionCandidates`；
4. Runtime 保存 Skill 版本、Manifest hash、Evaluation 和分层 Draft；
5. 继续由现有 Artifact Application Service 创建/确认 Reflection Revision；
6. Teaching Workspace 将长字段列表改为分层审阅和三个明确判断动作；
7. confirmed Reflection 后展示最多三个候选，教师逐一显式创建；
8. 用边界、授权、Journey、恢复和 Playwright 回归证明没有自动事实或自动 follow-up。
