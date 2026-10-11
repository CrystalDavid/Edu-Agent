# Edu-Agent 记忆系统重设计交接说明

> 状态：DESIGN INPUT
>
> 审计日期：2026-08-18（Asia/Shanghai）
>
> 审计快照：分支 `codex/teaching-workspace-ui-simplification`，提交前 HEAD `f0f1118c181471414287bdf7233af75ce121eb36`

## 1. 使用说明

本文供后续架构师或 GPT-5.6 Pro 在重设计 Edu-Agent 记忆系统前建立准确上下文。结论来自当前工作树源码、Migration、测试和当前权威文档的只读核验。

当前分支包含尚未提交的 UI 与文档重组。分析时应遵循以下证据优先级：

1. 当前代码和自动化测试；
2. `docs/capabilities.md` 与 `docs/architecture/README.md`；
3. 根 `README.md`、`AGENTS.md` 与局部 README；
4. 历史文档只用于追溯，不作为当前实现真值。

根 `AGENTS.md` 的模块表仍写着个性化模块“尚无产品持久化 Adapter”，但源码、Migration、PostgreSQL 测试和 Playwright 测试均证明 Phase 7A 已有 PostgreSQL Adapter、API 和教师设置入口。该行是陈旧描述，应以代码与测试为准。

不要读取或输出 `.env.local`、`.local-data/`、Secret、真实师生数据、完整模型 Prompt/响应或隐藏推理。

## 2. 一句话结论

Edu-Agent 现在并非完全没有记忆，而是只有一个安全、可持久化、由老师手工维护的“偏好登记簿”。它还没有多轮对话工作记忆、自动记忆提炼、习惯形成、情境化检索、冲突消解和效果反馈闭环。

因此系统能够“保存一条老师明确配置并确认过的偏好”，却不能像人类助理一样“理解上一句话、从反复纠正中学习，并在正确场景自然想起来”。

## 3. 项目定位与最终目标

Edu-Agent 是面向学校的教育 Agent 平台。当前产品聚焦普通教师工作台，并提供最小学校管理员能力。它不是让模型代替老师决策，而是把 Agent 放进有身份、权限、上下文、Evidence、审批、审计和可恢复状态的教师工作流。

模型输出默认只能形成 Proposal 或 Draft。教师的显式操作才可以形成批准后的 TeachingPlan、批改决定、课堂实施事实、Reflection 或后续行动。

记忆系统升级后的产品北极星应是：

> 老师不需要反复教系统同一件事，但系统也不能擅自把一次偶然表达永久化。

目标体验包括：

- 同一任务或对话中保持连续理解；
- 记住老师明确要求和经验证的稳定习惯；
- 在正确的课程、班级、任务和时间范围内调用正确记忆；
- 解释记住了什么、本次为何使用；
- 支持临时覆盖、纠正、撤销和遗忘；
- 不越过 Evidence、授权、学校隔离和教师最终控制；
- 学生相关结论仍由 Education/Evidence 领域拥有，不能被静默固化为永久标签。

## 4. 当前系统能力背景

| 领域 | 当前实现 | 与记忆的关系 |
|---|---|---|
| 身份治理 | Session、Membership、Role、CourseRun access、跨校隔离、Audit | 记忆必须继承 tenant/teacher 作用域 |
| 课程课时 | CourseRun → Unit → Lesson、Journey、Lesson Brief | 检索需要课程、年级、学科、课时等情境 |
| Agent Runtime | Task/TaskRun、AgentRun、AuthorizedContextPlan、sealed ContextManifest | ContextManifest 是授权快照，不是对话记忆 |
| 模型调用 | Mock 或 Volcengine Ark、预算、队列、取消、重试、恢复、校验 | 当前是结构化任务调用，不是连续对话协议 |
| 教学产物 | Proposal、TeachingPlan Revision、材料包、文件版本、审批 | 采用、拒绝和修改差异尚未成为记忆信号 |
| 作业 Evidence | 作业、提交、批改、Evidence、调整下一课 | 学习事实不能复制成无来源永久画像 |
| 课堂反思 | Delivery、Observation、Reflection、行动候选 | 重复做法可以成为习惯候选，但不能冒充课堂事实 |
| 工作台 | Todo、Calendar、来源投影 | 程序性习惯和工作流暂无统一记忆模型 |
| 个性化 | MemoryCandidate、TeacherPreference、确认/修改/拒绝/撤销、跨重启恢复 | 当前长期记忆只覆盖静态偏好 |

