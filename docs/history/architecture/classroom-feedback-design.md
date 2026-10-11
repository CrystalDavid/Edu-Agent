# Quick Classroom Feedback 设计

## 1. 产品目标

教师下课后不再从空白课堂实施表开始，而是在约 30 秒内给出五类明确反馈。系统读取当前课时和已批准教学计划，整理为可审阅的 LessonDelivery Draft。教师确认草稿后，才形成正式课堂实施事实。

```text
approved TeachingPlan Revision
  -> 教师 30 秒快速反馈
  -> classroom-reflection@1
  -> Delivery Draft + Observation Candidates + Reflection Input Candidate
  -> 教师查看/调整
  -> 现有 LessonDelivery confirm
  -> 正式实施事实
  -> 教师采用并确认 Observation
  -> Reflection 入口
```

## 2. 教师输入模型

### 2.1 整体情况

| UI 文案 | Contract 值 | 含义 |
| --- | --- | --- |
| 基本按计划 | `as_planned` | 默认把计划环节解释为已采用 |
| 有调整 | `adjusted` | 标记的异常环节解释为现场调整 |
| 未完成 | `incomplete` | 标记的异常环节解释为跳过；未标记时至少将总结标记为未完成 |

### 2.2 节奏

| UI 文案 | Contract 值 |
| --- | --- |
| 正常 | `on_pace` |
| 比计划慢 | `slower` |
| 比计划快 | `faster` |

### 2.3 学生反应

| UI 文案 | Contract 值 |
| --- | --- |
| 达成 | `attained` |
| 部分困难 | `partial_difficulty` |
| 需要复习 | `needs_review` |

### 2.4 环节异常

- `opening`：导入；
- `explanation`：讲解；
- `activity`：活动；
- `practice`：练习；
- `summary`：总结。

可多选，也可以为空。选择仅表示“需要在草稿中突出”，不表示系统已观察到课堂事实。

### 2.5 可选一句话

最长 500 字，仅用于说明实际差异。该文本记录为教师显式输入，不自动解释为学生长期能力、正式 Evidence 或 Teacher Preference。

## 3. Contract 与 API

新增窄契约：

```ts
type GenerateClassroomFeedbackRequest = {
  courseRunRef: string;
  lessonRef: string;
  expectedApprovedTeachingPlanRevisionRef: string;
  overall: "as_planned" | "adjusted" | "incomplete";
  pace: "on_pace" | "slower" | "faster";
  studentResponse: "attained" | "partial_difficulty" | "needs_review";
  abnormalSections: ClassroomFeedbackSection[];
  note: string | null;
  purpose: "lesson-delivery.quick-feedback.generate";
  idempotencyKey: string;
};
```

生成结果：

```ts
type ClassroomFeedbackGenerationResult = {
  replayed: boolean;
  agentRunRef: string;
  contextManifestRef: string;
  contextManifestHash: string;
  skillRef: "classroom-reflection@1";
  delivery: LessonDeliveryDetail; // 仍是 draft
  observationCandidates: ObservationCandidate[];
  reflectionInput: ReflectionInputCandidate;
};
```

路由：

- `POST /api/v1/teacher/classroom/deliveries/quick-feedback`：生成并保存 Delivery Draft；
- `GET /api/v1/teacher/lessons/:lessonRef/classroom-feedback/latest`：读取当前教师、学校和课时的最近一次生成结果，用于刷新恢复候选说明。

新增路由不会更改现有 Delivery、Observation 或 Reflection API。

## 4. Skill 设计

### 4.1 版本

- ID：`classroom-reflection`；
- Version：`1`；
- Ref：`classroom-reflection@1`；
- Lifecycle：`published`；
- Output：`draft`；
- Human approval required：`true`；
- Tools：disabled；
- Memory：仅允许已授权上下文。

名称中的 reflection 表示“整理课堂并为课后反思准备输入”，不表示 Skill 可以创建或确认正式 Reflection。

### 4.2 输入

- authenticated `tenantRef`、`actorRef`；
- Lesson 的最小快照；
- current approved TeachingPlan Revision；
- 教师 Quick Feedback；
- 与 approved plan 显式关联、已授权且已确认的 Evidence 摘要；
- 已确认 Teacher Preference（仅用于表达方式）；
- 已存在且属于当前课堂的 Observation Draft（仅在后续重新整理时可选；首次生成通常为空）；
- excluded Evidence refs 和 missing information。

### 4.3 输出

```ts
type ClassroomReflectionSkillOutput = {
  schemaVersion: "classroom-delivery-draft@1";
  deliveryDraft: DeliveryContent;
  deliverySummary: string;
  observationCandidates: Array<{
    candidateId: string;
    scope: "class" | "activity";
    scopeRef: string | null;
    observationType:
      | "achievement"
      | "confusion"
      | "timing"
      | "engagement"
      | "activity_effectiveness"
      | "unresolved";
    content: string;
    basisRefs: string[];
    confidence: "teacher_signal";
  }>;
  reflectionInput: {
    plannedVsImplemented: string[];
    effectiveSegments: string[];
    uncertainQuestions: string[];
    suggestedNextActions: string[];
  };
  knownGaps: string[];
};
```

### 4.4 生成规则

第一版使用受版本控制、确定性的规则生成器。这样可以稳定验证状态边界、幂等、恢复和上下文授权；Skill 的 Prompt Bundle 同时定义未来 Model Adapter 的等价输出约束。替换为真实模型时不改变 Platform 写入路径。

计划内容转换为五个实施环节：

