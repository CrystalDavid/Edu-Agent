# Phase 8A-1 Lesson Brief 实施报告

## 1. 结果

Phase 8A-1 在不新增数据库表、不修改 Migration、不改写 Lesson、LearningObjective、TeachingPlan 或 Evidence 的前提下，为 Teaching Workspace 增加了可解释的教学洞察候选能力。

教师打开处于 `understand` 阶段且具备教学目标的课时时，可以：

1. 生成教学重点、教学难点、班级 Evidence 摘要和建议关注点候选；
2. 查看本次实际使用的来源、版本、哈希以及尚未接入的知识源；
3. 选择候选后采用到现有 TaskWorkingSet；
4. 用一句话提出调整意图并重新生成；
5. 暂不采用并继续原有 TeachingPlan、材料、课堂实施与反思流程。

Lesson Brief 始终是候选解释，不是正式教育事实。

## 2. Lesson Brief 模型

`LessonBriefSnapshot` 是可由 Runtime 记录重建的只读快照，包含：

- `lessonRef`；
- `sourceRefs`、`sourceVersionVector`、各来源 `contentHash` 与 provenance；
- `objectiveSummaries`；
- `teachingFocusCandidates`；
- `difficultyCandidates`；
- `classEvidenceSummary`；
- `suggestedAttentionPoints`；
- `knownGaps`；
- `generatedBySkillRef`、`agentRunRef`、`contextManifestRef` 与 manifest hash；
- 教师调整语句和最终 disposition。

快照没有独立的 `lesson_brief` 表。生成结果写入既有 `runtime.agent_run.output`，授权上下文写入既有 `runtime.context_manifest`，运行解释写入既有 RunManifest。教师采用时只把 `lesson-brief-run:<agentRunRef>` 加入现有 TaskWorkingSet 的来源引用。

## 3. Skill 设计

新增 published Skill `lesson-analysis@1`：

- Manifest：固定 Skill、Prompt、输入输出 Schema、Context Policy 和 Evaluation 版本；
- Input：Lesson、LearningObjectives、已授权 Evidence、current approved TeachingPlan、confirmed TeacherPreference 与教师本次调整；
- Output：`lesson-brief-candidate@1`；
- Validator：阻止候选引用 ContextManifest 之外的来源，并阻止伪造教育部、课程标准、教材或考试权威结论；
- Evaluation：覆盖 contract、policy、quality、operation 和 context；
- Approval Policy：输出是 Draft，必须由教师判断。

当前版本采用确定性的来源归纳器生成候选，不依赖公网，也不把缺少的教材、课标或考点知识交给模型猜测。Prompt Bundle 已版本化，未来在 Knowledge Layer 和模型评估就绪后可复用同一 Skill 边界接入 ModelExecutor。

## 4. Context 流程

```text
Lesson Journey / Teacher action
  -> LessonBriefSourceReader
  -> Lesson + Objectives + current approved plan
  -> tenant/course-scoped Evidence authorization intersection
  -> confirmed TeacherPreference only
  -> lesson-analysis@1 Context Builder
  -> ranking / field mask / token estimate / exclusions
  -> ContextManifest + hash
  -> candidate generation + validation + evaluation
  -> AgentRun(output = LessonBriefCandidate, waiting_for_human)
```

未授权 Evidence 在 Skill 执行前被移除，并在 manifest 中以 `included=false`、`excluded_by_authorization_or_lesson_scope` 记录。候选的 `basisRefs` 必须全部属于实际 included source refs。

## 5. 教师确认流程

### 采用

- 教师选择候选；
- 若当前课时没有备课 Task，Web 通过现有正式 API 创建 Task；
- 使用 expected WorkingSet version 将 AgentRun 来源绑定到 TaskWorkingSet；
- Runtime 保存 `adopted` disposition；
- 不修改 Lesson、Objective、TeachingPlan 或 Evidence。

### 调整

- 教师只输入一句调整意图；
- 产生新的幂等生成请求、新 AgentRun、新 ContextManifest 和新候选；
- 旧候选保留在 Runtime 历史中。