当前仍没有教材/课程标准知识层、文件内容理解、多模态/OCR、学生端和完整考试。真实 Provider 只有 Ark，默认环境还可能使用 Mock。这些缺口会削弱“聪明感”，但不能与“记不住上一句”混为同一个问题。

## 5. 必须保留的架构不变量

系统是七模块、七 PostgreSQL Schema 的模块化单体：

1. `identity-governance-audit` / `governance`
2. `work-assistant-durable-execution` / `work`
3. `agent-runtime-context` / `runtime`
4. `capability-integration` / `capability`
5. `artifact-collaboration` / `artifact`
6. `education-domain` / `education`
7. `personalization-memory-analytics` / `personalization`

重设计不得破坏：

- 正式状态由 owning module 写入，跨模块通过 Port、Application Service、Outbox 或明确的 Composition Service；
- 每次运行重新解析 ActingContext、purpose、scope 和 field mask，记忆不能构成永久授权；
- Agent 输出默认是 Candidate、Proposal 或 Draft，教师拥有最终控制权；
- Evidence 保留来源、未知项、置信度和历史，不形成静默 learner 标签；
- 跨学校访问 fail closed，错误不能泄漏资源存在性；
- Audit、Authorization、Outbox 和 Revision 历史不可覆盖；
- Migration 只允许向前追加，不能修改既有文件；
- revoked、expired、superseded 或不适用记忆不得进入新 Context；
- 完整 Prompt、完整响应、隐藏推理和 Secret 不作为普通记忆保存。

## 6. 当前记忆领域模型

### 6.1 MemoryCandidate

`MemoryCandidate` 支持 `preference` 与 `episodic` 两种类型，主要字段包括：

- tenant/teacher owner；
- summary；
- preferenceKey / preferenceValue；
- source ref、source type、version、content hash、provenance；
- confidence；
- proposedBy（teacher 或 agent）；
- draft / confirmed / rejected / expired 生命周期；
- version 与 content hash。

### 6.2 TeacherPreference

Preference Candidate 由 owning teacher 确认后才产生 active `TeacherPreference`，包含：

- tenant/teacher owner；
- preferenceKey / preferenceValue；
- sourceCandidateRef / sourceCandidateHash；
- active / revoked；
- confirmedBy、confirmedAt、updatedAt；
- version、contentHash 与不可变 revision。

数据库中同一 tenant、teacher、preferenceKey 同时只能有一条 active preference。

### 6.3 当前产品写入路径

```mermaid
flowchart LR
    A["设置 / 助手偏好"] --> B["老师选择偏好类型"]
    B --> C["填写偏好值和原因"]
    C --> D["创建 preference Candidate"]
    D --> E["老师再次确认"]
    E --> F["创建 active TeacherPreference"]
    F --> G["修改或撤销，revision 保留"]
```

公开 `createCandidate` 路径固定：

- `type = preference`；
- `proposedBy = teacher`；
- source 为一次 `teacher_action`；
- provenance 为 `teacher_settings_explicit_input`；
- confidence 为 `1`；
- 未指定时 Candidate 90 天后过期。

领域虽定义 episodic 与 `proposedBy = agent`，当前产品入口并未真正使用它们。

### 6.4 当前读取路径

`listConfirmedPreferences()` 只按 tenant、teacher 和 active 状态读取。Repository 按更新时间排序，没有课程、班级、学科、任务、Skill、时间范围、相关度、使用频率或成功率筛选。

不同 Context Builder 再截取固定数量，例如课堂反思最多 4 条，材料生成与下一课调整最多 6 条，备课输入最多 12 条。

