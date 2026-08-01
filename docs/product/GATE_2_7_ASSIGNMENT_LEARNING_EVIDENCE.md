# Gate 2.7 — 作业、学习证据与教学调整闭环

## 1. 产品目标

Gate 2.7 在既有课程、课时、备课、模型调用、TeachingPlan 和文件能力上增加一条最小但真实的教师作业闭环：教师创建并显式发布作业，查看匿名合成提交，保存和确认批改，将确认结果形成可追溯 Evidence，再由教师显式选择 Evidence 创建“调整下一课”备课 Task。

本 Gate 不建设学生端、完整题库、考试系统、长期学生画像或自动发布机制。

## 2. 实施设计

### 2.1 状态所有者

| 对象 | 所有者 | 设计裁决 |
|---|---|---|
| CourseRunEnrollment | Education | 只表达当前 CourseRun 与匿名合成 learner 的最小关系 |
| Assignment / AssignmentVersion / AssignmentItem | Education | Assignment 是生命周期真值；版本和题目不可变 |
| Submission / SubmissionAttempt / ItemResponse | Education | Submission 是 learner 与 Assignment 的容器；复用既有不可变 `education.attempt` 作为 Attempt 真值 |
| TeacherGradeDecision / TeacherItemGrade | Education | 草稿可更新；确认后不可变；重新打开创建新版本 |
| EvidenceObservation | Education | 复用既有不可变 Evidence；新增来源扩展保存 Assignment 到 GradeDecision 的完整链路 |
| 批改 Task / 调整下一课 Task | Work | 复用 `work.task`，不创建 TeacherWorkItem 或第二套任务聚合 |
| Assignment 文件绑定 | Artifact | 复用 FileAsset、FileVersion 与 ArtifactFileBinding |
| ContextManifest | Runtime | 每次 AgentRun 重新授权后封存，仅含教师明确选择的 Evidence |

### 2.2 生命周期

```text
Assignment: draft -> published -> closed -> archived
GradeDecision: draft -> confirmed -> superseded
SubmissionAttempt: immutable; resubmit = new Attempt
EvidenceObservation: immutable; grade revision = new observation + supersedes link
```

- draft 更新会创建新的 AssignmentVersion，不原地改写版本内容。
- published 后内容不可编辑；发布、关闭和归档均为教师显式命令。
- 未交表示没有 SubmissionAttempt，不以 0 分代替。
- 单选和数值题可提供确定性建议，但只有教师确认才形成正式 GradeDecision 和 Evidence。
- 简答题必须由教师确认。

### 2.3 Evidence 来源链

```text
AssignmentVersion
  -> AssignmentItem
  -> Submission
  -> education.attempt (immutable)
  -> ItemResponse (immutable)
  -> TeacherGradeDecision (confirmed)
  -> EvidenceObservation (immutable)
  -> AssignmentEvidenceSource
```

班级正确率、题目分布、Objective 表现和共性错误是从上述事实实时重算的读取模型，不建立不可解释的 Dashboard 真值表，也不创建 LearnerStateEstimate。

### 2.4 调整下一课

教师从已确认的、当前有效的 Assignment Evidence 中显式选择条目。应用服务验证 tenant、CourseRun、Assignment、来源版本和目标下一课后，创建 `task_kind = lesson_preparation` 的既有 Work Task，并把来源 Lesson、下一 Lesson、Assignment、题目和 selected Evidence refs 写入版本化 TaskWorkingSet。每次 AgentRun 仍按 Gate 2.5 的链路重新授权：

```text
TaskWorkingSet
  -> ResolvedLearningInteractionContract
  -> AuthorizedContextPlan
  -> ContextManifest
```

未选择的 learner、Submission 或 Evidence 不进入模型上下文。Agent 只能生成 Proposal，不能发布作业、确认成绩或批准 TeachingPlan。

## 3. 数据库与事务

- Education 前向 Migration 增加 enrollment、assignment/version/item、submission extension、grade decision/item grade、Evidence 来源扩展和不可变约束。
- Work 前向 Migration 只扩展 TaskWorkingSet 的 Assignment 来源字段，并增加由 `work.task` 引用的批改详情；不形成第二套任务真值。
- Artifact 前向 Migration 仅扩展 Assignment/AssignmentVersion 文件绑定类型。
- 正式写入继续经过 ActingContext、ActionIntent、AuthorizationDecision、owning Application Service、事务、Outbox 和 Audit。
- 所有修改命令都要求幂等键；聚合修改要求 expected version；相同键不同 payload fail closed。

## 4. API 与读取模型

所有路径和 Zod DTO 位于 `packages/contracts`。API 覆盖 Assignment 列表/创建/详情/版本/发布/关闭/归档，合成 Submission 导入与详情，批改队列/草稿/确认/重开，班级和 learner Evidence 读取，以及 selected Evidence 创建调整下一课 Task。