### 暂不采用

- Runtime 保存 `deferred` disposition；
- Journey 继续依据正式业务状态进入 plan/materials/deliver 等阶段；
- 不反复把教师拉回生成入口。

## 6. Journey 与 Web

Journey 新增：

- `generate_lesson_brief`；
- `review_lesson_brief`；
- `lesson_brief_run` source；
- `lesson_brief_adopted` milestone。

状态解释：

- 有目标、无 Brief、无当前准备 Task、无 confirmed Delivery：`understand.ready`；
- 已生成候选：`understand.waiting_for_teacher`；
- 已采用：以 milestone 继续正式备课流程；
- 已暂不采用：继续正式业务流程；
- 缺少教学目标：保留 `understand.needs_attention`，只显示“检查课时信息”，不显示可误导的生成面板；
- approved TeachingPlan 仍不等于已授课。

`LessonBriefPanel` 只出现在真正可生成或待判断的 understand 状态，提供候选选择、来源/缺口、采用、一句话调整和暂不采用，不提供写回正式对象的大表单。

## 7. API

新增兼容性读取/命令路由：

- `GET /api/v1/teacher/lessons/:lessonRef/brief`；
- `POST /api/v1/teacher/lessons/:lessonRef/brief/generate`；
- `POST /api/v1/teacher/lessons/:lessonRef/brief/:agentRunRef/disposition`。

GET 与生成均通过 Lesson source facade 重新验证 workspace/tenant/actor 授权。相同幂等键和相同 payload 重放原结果；不同 payload 继续由既有治理幂等机制 fail closed。采用使用 expected content hash 与 expected WorkingSet version 防止并发覆盖。

## 8. 数据边界

- Education：继续拥有 Lesson、Objective、Evidence；
- Artifact：继续拥有 TeachingPlan；
- Work：继续拥有 TaskWorkingSet；
- Runtime：只拥有 Lesson Brief 的生成、Manifest、Evaluation 和教师 disposition 执行事实；
- Web：只渲染 API 状态，不自行推导 Journey 或保存候选真值。

本阶段没有新增或修改 Migration。仓库仍有 45 个 Migration：43 个历史 Migration、Phase 7A personalization Migration 和日历类别 Migration，内容均未改变。

## 9. 验证结果

| 验证 | 结果 |
| --- | --- |
| TypeScript | 通过 |
| Unit | 17 files / 89 tests 通过 |
| Architecture | 16 files / 92 tests 通过 |
| PostgreSQL | 20 files / 103 tests 通过 |
| Default Playwright | 22 tests 通过 |
| Fake Ark Playwright | 1 test 通过 |
| Production build | 通过 |

PostgreSQL 和 Playwright 均使用独立 Volume/ObjectStore，结束后已清理；开发数据库、上传文件和本地状态未改变。

重点回归覆盖：

- 固定输入的 Skill Schema 与 candidate-only 输出；
- 缺少 Evidence 时明确缺口；
- 未授权 Evidence 不进入 manifest 和输出；
- 候选不能引用 manifest 外来源；
- 生成、重放、跨读取恢复、采用与 TaskWorkingSet 绑定；
- 采用前后 Lesson 响应完全一致；
- 跨学校 GET/生成返回 404；
- Journey 的 ready、waiting_for_teacher、adopted、deferred 规则；
- 浏览器真实生成、来源查看和“暂不采用”恢复流程。

## 10. 未实现与下一阶段

本阶段明确未实现：

- 教材、课程标准、考点或题库 Knowledge Layer；
- 向量检索；
- Lesson Brief 正式事实表；
- 自动修改教学目标或 TeachingPlan；
- 自动采用候选；
- Lesson Brief 的材料生成。

建议下一阶段在保持当前候选与来源模型的基础上，实现 Phase 8A-2：将已采用的 Lesson Brief 作为 lesson-preparation Skill 的显式输入，形成“洞察候选 -> 备课方案候选”的闭环；Knowledge Layer 应作为后续独立阶段接入，并继续在 ContextManifest 中记录来源、版本与缺口。