Lesson Analysis、Lesson Preparation、Material Generation、Classroom Reflection、Reflection Analysis 和 Next Lesson Adjustment 等 Skill 声明 `memoryPolicy: authorized_context_only`。备课 Prompt 明确规定偏好只影响表达与组织，不能改变 Evidence、课程事实或审批边界。

当前实现是一条安全的“把全部 active 偏好附加到上下文”路径，不是根据当前任务智能检索记忆。

## 7. 当前记忆能力真值表

| 能力 | 状态 | 结论 |
|---|---|---|
| Task/Run/Proposal 持久化 | 已实现 | 可恢复任务状态，但不是对话记忆 |
| 同一对话上一轮消息 | 未实现 | 没有 Conversation/Message/Turn 状态和历史重放 |
| 当前会话摘要、未完成意图、指代 | 未实现 | 每次只看本次请求和授权业务快照 |
| 手工声明长期偏好 | 已实现 | 设置页创建 Candidate 后再次确认 |
| 从自然语言自动提出偏好候选 | 未实现 | 公开写入固定为老师手工输入 |
| 从采用、拒绝、编辑差异学习 | 未实现 | 没有行为事件到 Candidate 的流水线 |
| Episodic memory | 类型占位 | 没有产品化写入和检索 |
| 重复证据与习惯巩固 | 未实现 | 没有频次、聚类、衰减、强化或晋升 |
| 冲突、例外、supersession | 很弱 | 只有同 key active 唯一约束 |
| 按课程/班级/任务检索 | 未实现 | 只有 tenant + teacher + active |
| 向量/语义检索 | 未实现 | 不应在定义语义和作用域前直接加向量库 |
| 应用记录与效果评估 | 未实现 | 无法证明哪条记忆减少了修改 |
| 工作流中展示本次记忆 | 很弱 | 设置页可查看，业务场景缺少应用解释 |
| “这次例外”覆盖层 | 未实现 | 本次指令与长期偏好没有正式优先级 |
| “记住/忘掉”统一交互 | 未实现 | 只有设置页添加、修改、撤销 |

## 8. 为什么上一句说完下一句就忘

这不是模型智力问题，而是正式请求结构没有承载多轮状态。

1. `CopilotPage.generate()` 每次构造新的 `CreateTeacherCopilotTaskRequest`，自然语言核心只有当前 `requestText`；
2. Contracts 没有 conversationRef、turnRef、parentTurnRef、rolling summary、未完成意图或历史消息；
3. Lesson Preparation 模型请求只创建 system message 和包含当前结构化输入的 user JSON；
4. 待审 Proposal 历史仅用于恢复审阅，不会进入下一次模型上下文；
5. ContextManifest 封存的是授权资源、Evidence、field mask、缺口和 hash，不保存对话语义。

所以老师先说“以后例子都用生活化场景”，下一次只说“再短一点”时，除非第一句话已被另行录入并确认成 TeacherPreference，否则系统没有正式路径知道“例子”指什么。

## 9. 为什么习惯不能形成

当前系统能保存老师主动声明的偏好，但不能从行为形成习惯：

- `PersonalizationCandidateSink.acceptObservationCandidate()` 只是未实现、未被使用的接口占位；
- teacher request、Proposal disposition、TeachingPlan edit diff、材料重生成、Reflection、Todo/Calendar 行为没有进入记忆流水线；
- 没有判断临时要求与稳定偏好的候选提炼器；
- 没有重复计数、相似聚类、冲突检测、置信度更新、衰减和巩固；
- `proposedBy = agent` 未在公开产品链路使用；
- Evaluation 主要检查来源、owner、生命周期和边界，不检查是否改善老师体验；
- 结果采用、拒绝或大幅修改不会反哺相关记忆。

老师必须自己识别习惯、抽象成 key/value、解释原因并确认。系统没有承担“观察—归纳—求证—巩固”的智能工作。

## 10. 为什么个性化仍弱

### 10.1 类型太窄

设置页只有教案详细程度、表达风格、案例偏好和建议篇幅四类，主要影响输出外观，覆盖不了：