| 分组 | 端点语义 |
|---|---|
| Assignment | list/create/detail/update draft/version history/publish/close/archive |
| Enrollment/Submission | CourseRun enrollments、synthetic import、submission list/detail/attempts/responses |
| Grading | queue、save draft、confirm、reopen、history |
| Analytics/Evidence | assignment summary、item/objective performance、common errors、assignment evidence、learner recent evidence、overview |
| Adjustment | selected Evidence 创建 lesson_preparation Task；既有 Task/WorkingSet/AuthorizedContextPlan/ContextManifest API 读取封存上下文 |

所有请求/响应经 Zod；React 只调用 `apps/web/src/api.ts` 的 typed wrapper，不散落手写产品 URL。

## 5. Migration 与约束

| Schema / Migration | 内容 |
|---|---|
| Education `0005` | enrollment、assignment/version/item/objective link、submission/attempt details/item response、grade decision/item grade、assignment evidence source |
| Work `0007` | assignment grading details；TaskWorkingSet current/revision 增加 source Lesson/Assignment/Item refs |
| Artifact `0008` | FileBinding target 增加 Assignment 与 AssignmentVersion |

关键约束包括 immutable AssignmentVersion/Item/AttemptDetails/ItemResponse/EvidenceSource；一旦基础 `education.attempt` 被登记为 SubmissionAttempt，条件触发器也禁止更新或删除该基础行；每 Attempt 只允许一个 active draft 和一个 current confirmed，confirmed GradeDecision 内容不可变。Migration 从空 Volume 前向执行、有 checksum/owner，不改写 Gate 2.5/2.6A 历史表。

## 6. 权限、事务、幂等和事件

每个正式命令仍经过 ActingContext → ActionIntent/purpose → AuthorizationDecision → owning Application Service → transaction → Outbox/Audit。Education 不直接更新 Work 的业务语义；跨模块编排只调用 owning Repository。发布创建 Work-owned grading Task；确认批改同步提交 GradeDecision/Evidence 事实并更新批改进度。事件包括 AssignmentDraftCreated/Published/Closed/Archived、SyntheticSubmissionsImported、TeacherGradeDecisionConfirmed/Reopened 和调整备课 Task 既有 Work 事件。Worker 停止不改变这些业务事实。

- 相同幂等键/相同 payload 返回原结果；异 payload 返回 409；
- Assignment、GradeDecision 和 Task 写入要求 expected version；
- 并发批改通过 advisory lock、partial unique index 和版本条件保证单赢家；
- selected Evidence 必须是同 tenant、同 Assignment、current、teacher-confirmed 且属于所选 Item；
- 文件下载/绑定继续单独授权；模型与 Runtime 不能直接写 Assignment、Grade 或 approved TeachingPlan。

## 7. 页面与单一真值源

- 作业页：真实草稿/发布/关闭/归档、Submission、未交、逐题批改、确认与统计；
- 学生页：真实 Enrollment、近期提交、current confirmed Evidence 和中性复核事项；
- Lesson：关联 Assignment、完成情况和进入作业/调整入口；
- 概览：草稿、已发布、待批改、未交和调整候选；
- Agent/TeachingPlan/Runs：显示来源 Assignment/Item、selected Evidence、sealed context、Proposal 和计划/Work 状态；
- 文件：可绑定 Assignment 或明确 AssignmentVersion，但附件内容不进入模型。

旧 `HomeworkWorkspace` 和 Student mock 组件可继续作为历史原型代码存在，但不再被正式产品路由引用。

## 8. 非目标

不实现学生提交页面、正式身份和 SSO、真实学校名单、完整题库或考试、长期学生能力标签、自动发布成绩/反馈、OCR、多模态文件上下文、日程、云部署、多供应商或第二模型。

## 9. 验收主线

1. Lesson 创建作业草稿，增加三种最小题型并显式发布；刷新后状态保持。
2. 导入 12 名匿名 learner 的合成提交，未交保持为空缺；教师保存草稿并确认批改。
3. 每条确认结果可追溯到 Assignment、Attempt、Response 和 GradeDecision；统计可重算。
4. 教师选择共性错误 Evidence 创建下一课备课 Task；封存上下文只包含所选 Evidence。
5. 复用现有 Provider、Proposal、in-review 和 approved TeachingPlan 流程；刷新及服务重启后恢复。

## 10. 自动化证据

- Unit/Architecture：Zod、未交语义、模块所有权、typed route、无第二 Task/Evidence 真值；
- PostgreSQL/HTTP：Assignment 全生命周期、immutable 约束、合成提交、批改草稿/确认/重开、Evidence 替代、并发单赢家、tenant 隔离、selected Evidence 和服务重启；
- File：Assignment/AssignmentVersion binding；
- Playwright：`tests/playwright/teacher-assignment-learning-evidence.spec.ts` 完成从创建作业到下一课 approved TeachingPlan 的真实 UI/API 流程；证据位于 `output/playwright/gate-2-7/`；
- 所有普通测试默认 Mock/Fake，不联网，E2E PostgreSQL Volume 与 ObjectStore 独立并在结束时精确清理。

## 11. 前向修复说明

本 Gate 不改写已登记 Migration。若未来需要支持“已发布作业修订”，应新增 Assignment revision/publish 前向 Migration 与明确 lifecycle，不得更新当前 immutable version；若 Evidence 来源需要更多类型，应扩展现有 source adapter，不创建平行 Evidence 表。