1. 导入：`openingActivity`；
2. 讲解：`lessonFocus` + `teacherQuestions`；
3. 活动：`studentActivity`；
4. 练习：`independentCheck`；
5. 总结：`followUp`。

默认 `actualDescription` 从 approved plan 的对应环节生成；只有异常环节和教师一句话会进入差异说明。教师不再重复抄写计划。

## 5. Context Engineering

```text
Quick Feedback
  -> ActingContext / course permission
  -> current approved plan version check
  -> classroom-reflection context policy
  -> authorized Evidence filtering
  -> confirmed Preference filtering
  -> token budget / compression
  -> ContextManifest
  -> Skill
```

ContextManifest 必须记录：

- Lesson、approved plan、教师反馈的 refs/version/hash/provenance；
- 实际进入上下文的 Evidence；
- 被权限或预算排除的 Evidence；
- 已确认 Preference；
- 缺失信息；
- requested field mask；
- estimated tokens；
- Skill/Prompt/Policy 版本。

禁止 Context Builder 绕过 ActingContext，禁止使用未确认 MemoryCandidate，禁止自动拉取整个班级的提交。

## 6. Runtime 与持久化

Runtime 持久化：

- QueryRun；
- AgentRun；
- RunManifest；
- ContextManifest；
- Skill 版本、输入/输出 hash、Evaluation；
- output 中的 Delivery/Observation/Reflection candidates；
- `ClassroomDeliveryDraftGenerated` outbox event。

Education 持久化：

- 仅通过现有 `createDelivery` 写入 draft LessonDelivery Revision；
- 不自动调用 `confirmDelivery`；
- 不自动调用 `createObservation`；
- 不创建 Reflection。

不新增事实表，不新增 Migration。

## 7. 幂等、失败与恢复

### 7.1 幂等

- 根幂等键由 tenant + actor + purpose + request idempotency key 构成；
- 同键同 payload 返回同一 AgentRun 和 Delivery；
- 同键不同 payload fail closed；
- Delivery 写入使用派生键 `${idempotencyKey}:delivery`；
- 同一 Lesson/实际场次仍受现有 LessonDelivery session key 约束。

### 7.2 失败顺序

```text
authorize/read -> build context -> generate -> validate/evaluate
  -> persist runtime result -> create/replay Delivery draft
```

- 生成、校验或评估失败：不调用 Delivery 写入端口；
- Runtime 已保存但 Delivery 写入暂时失败：重试同一请求，回放 Runtime 输出并恢复 Delivery 写入；
- API 重启：从 AgentRun 输出恢复，不需要重新推断；
- 任何失败都不得更改 confirmed Delivery 或 TeachingPlan。

## 8. Observation Candidate 边界

Candidate 不是 `ClassroomObservationRevision`，不进入正式观察表。UI 必须显示“候选，尚未确认”。

教师采用 Candidate 的流程：

```text
confirmed Delivery
  -> 教师点击候选
  -> 预填现有 Observation Draft
  -> 教师保存
  -> 教师再次确认
  -> confirmed ClassroomObservation
```

在 Delivery 尚未确认时，候选只能预览，不能创建正式 Observation Draft。具体学习者范围仍需要教师显式选择，Skill 第一版只生成 class/activity 候选。

## 9. Teaching Workspace 交互

### 9.1 无 Delivery

主卡片显示五组选择，默认值为：基本按计划、正常、达成、无异常、无补充。主按钮为“生成课堂记录草稿”。

### 9.2 有 draft Delivery

展示：

- “AI 已按反馈整理，尚未成为正式事实”；
- 一段课堂摘要；
- adopted/adjusted/skipped 环节；
- Observation Candidates；
- “教师确认实施”主按钮；
- “查看并调整完整草稿”次按钮。

### 9.3 有 confirmed Delivery

保持既有正式状态和历史显示；显示候选观察的采用入口。后续 Reflection 仍只在 confirmed Delivery 后开放。

## 10. Evaluation

### Contract

- 输入/输出 Schema；
- 五个实施环节完整；
- DeliveryContent 可被现有契约解析。

### Policy

- approved plan 版本匹配；
- ActingContext 与 Lesson/CourseRun 匹配；
- Evidence 全部已授权；
- 未确认 Candidate 不标记为事实。

### Quality

- 计划与实际差异可解释；
- 教师输入没有被扩写为长期能力结论；
- 缺口明确；
- 反思输入保持候选语气。

### Operation

- latency；
- estimated input tokens；
- retry count；
- model token/cost（确定性 v1 为 0）。

## 11. 测试范围

- Skill schema、映射、候选语义和缺口；
- Quick feedback 不直接创建 confirmed Delivery；
- Observation Candidate 不进入正式观察表；
- 无 approved plan 拒绝；
- approved plan 版本冲突返回结构化冲突；
- 同键同 payload 回放、同键不同 payload 拒绝；
- 跨学校拒绝且不泄漏；
- 生成失败不损坏既有 Delivery；
- draft -> teacher confirm -> reflect Journey；
- UI 30 秒路径、刷新恢复和完整草稿调整；
- 旧 LessonDelivery/Reflection 流程继续通过。

## 12. 不变量

1. TeachingPlan 不因快速反馈被修改；
2. Agent 输出始终是 Draft/Candidate；
3. 日历结束不自动创建课堂事实；
4. Delivery 必须由教师显式确认；
5. Observation 必须由教师显式确认；
6. 一次课堂反馈不生成长期学生标签；
7. 无 approved plan 不生成正式材料或实施草稿；
8. 所有租户、课程和 Evidence 授权来自服务端 ActingContext。