- 教学结构与时间分配；
- 不同班级的节奏、活动和支架；
- 常用资源、工具和教室限制；
- 出题、批改、反馈和复盘习惯；
- 常用模板与工作流；
- 老师希望 Agent 如何协作。

### 10.2 没有 scope

当前 Preference 只有 tenant + teacher + key/value，无法区分全局、学科、年级、课程、班级、课时、任务、Skill 和本次临时要求。

### 10.3 没有真正检索

逻辑是读取全部 active preference 后截断，不根据 request、lesson、course、class、skill 和历史效果计算相关度。

### 10.4 没有冲突层级

本次明确指令、当前线程约定、班级/课程习惯和全局偏好没有正式优先级。“平时简洁，这次公开课详细”无法被可靠表达。

### 10.5 应用不可见

老师很难看到：“这次用了生活化案例偏好；一页教案偏好因公开课要求被临时覆盖。”即使偏好被注入，也缺少明确因果感。

## 11. 为什么老师会觉得不好用

以下是基于代码与交互的高可信推断，仍需真实访谈和埋点验证：

- 页面承诺像助理，实际行为像一次性生成器；
- 老师承担了记忆系统本应承担的整理和配置成本；
- 重复纠正没有形成习惯，快速消耗信任；
- 记忆应用缺少可观察性，老师不知道系统是否真的学会；
- 缺少知识层、文件理解和高质量 Provider 也会导致泛化建议，但这些不是短期记忆问题。

## 12. 目标体验

### 同一线程连续

保留最近消息、当前目标、已选方案、老师纠正、未完成问题和必要摘要。“再短一点”必须知道正在缩短什么。

### 明确要求立即记住

“记住：以后教案尽量控制在一页”应在当前回合确认理解，并形成可追溯、可撤销的持久记忆。确认方式应按风险和授权设计，而不是统一增加繁重表单。

### 临时例外不污染长期偏好

“这次公开课写详细一点”优先于全局偏好，但默认只在本任务或课时生效。

### 重复行为形成候选

老师连续多次把练习改成“先诊断、再分层”后，系统可以提出低摩擦的一键确认，不要求老师重新填写 key/value。

### 正确场景才检索

根据老师、学校、学科、年级、课程、班级、课时、任务、Skill、时间和当前指令，选择少量最相关、最可靠、未冲突的记忆。

### 可见、可纠正、可遗忘

老师可以执行：这次不用、只对本课有效、以后都这样、这条不准确、忘掉这条、查看为什么记住。

## 13. 目标设计必须回答的问题

1. 如何区分当前回合、工作记忆、对话摘要、情景记忆、语义偏好、程序性习惯、业务事实和学生 Evidence？
2. Conversation/Turn 应由 Runtime、Work 还是新子域拥有？
3. 自然语言、行为事件、编辑 diff、采用/拒绝如何进入 Candidate 提炼？
4. 什么可在当前线程自动生效，什么必须确认后长期生效？
5. 如何实现 global → subject/grade → course/class → lesson/task → current turn 的 scope 和覆盖？
6. 如何处理重复、冲突、例外、过时、撤销、过期和 supersession？
7. 何时使用结构化过滤、全文检索或 embedding？
8. 如何构建小而准确的 Memory Context Pack，并记录入选与排除原因？
9. 如何防止 prompt injection、恶意记忆、跨校泄漏和学生敏感信息沉淀？
10. 如何在教师控制与确认疲劳之间取得平衡？
11. 如何证明个性化降低修改、重复纠正和任务耗时？
12. 如何从现有表平滑迁移，并只追加 Migration？

## 14. 优先核验的代码

### 产品与架构

- `AGENTS.md`
- `README.md`
- `docs/capabilities.md`
- `docs/architecture/README.md`
- `docs/engineering/README.md`
- `docs/roadmap.md`

### 记忆领域

