# Phase 8A-1 Lesson Brief 能力审计

## 审计结论

当前系统已经具备生成可解释 Lesson Brief 候选所需的最小地基：Lesson、Learning Objective、课时已关联 Evidence、current approved TeachingPlan、confirmed TeacherPreference、Versioned Skill Registry、Context Builder、QueryRun、ContextManifest 与 AgentRun。Phase 8A-1 不需要新增数据库表，也不应把 Brief 写回任何正式教育对象。

Lesson Brief 应由 Runtime 拥有生成过程与候选结果，由 Work 模块在教师“采用”后只保存候选 Run 的来源引用。它不是 Lesson、TeachingPlan 或 Evidence 的替代真值。

## 1. 可使用的真实数据来源

| 来源 | 当前入口 | 可用于 Brief 的字段 | 授权与版本依据 |
| --- | --- | --- | --- |
| Lesson | `LessonPreparationApplicationFacade.getLesson` | 标题、课时序号、时长、计划时间、当前准备状态 | Session 派生的 tenant/actor + Lesson 读取权限；由字段摘要生成版本与 hash |
| Learning Objective | `LessonView.learningObjectives` | 目标标题、描述、objective ref | 与 Lesson 同一 CourseRun；逐目标记录 ref、版本摘要与 hash |
| Evidence | `PostgresGate2ReadService` 的 Education 读取入口 | 已授权 observation/claim 的摘要、类型、时间、未知项 | 先按 tenant/CourseRun 读取，再与 `Lesson.currentEvidenceRefs` 取交集；未授权 ref 必须排除并记录 |
| approved TeachingPlan | `LessonPreparationApplicationFacade.getLessonTeachingPlans` | 当前 approved revision 的目标、重点、活动与支持策略 | 只读取 current approved revision；记录 revision ref/number/state/hash |
| Teacher Preference | `PersonalizationContextProvider.listConfirmedPreferences` | 已确认且未撤销的表达、组织与偏好设置 | tenant + teacher owner 校验；记录 preference ref/version/hash |
| Lesson Journey | `LessonJourneyReadService` | 当前 understand/plan 等解释阶段 | 只用来决定页面展示与下一步，不作为 Brief 内容事实 |
| Runtime | 既有 QueryRun、ContextManifest、AgentRun | 生成来源、manifest hash、skill id/version、候选及教师处置 | Runtime 只保存执行事实和候选，不写 Platform 正式状态 |

## 2. 当前缺失数据

- 尚未接入正式教材知识库，无法权威说明教材编排意图、章节纵向关系或版本差异。
- 尚未接入课程标准知识源，无法引用国家或地方课程标准条文。
- 尚未接入考点与考试要求知识源，不能声称某内容属于正式考点或命题要求。
- Evidence 只覆盖教师已授权且当前 Lesson 已关联的记录；缺失 Evidence 时只能呈现“尚无可追溯班级依据”。
- 当前没有课堂实时数据，也不能根据 approved TeachingPlan 推断课堂已经实施。

这些缺失必须出现在 `knownGaps` 与 ContextManifest 的 missing/excluded information 中，不得由模型或规则静默补全。

## 3. 当前可以自动生成的内容

- 目标摘要：对现有 Learning Objective 做短句归纳，并保留 objective ref。
- 教学重点候选：从目标描述、current approved TeachingPlan 和已确认偏好中提炼候选，不写回 Lesson。
- 教学难点候选：基于已授权 Evidence 的重复错误/未知项，或基于目标要求生成明确标注为“待教师确认”的推断。
- 班级 Evidence 摘要：仅汇总当前 Lesson 已授权的 observation/claim，并保留来源 ref。
- 建议关注点：把 Evidence、目标与 approved plan 的一致/缺口转换为教师可判断的短建议。
- 信息缺口：明确列出知识源、Evidence、计划或偏好缺失。

## 4. 必须等待 Knowledge Layer 的内容

- 课程标准条款、学段要求与权威达成水平。
- 教材版本、单元编排意图、跨课时先备关系和教材例题语义。
- 正式考点、题型分布、考试频率与地区差异。
- 未经教师选择或授权的全班提交、学生长期能力判断。

Phase 8A-1 的 UI 必须显示“尚未接入教材/课程标准/考点知识源”，不得用确定口吻补写上述内容。

## 5. 现有边界与复用方案

- Skill Registry 已支持不可变 `SkillVersion`、published/draft/deprecated 和历史版本加载，可直接增加 `lesson-analysis@1`。
- 现有 Lesson Preparation Context Builder 已证明“授权 → 排序/压缩 → manifest → evaluation”的实现模式；Lesson Analysis 应复用原则，不直接访问 Repository。
- `work.query_run` 可表达一次只读分析请求；`runtime.context_manifest` 与 `runtime.agent_run.output` 可保存可解释候选，无需 `lesson_brief` 表。
- `TaskWorkingSet.sourceResourceRefs` 已是正式的来源引用扩展点；采用 Brief 时保存 `lesson-brief-run:<agentRunRef>`，候选内容仍由 Runtime 解释。
- `agent_run.status` 保留现有兼容状态，内嵌 Runtime checkpoint/status 记录 `waiting_for_human`，避免破坏既有 Runs API 枚举。

## 6. 风险与约束

- 不能让 Web 自行拼装重点难点；候选必须来自 API 返回的 Skill 输出。
- 不能用 CourseRun 中所有 Evidence 代替 Lesson 授权 Evidence。
- 不能将教师“采用”解释为 TeachingPlan 已批准或 Lesson 已完成。
- 不能把 approved TeachingPlan 的内容描述成课堂已实施事实。
- 不新增 Migration；所有新持久化使用既有 QueryRun、ContextManifest、AgentRun output 与 TaskWorkingSet 来源引用。
