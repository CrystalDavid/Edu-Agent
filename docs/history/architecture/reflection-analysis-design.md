# Reflection Analysis 设计

## 1. 目标与边界

`reflection-analysis@1` 把教师已经确认和明确选择的课堂来源整理成可审阅的 Reflection Draft。它不判断课堂是否发生，不创建 confirmed Reflection，不修改 TeachingPlan/Evidence，也不创建后续行动。

```text
confirmed facts
  -> authorized Reflection Context
  -> reflection-analysis@1
  -> facts / interpretation / action candidates
  -> Reflection Draft Revision
  -> teacher review
  -> existing Reflection Application Service confirm
  -> confirmed Reflection Revision
  -> teacher explicitly chooses a follow-up command
```

## 2. SkillVersion

| 属性 | 值 |
| --- | --- |
| id | `reflection-analysis` |
| version | `1` |
| ref | `reflection-analysis@1` |
| status | `published` |
| purpose | `reflection_analysis` |
| output kind | `draft` |
| tools | disabled |
| memory | authorized context only |
| approval | teacher required |
| evaluation | contract / policy / quality / operation |

Published SkillVersion 不可修改；后续行为或输出契约变化必须发布新版本。历史 Run 继续通过记录的 `skillRef`、manifest hash 和 Prompt hash 解释。

## 3. 输入

`ReflectionAnalysisSkillInput` 仅包含当前运行封存的最小来源快照：

```ts
type ReflectionAnalysisSkillInput = {
  tenantRef: string;
  actorRef: string;
  lesson: SourceSnapshot & {
    lessonRef: string;
    courseRunRef: string;
    title: string;
    learningObjectiveRefs: string[];
  };
  approvedTeachingPlan: SourceSnapshot & {
    revisionRef: string;
    content: TeachingPlan;
  };
  confirmedDelivery: SourceSnapshot & {
    deliveryRevisionRef: string;
    actualStartAt: string;
    actualEndAt: string;
    steps: DeliveryStep[];
    paceNotes: string;
    unresolvedQuestions: string[];
    followUpNotes: string;
  };
  confirmedObservations: ConfirmedObservationSnapshot[];
  selectedEvidence: AuthorizedEvidenceSnapshot[];
  lessonBrief: AdoptedLessonBriefSnapshot | null;
  currentReflectionDraft: ReflectionContent;
  teacherAdjustment: string | null;
  authorizedEvidenceRefs: string[];
  generatedAt: string;
};
```

输入规则：

1. approved plan 必须是当前 Lesson 的正式 approved Revision；
2. Delivery 必须是 `confirmed`，且绑定同一 approved Revision；
3. Observation 必须是 `confirmed`、属于同一 Lesson/tenant 且由教师显式选择；
4. Evidence 必须在 Reflection Draft 的 sealed selection 中，且生成时再次授权；
5. Lesson Brief 只接受当前教师采用的快照；不存在时明确记录缺口；
6. Teacher Adjustment 是本次教师的一句话，不扩大资源授权范围。

## 4. Context Builder

```text
Reflection TaskWorkingSet
  -> server Session / ActingContext
  -> approved plan and confirmed delivery validation
  -> confirmed observation validation
  -> selected evidence authorization
  -> adopted Lesson Brief lookup
  -> ranking / bounded compression
  -> ContextManifest
  -> reflection-analysis@1
```

ContextManifest 记录：

- Skill/Prompt/Policy 版本；
- Lesson、TeachingPlan Revision、Delivery Revision；
- included Observation/Evidence/Lesson Brief refs、versions、hashes 和 provenance；
- 被拒绝或预算排除的 Evidence；
- 缺失来源；
- requested field mask；
- estimated token usage；
- Manifest content hash。

第一版限制：最多 12 条 Observation、12 条 Evidence；文本使用有界摘要。Context Builder 不能绕过现有 Authorization，也不能读取未选择提交或整个班级数据。

## 5. 输出模型

```ts
type ReflectionAnalysisDraft = {
  schemaVersion: "reflection-analysis-draft@1";
  whatHappened: {
    facts: Array<{
      text: string;
      basisRefs: string[];
      status: "confirmed_source";
    }>;
  };
  whatItMeans: {
    interpretations: Array<{
      text: string;
      basisRefs: string[];
      confidence: "agent_interpretation";
    }>;
    uncertainties: string[];
  };
  whatNext: {
    actionCandidates: Array<{
      candidateId: string;
      actionType:
        | "lesson_preparation"
        | "assignment_draft"
        | "teacher_todo";
      title: string;
      rationale: string;
      basisRefs: string[];
      status: "candidate";
      teacherConfirmationRequired: true;
    }>;
  };
  reflectionContent: ReflectionContent;
  knownGaps: string[];
  teacherConfirmationRequired: true;
};
```

### What happened

只允许转述 confirmed Delivery、confirmed Observation 和 selected Evidence。每条事实必须带 `basisRefs`，不得引用 Lesson Brief、偏好或模型解释作为课堂事实来源。

### What it means

明确标记为 Agent interpretation。教学目标达成解释、有效性判断、Evidence 一致/冲突和可能原因放在此层；不确定内容进入 `uncertainties`。

### What next

最多三个候选，每类最多一个。候选始终是 `status=candidate` 且 `teacherConfirmationRequired=true`，不能在 Skill 或生成完成时调用任何 Platform command。

