# Lesson Brief 设计

## 1. 定位

Lesson Brief 是针对单一 Lesson 的可解释教学洞察候选。它回答“系统基于当前已知信息，建议教师先关注什么”，而不是创建新的教育事实。

- Platform 继续拥有 Lesson、Objective、Evidence、TeachingPlan 和 TaskWorkingSet。
- Runtime 拥有 QueryRun、ContextManifest、AgentRun、SkillVersion 绑定和候选输出。
- 教师采用候选时，Work 只保存候选 Run 的来源引用；不覆盖任何 Platform 对象。

## 2. LessonBriefSnapshot

```ts
interface LessonBriefSnapshot {
  lessonRef: string;
  status: "waiting_for_teacher" | "adopted" | "deferred";
  sourceRefs: LessonBriefSourceRef[];
  sourceVersionVector: Record<string, string>;
  objectiveSummaries: LessonBriefObjectiveSummary[];
  teachingFocusCandidates: LessonBriefCandidateItem[];
  difficultyCandidates: LessonBriefCandidateItem[];
  classEvidenceSummary: LessonBriefEvidenceSummary[];
  suggestedAttentionPoints: LessonBriefCandidateItem[];
  knownGaps: string[];
  generatedBySkillRef: "lesson-analysis@1";
  agentRunRef: string;
  contextManifestRef: string;
  contextManifestHash: string;
  contentHash: string;
  generatedAt: string;
}
```

每个 source 记录：

- `kind`：lesson/objective/evidence/teaching_plan/preference/teacher_adjustment；
- `ref` 和 `version`；
- `contentHash`；
- `provenance`；
- 是否实际进入 Context。

候选项记录：

- 稳定 `candidateId`；
- 简短标题与说明；
- `basisRefs`；
- `confidence`（high/medium/low）；
- `candidateOnly: true`。

## 3. ContextPlan 与 Manifest

Lesson Analysis ContextPlan 由 `lesson-analysis@1` 的 context policy 产生：

1. Session 解析 tenant、actor 与 CourseRun 范围；
2. Lesson Read Facade 返回 Lesson 与 Objectives；
3. Evidence Read Facade 只返回 `Lesson.currentEvidenceRefs` 与当前 CourseRun Evidence 的交集；
4. Artifact Read Facade只返回 current approved TeachingPlan；
5. Personalization Port 只返回 confirmed、active preference；
6. Context Builder 按 field mask 选择字段，计算 hash、缺口与 token 估算；
7. ContextManifest 封存实际使用、缺失和排除内容。

默认预算不追求把所有内容塞入模型：Objective 优先，confirmed Evidence 次之，approved plan 与偏好只保留对判断有价值的字段。未授权 Evidence 即使由请求提供也必须排除。

## 4. lesson-analysis@1

Skill 目录：`apps/api/src/agent/skills/lesson-analysis/`。

包含：

- `manifest.ts`：purpose、schema、context/tool/memory/budget/approval/evaluation policy；
- `input-schema.ts`：只接受 Context Builder 的 authorized snapshot；
- `output-schema.ts`：`lesson-brief-candidate@1`；
- `prompt.ts`：未来 ModelExecutor 可使用的版本化 prompt bundle；
- `context-policy.ts`：授权、field mask、token budget 与 Evidence 交集规则；
- `validator.ts`：schema、scope、provenance、禁止权威知识伪造；
- `evaluation.ts`：contract/policy/quality/operation/context 结果；
- `generator.ts`：Phase 8A-1 的确定性候选生成器，保证没有模型或知识库时仍可解释、可测试。

本阶段使用确定性生成器，不新增 ModelExecution 类型，也不改 Runtime Kernel。Prompt、schema 与 validator 仍作为发布 Skill 的不可变组成，为后续显式接入模型执行器保留兼容边界。

## 5. Runtime 记录

生成流程：

```text
Lesson understand
  -> QueryRun
  -> AuthorizationDecision
  -> lesson-analysis@1
  -> ContextPlan / ContextManifest
  -> deterministic Skill execution
  -> validation / evaluation
  -> AgentRun output: LessonBriefSnapshot
  -> Runtime status: waiting_for_human
```

Run 必须记录：

- `skillId = lesson-analysis`；
- `skillVersion = 1`；
- Skill manifest content hash；
- ContextManifest ref/hash；
- output content hash；
- selected source refs 和 excluded refs；
- teacher disposition。

为保持现有 Runs API 兼容，数据库兼容状态仍可为 `completed`，但 Run output 中的 Runtime 状态必须是 `waiting_for_human`，直到教师采用或暂不采用。

## 6. 教师确认流程

### 采用

- 教师选择候选项（默认可采用全部）；
- Runtime 将该候选标记为 adopted，并记录 teacher、time 和 selected ids；
- Work Application Service 将 `lesson-brief-run:<agentRunRef>` 写入当前 Lesson Preparation Task 的 `TaskWorkingSet.sourceResourceRefs`；
- 不修改 Lesson、Objective、Evidence 或 TeachingPlan。

### 调整

- 教师输入一句短意图；
- 创建新的 QueryRun/AgentRun；
- 原候选保留并标记为 superseded-by-adjustment；
- 新 ContextManifest 把教师调整作为显式来源；
- 仍等待教师采用。

### 暂不采用

- Runtime 保存 deferred disposition；
- 候选保留用于审计与历史查看；
- Journey 回到可再次生成状态，不创建 TaskWorkingSet 绑定。

## 7. Journey 解释规则

- 无 Brief 且 Lesson 目标可用：`understand.ready`。
- Brief 正在生成：`understand.waiting_for_agent`。
- 已生成未处置：`understand.waiting_for_teacher`。
- adopted 后才允许 Journey 根据现有 Task/TeachingPlan 真值进入 plan；Brief 自身不能宣称 plan 完成。
- deferred 不等于完成；仍为 understand.ready。

## 8. API 形态

新增小粒度、兼容性路由：

- `GET /api/v1/teacher/lessons/:lessonRef/brief`
- `POST /api/v1/teacher/lessons/:lessonRef/brief/generate`
- `POST /api/v1/teacher/lessons/:lessonRef/brief/:agentRunRef/disposition`

响应只返回当前候选、来源摘要、缺口、处置状态和必要 refs；不返回全部 Evidence、TeachingPlan 或 Run 历史。

## 9. 不变量

- Brief 不能写入 Education/Artifact 正式状态。
- 未授权 Evidence 不得进入 ContextManifest 或候选 basisRefs。
- 未确认偏好不得进入 Context。
- 教材、课程标准和考点知识源缺失必须显式呈现。
- 教师采用不等于 TeachingPlan approval，也不等于课堂实施。
- 相同 idempotency key 不同 payload 必须 fail closed。