- `apps/api/src/modules/personalization-memory-analytics/domain/memory-candidate.ts`
- `apps/api/src/modules/personalization-memory-analytics/domain/memory-evaluation.ts`
- `apps/api/src/modules/personalization-memory-analytics/application/memory-candidate-service.ts`
- `apps/api/src/modules/personalization-memory-analytics/application/personalization-context-provider.ts`
- `apps/api/src/modules/personalization-memory-analytics/application/index.ts`
- `apps/api/src/modules/personalization-memory-analytics/infrastructure/postgres-memory-candidate-repository.ts`
- `apps/api/src/modules/personalization-memory-analytics/infrastructure/migrations/0002_phase7a_memory_persistence.sql`
- `apps/api/src/composition/postgres-personalization-service.ts`

### 多轮与 Context

- `packages/contracts/src/gate2.ts`
- `packages/contracts/src/personalization.ts`
- `apps/web/src/pages/CopilotPage.tsx`
- `apps/web/src/components/portal/TeacherPreferenceSettings.tsx`
- `apps/api/src/agent/skills/lesson-preparation/prompt.ts`
- `apps/api/src/agent/skills/lesson-preparation/personalized-context-builder.ts`
- `apps/api/src/composition/postgres-model-invocation-service.ts`
- `apps/api/src/composition/product-container.ts`

### 测试

- `tests/unit/memory-candidate.test.ts`
- `tests/postgres/phase7a-memory-persistence.test.ts`
- `tests/architecture/context-memory-boundaries.test.ts`
- `tests/unit/context-engineering.test.ts`
- `tests/playwright/teacher-personalization.spec.ts`

建议全仓搜索：

- `conversation`, `message`, `turn`, `previous_response_id`, `requestText`；
- `createCandidate`, `PersonalizationCandidateSink`, `acceptObservationCandidate`；
- `confirmedPreferences`, `memoryPolicy`, `listConfirmedPreferences`；
- Proposal disposition、TeachingPlan edit、材料 adopted/rejected 与记忆写入之间的连接。

## 15. 最低验收标准

### 行为

- 同一线程第二句话正确引用上一句话、上一轮选择和未完成意图；
- 刷新或重启后，授权范围内线程状态可恢复；
- “记住”跨 Session 生效，“忘掉”立即停止使用；
- “这次例外”不污染长期偏好；
- 重复纠正形成可解释 Candidate，单次偶然行为不直接永久化；
- 相关记忆在正确上下文出现，无关记忆不入模；
- 老师看得到本次应用、覆盖和排除的记忆；
- 输出采用率、修改距离和重复纠正率可关联到实际使用的记忆。

### 安全

- 跨 tenant/teacher 泄漏为零；
- 未确认的高风险长期记忆不进入正式 Context；
- 学生 Evidence 不变成无来源永久画像；
- Prompt injection 不能绕过 owner、purpose、scope 和 approval；
- 被撤销记忆从缓存、摘要和 Provider continuation 中失效；
- Secret、完整 Prompt/响应和隐藏推理不进入记忆库。

### 工程

- 保持七模块所有权，不跨 Schema 直写；
- 只追加新 Migration；
- 现有 Phase 7A 偏好可迁移、读取和撤销；
- Context Pack 有预算、排序、排除原因和 hash；
- 关键决策有 ADR、状态机、API/事件契约、失败恢复和测试计划；
- 添加向量基础设施前先证明必要性，并保留无向量的可交付基线。

## 16. 待产品负责人确认

- 首批试点老师的学段、学科、班级数量和典型工作流；
- 老师对自动记忆、提示确认和数据保留的接受度；
- 哪些低风险偏好允许一次授权后自动沉淀；
- 学校管理员是否能配置保留期限、禁用类型或治理策略；
- 隐私、合规、导出、去标识和遗忘要求；
- 延迟、模型成本、并发和后台 consolidation worker 约束；
- Provider 路线是否继续 Ark、增加 OpenAI 或保持完全 provider-neutral；
- “更懂老师”的首要指标：节省时间、减少修改、提高采用率、满意度或减少重复沟通。

这些问题未回答时，可以完成兼容当前架构的目标设计和分阶段计划，但必须把未知项标为假设，不能写成已确定事实。