### ReflectionContent 兼容层

现有正式 Reflection Revision 继续使用 `ReflectionContent`，不做 Migration。Skill 输出同时生成兼容内容，交给既有 Artifact Application Service 创建新的 draft Revision；Runtime 保留完整三层分析和 Skill Evaluation。

## 6. 模型输出与规范化

为了保持历史模型调用、Fake Ark 和旧 Reflection Run 可恢复，Phase 8A-5 保留现有 `lesson-reflection@1` Provider JSON 契约作为模型边界，并在本地校验成功后执行受版本控制的规范化：

```text
Provider lesson-reflection@1 JSON
  -> existing schema/scope/evidence/policy validation
  -> reflection-analysis@1 normalize
  -> reflection-analysis output validation/evaluation
  -> Runtime persists layered draft
  -> Artifact persists compatible ReflectionContent draft
```

该兼容适配器不扩大模型权限；它让新的 Skill 生命周期进入现有稳定执行链，而不修改 Runtime Kernel 或数据库约束。未来 Provider 原生输出三层结构时应发布 `reflection-analysis@2`，不能静默覆盖 v1。

## 7. Validator

Validator 必须检查：

1. 输出 Schema 完整；
2. `whatHappened.facts[*].basisRefs` 仅指向 confirmed Delivery/Observation/selected Evidence；
3. 所有 Evidence ref 都在 ContextManifest included set；
4. `actionCandidates.length <= 3` 且 actionType 唯一；
5. 每个 Action Candidate 明确需要教师确认；
6. 输出没有声称已批准计划、已发布作业或已创建任务；
7. 没有真实学生姓名、固定能力标签或未授权长期画像；
8. known gaps 明确，尤其是 adopted Lesson Brief 或 Evidence 缺失。

## 8. Evaluation

### Contract

- Skill 输入与输出 Schema；
- ReflectionContent 兼容性；
- 三层结构完整。

### Policy

- confirmed fact refs 完全处于 sealed context；
- selected Evidence only；
- Draft/Candidate only；
- no automatic Platform write。

### Quality

- 事实与解释没有混写；
- 不确定性显式；
- 候选不超过三个且可执行；
- 每个结论可回溯；
- 没有权威知识源时不虚构课程标准、教材或考试要求。

### Operation

- provider latency；
- input/output token；
- retry/repair 次数；
- estimated cost；
- Context estimated token 与 excluded count。

## 9. Runtime 与持久化

现有 Runtime 表足够，无需 Migration。AgentRun/RunManifest/ModelExecution 应记录：

- `skillId=reflection-analysis`；
- `skillVersion=1`；
- `skillRef=reflection-analysis@1`；
- Skill manifest/content hash；
- Prompt bundle ref/version/hash；
- ContextManifest ref/hash；
- layered draft hash；
- Evaluation；
- `runtimeStatus=waiting_for_human`；
- `teacherConfirmationRequired=true`。

Artifact 只保存兼容的 draft Reflection Revision 和 `sourceAgentRunRef`。教师确认仍调用现有 `confirmReflection`；Skill 不能直接访问 Artifact/Education Repository。

## 10. 教师审阅交互

Reflection 主区不再首先展示九组长文本框，而按判断顺序展示：

1. **发生了什么**：带来源的 confirmed facts；
2. **这意味着什么**：明显标注为 AI 分析和不确定项；
3. **下一步建议**：最多三个未执行候选。

教师动作：

- **准确**：显式确认当前 Reflection Draft；
- **修改**：输入一句调整意见，重新生成新 Draft Revision，保留历史；
- **不确定**：把当前判断加入 uncertainties 并保存新 Draft，不确认。

确认后才显示 follow-up 候选的“创建”按钮。每次点击只创建一个明确动作，且继续使用既有幂等 API。

## 11. Journey 规则

| 条件 | stage/status | 下一步 |
| --- | --- | --- |
| 无 confirmed Delivery | `deliver.*` | 先确认课堂反馈 |
| confirmed Delivery、无 Reflection | `reflect.ready` | 生成本节课复盘 |
| Reflection 模型运行中 | `reflect.waiting_for_agent` | 等待/恢复运行 |
| Reflection Draft | `reflect.waiting_for_teacher` | 准确/修改/不确定 |
| confirmed Reflection、无 follow-up | `improve.needs_attention` | 选择下一步 |
| 至少一个显式 follow-up | `improve.completed` | 进入已创建的正式流程 |

Journey 仍是可重建投影，不能成为业务状态源。

## 12. 失败与恢复

- 无 confirmed Delivery：生成请求 fail closed；
- Context 授权失败：不创建 ModelExecution；
- Provider/校验失败：保留原 Reflection Draft 和所有正式事实；
- 教师在生成期间修改 Draft：finalize 检测 revision conflict，不覆盖；
- API/Worker 重启：从 PostgreSQL ModelExecution、ContextManifest 和 AgentRun 恢复；
- 相同幂等键同 payload 回放；不同 payload fail closed；
- 任何失败均不创建 follow-up。

## 13. 明确非目标

- 自动确认 Reflection；
- 自动修改下一课 TeachingPlan；
- 自动创建 Preparation Task、Assignment 或 Todo；
- 自动发布作业；
- 自动长期学生画像；
- Memory 或 Runtime Kernel 重构；
- 新事实表或数据库 Migration。
