# Edu-Agent 下一代 Agent 平台架构设计

> 状态：目标架构提案，尚未实施
> 时间跨度：面向未来 5 年维护
> 约束：继续采用模块化单体；不机械微服务化；不为设计图创建空 package；保留当前数据库历史和业务语义。

## 1. 产品与架构定位

Edu-Agent 同时是三类系统：

1. **教育业务平台**：管理学校、课程、课时、作业、学习 Evidence、TeachingPlan、课堂实施、文件和审批。
2. **Agent Runtime 平台**：负责上下文构建、模型与工具执行、Checkpoint、恢复、评测和 Skill 版本。
3. **人机协作系统**：教师提出目的、选择 Evidence、审阅 Proposal、确认事实和正式状态；Agent 负责生成、整理、建议和可恢复执行。

它不是普通 CRUD，也不是“一个 `agent.ts` 调模型”的应用。长期架构必须把业务真值、Agent 执行事实和教师确认动作分开。

核心不变量：

- 计划不等于实施；
- 建议不等于事实；
- accepted Proposal 不等于 approved TeachingPlan；
- 模型输出不直接写正式业务状态；
- Evidence 必须可追溯；
- 上下文授权按 Run 重新计算，不因历史读取成为永久授权；
- Provider 会话和 response ID 不成为业务主键；
- Runtime 可以失败和恢复，但不能破坏 Platform 已提交事实；
- 教师始终保留审批、发布、确认成绩和确认课堂事实的最终权力。

## 2. 当前七模块是否合理

当前代码有七个 API 模块和七个 PostgreSQL Schema：

1. `identity-governance-audit`
2. `education-domain`
3. `work-assistant-durable-execution`
4. `agent-runtime-context`
5. `capability-integration`
6. `artifact-collaboration`
7. `personalization-memory-analytics`

它们在历史演进中成功建立了 Schema owner、Migration、Repository 和授权边界，因此**不能立即推翻**。但它们不是七个成熟且均衡的 bounded context：有的过宽，有的混合 Platform 与 Agent 职责，有的只有骨架。

### 2.1 逐模块评估

| 当前模块 | 当前职责 | 诊断 | 推荐变化 |
|---|---|---|---|
| Identity / Governance / Audit | User、School、Membership、Session、Authorization、Audit、数据治理 | 身份访问与信任治理被放在一个模块；目前尚可维护，但概念过宽 | 代码层内部划分 `identity-access` 与 `trust-governance`，暂不移动 Schema |
| Education Domain | Course、Lesson、Assignment、Submission、GradeDecision、Evidence、Delivery、Observation 等 | 关系内聚但对象过多，31 张表形成“大教育域” | 保留一个业务域和 Schema，内部拆分 Curriculum、Assessment/Evidence、Teaching Practice 子域 |
| Work / Assistant / Durable Execution | 备课 Task、Todo、Calendar、工作投影、部分运行状态 | 人类工作管理与 Agent 持久执行混合 | 概念上拆为 Platform Work 与 Agent Orchestration；通过兼容 Port 渐进迁移 |
| Agent Runtime / Context | AgentRun、ContextManifest、WorkingSet、授权上下文 | 边界方向正确，但缺少显式 Step、Checkpoint、Tool Invocation、Evaluation | 发展为真正的 Agent Runtime Kernel |
| Capability / Integration | ModelProvider、模型执行、ObjectStore 和外部能力 | 模型/工具网关与文件存储集成混合 | 内部分为 Model/Tool Gateway 与 Storage Integration；不急于拆 Schema |
| Artifact / Collaboration | ArtifactRevision、FileAsset、TeachingPlan/Reflection 版本 | 文件与版本边界有价值；“Collaboration”尚未成为真实能力，且教学语义部分外溢 | 收敛为 Content/Artifact；教育服务拥有教学语义，通过版本 Port 创建内容修订 |
| Personalization / Memory / Analytics | Schema/Port 骨架 | 当前几乎没有正式表和成熟产品语义 | 作为 incubator，不声称已实现；按 Memory Candidate 和教师确认逐步建设 |

### 2.2 结论

七 Schema 作为数据库所有权和历史兼容边界，近期继续合理；七个长名称作为未来概念架构则需要调整。

推荐采用“双层表达”：

- **物理兼容层**：保留当前七模块目录和七 Schema，避免高风险迁移；
- **目标概念层**：明确 Platform、Agent 和 Integration 三层，在当前模块内部先形成子目录、Port 和 Facade；成熟后再评估是否迁移物理所有权。

这不是建立第八个业务模块，而是重新明确依赖方向。

## 3. 目标总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│                        apps/web                             │
│ Teacher UI · Admin UI · Human approval · Explainability    │
└─────────────────────────────┬───────────────────────────────┘
                              │ packages/contracts
┌─────────────────────────────▼───────────────────────────────┐
│                         Platform Layer                      │
│ Identity · School · Permission · Education · Work · Content│
│ Approval · Evidence · Audit · Business Application Services│
└───────────────┬──────────────────────────────┬──────────────┘
                │ authorized snapshots         │ proposals/drafts
┌───────────────▼──────────────────────────────▼──────────────┐
│                          Agent Layer                        │
│ Definitions · Skills · Run/Step · Context · Memory · Eval   │
│ Planner · Executor · Tool Router · Checkpoint · Recovery    │
└───────────────┬──────────────────────────────┬──────────────┘
                │ ports                         │ safe summaries
┌───────────────▼──────────────────────────────▼──────────────┐
│                     Integration / Infrastructure            │
│ Model Provider · Tools · ObjectStore · OIDC · PostgreSQL    │
│ Outbox Worker · Metrics · Secret/Config                     │
└─────────────────────────────────────────────────────────────┘
```

推荐的代码概念结构如下。它是目标方向，不要求立即移动现有模块：

```text
apps/api/src/
├── platform/
│   ├── identity-access/
│   ├── trust-governance/
│   ├── education/
│   │   ├── curriculum/
│   │   ├── assessment-evidence/
│   │   └── teaching-practice/
│   ├── work/
│   └── content/
├── agent/
│   ├── runtime/
│   ├── context/
│   ├── skills/
│   ├── memory/
│   ├── evaluation/
│   └── gateways/
├── infrastructure/
├── composition/
└── http/
```

在迁移期，目标子域可以先建立在当前模块目录内部。不能通过复制代码同时维护“旧模块”和“新平台”两份真值。

## 4. Platform Layer 与 Agent Layer 的边界

### 4.1 Platform Layer 拥有的真值

Platform 负责稳定、可审计、需要业务权限控制的正式对象：

- User、School、Workspace、Membership、Role、Permission；
- CourseRun、CurriculumUnit、Lesson、LearningObjective；
- Assignment、Submission、GradeDecision、Evidence；
- FileAsset、FileVersion、ArtifactRevision；
- TeachingPlan、Approval、LessonDelivery、Observation、Reflection；
- TeacherTodo、CalendarEvent、人工工作状态；
- AuthorizationDecision、Audit 和数据治理请求。

这些对象的状态只能由拥有模块的 Application Service 改变。

### 4.2 Agent Layer 拥有的执行事实

Agent 负责版本化、可恢复、可评测的执行对象：

- AgentDefinition / AgentVersion；
- SkillDefinition / SkillVersion；
- AgentRun / RunStep；
- Plan / PlannedStep；
- ContextPlan / ContextManifest；
- ToolInvocation / ModelExecution；
- Checkpoint / RecoveryAttempt；
- Evaluation / EvaluationResult；
- MemoryCandidate / RetrievalTrace；
- Proposal / Draft 的生成来源。

Agent 可以保存“执行发生了什么”，不能保存“课堂事实是什么”或“学生成绩是什么”的最终结论。

### 4.3 跨边界数据契约

Platform 向 Agent 提供的是授权后的、带版本的快照，不是数据库 Repository：

```ts
interface AuthorizedResourceSnapshot {
  tenantRef: string;
  actorRef: string;
  purpose: string;
  resourceRef: string;
  resourceType: string;
  resourceVersion: string;
  fields: Record<string, unknown>;
  provenanceRefs: string[];
  authorizationDecisionRef: string;
  retentionClass: string;
  hash: string;
}
```

Agent 返回的是 Proposal/Draft：

```ts
interface AgentProposalEnvelope {
  runRef: string;
  skillVersion: string;
  contextManifestRef: string;
  outputSchemaVersion: string;
  payload: unknown;
  evidenceRefs: string[];
  uncertainty: string[];
  evaluationSummary: Record<string, unknown>;
}
```

Platform Application Service 再执行 Zod、Evidence、Policy、Authorization 和业务状态校验，决定是否创建正式 Draft/Proposal。Provider response ID 只保存为外部关联信息。

### 4.4 依赖方向

- Platform 不依赖具体 Agent Skill 实现；只依赖 Agent Application Port。
- Agent 不依赖 Platform PostgreSQL Adapter；只依赖授权快照和命令 Port。
- Integration Adapter 不拥有业务状态。
- Composition Root 组装依赖，不承载跨域业务规则。
- Web 只依赖 Contracts，不 import Agent 或数据库类型。

## 5. Agent Runtime 设计

### 5.1 核心对象

#### Agent Definition

声明 Agent 的目的、允许的 Skill、工具策略、模型策略、预算和人工审批策略。Definition 版本不可变，Run 固定引用具体版本。

#### Run

一次用户目的的持久执行。Run 保存 tenant、actor、purpose、Skill 版本、状态、输入指纹、预算、当前 Step 和最终 Proposal Ref。

建议状态：

```text
queued
→ running
→ waiting_for_tool | waiting_for_human | validating
→ succeeded

终止：failed | timed_out | cancelled | policy_blocked | budget_exceeded
```

#### Step

Run 内的不可变执行单位，例如 retrieve、plan、invoke_model、invoke_tool、validate、request_human、publish_proposal。Step 有输入 hash、attempt、状态、开始/结束时间和安全摘要。

#### Context Builder

根据 Purpose 和 Skill 的 Context Policy 构造 `ContextPlan`，执行授权、检索、裁剪、压缩并封存 `ContextManifest`。

#### Planner

把目的转换为受约束的 Step Plan。简单 Skill 可以使用确定性模板，不应强制每次调用模型规划；复杂 Skill 才使用模型 Planner，并限制可选工具和最大步骤。

#### Executor

按 Step Plan 执行。所有外部副作用通过 Tool Router；每个副作用有幂等键和 Consumer Effect。

#### Tool Router

根据 Skill allowlist、ActingContext、Purpose、预算和风险等级路由工具。工具只暴露最小 DTO，不暴露 Repository 或数据库连接。

#### Skill Loader

加载指定、已发布的 SkillVersion，校验 manifest、prompt hash、output schema、tool allowlist 和 policy version。

#### Memory Retriever

按租户、教师、Task、Purpose、有效期和确认状态检索 Memory。返回带 provenance 和 token 预算的候选，不能绕过 Context Builder。

#### Checkpoint

在模型调用、工具副作用和等待人工动作前后保存恢复点。Checkpoint 保存状态引用和 hash，不默认复制完整 Prompt 或业务内容。

#### Recovery

从最后一个安全 Checkpoint 继续；过期租约可重新领取；已成功的副作用通过幂等键复用；不声称 exactly-once。

#### Evaluation

执行 Schema、Evidence、Policy、业务一致性、质量 rubric、延迟、token 和成本评估。失败可以进入一次受控修复或等待人工处理。

### 5.2 Run 与业务事务边界

```text
Platform transaction
  validate ActingContext
  create authorization decision
  create/resume Task + Run
  seal working set and context plan
  enqueue execution + outbox
commit

Worker outside transaction
  claim lease
  retrieve authorized snapshots
  invoke model/tool
  checkpoint
  validate

Platform transaction
  consume validated proposal exactly once by effect key
  create Proposal/Draft
  audit + outbox
commit
```

网络调用绝不发生在持有业务数据库事务期间。

### 5.3 速度优化

- 对互不依赖的授权检索并行执行；
- 按 `resourceRef + version + field mask + purpose` 缓存 Context Pack；
- 编译并缓存 Skill prompt template；
- 稳定 system/policy 前缀使用 Provider 支持的缓存能力，但不依赖其作为业务真值；
- 简单任务使用确定性 Planner，避免额外模型调用；
- 工具调用异步化，并只在结果就绪时恢复 Run；
- 将大文档提取、索引和摘要移出交互请求；
- Worker 队列按用户可见延迟、成本和资源锁分级。

### 5.4 稳定性优化

- Run、Step、Skill、输入资源全部固定版本；
- Worker 租约、过期恢复和心跳；
- 每个外部副作用有幂等键和 effect ledger；
- 指数退避、jitter、Retry-After 和总超时；
- Provider、Tool 和 Context Retrieval 使用独立熔断器；
- Checkpoint 后恢复，不重复已经成功且可证明的步骤；
- 输出分层校验，失败 fail closed；
- 对相同幂等键不同 payload 返回结构化冲突；
- 运行安全摘要与业务内容分离。

### 5.5 token 效率优化

- 先做 `ContextPlan`，再检索，不“先取全量再截断”；
- 每种资源声明 field mask；
- Evidence 按教师选择、相关 Objective、时效和 provenance 排序；
- 分层摘要：文件片段 → 资源摘要 → Task 摘要；
- 重试只发送 delta；修复只发送错误输出、Schema 错误和必要上下文；
- 历史对话压缩为结构化 Task Memory，不逐轮回放；
- 将工具 Schema、政策和固定术语作为稳定前缀；
- 为每个 Skill 设输入、输出和检索 token 预算；
- Manifest 记录被省略内容和未知项，模型不得把缺失当成事实。

### 5.6 人机协作优化

- `waiting_for_human` 是一级状态，不把人工审批伪装成异常；
- 教师看到“使用了哪些上下文、为什么使用、缺什么”；
- Proposal 与 current approved 以 diff 呈现；
- 正式命令前显示影响范围；
- 教师修改保留来源和 edit trail；
- 拒绝、延后、取消和重新打开是正式状态，不是前端 Toast；
- Agent 失败在业务页给出安全原因和恢复动作，不要求教师进入 Runs 排障。

## 6. Skill 系统

### 6.1 Skill 的定义

Skill 是可版本化、可评测、可发布的 Agent 能力，不等同于 Prompt 文件。一个 SkillVersion 至少包含：

- ID、版本、用途和状态；
- 输入 Contract；
- Context Policy 和允许的数据类别；
- prompt/template hash；
- output schema；
- tool allowlist；
- memory policy；
- budget policy；
- repair policy；
- human approval policy；
- evaluation rubric 和固定评测集版本；
- compatibility / deprecation 信息。

### 6.2 放在哪里

推荐混合存储：

```text
apps/api/src/agent/skills/
├── lesson-preparation/
├── assignment-analysis/
├── teaching-adjustment/
└── classroom-reflection/
```

代码仓库保存：

- 有类型的 handler；
- Context Builder policy；
- Tool adapter 调用；
- Zod output schema；
- 确定性 validation；
- prompt template 源文件；
- 固定评测用例。

数据库保存：

- 已发布 SkillVersion 元数据；
- immutable hashes；
- 发布审批和状态；
- EvaluationResult；
- rollout、deprecated 和 rollback 指针；
- Run 与具体版本的绑定。

不应把任意可执行 TypeScript 放进数据库。也不应现在就为每个 Skill 建 workspace package。只有当 Runtime、独立 Worker 或其他应用需要共享稳定 Skill protocol 时，才提取 `packages/agent-protocol` 或 `packages/skill-schema`。

### 6.3 生命周期

```text
create draft
→ version（内容冻结）
→ evaluate（固定集 + 安全 + 成本）
→ approve/publish
→ execute by exact version
→ monitor
→ deprecate or rollback
```

发布新版本不能改变旧 Run 的重放结果。失败回滚只改变新 Run 的默认版本，不重写历史。

### 6.4 首批 Skill

| Skill | 主要输入 | 输出 | 必须人工确认 |
|---|---|---|---|
| 备课 | Lesson、Objectives、approved plan、selected Evidence、教师要求 | TeachingPlan Proposal | 创建 in-review、批准 |
| 作业分析 | Assignment、confirmed GradeDecision、selected Evidence | 班级问题摘要和调整建议 | Evidence 选择、下一课 Task |
| 教学调整 | 当前/下一 Lesson、Reflection、selected Evidence | 下一课调整 Proposal | TeachingPlan 审阅和批准 |
| 课堂反思 | approved plan、confirmed Delivery、confirmed Observation、selected Evidence | Reflection Draft | 课堂事实、Reflection 确认、后续行动 |

## 7. Memory 与 Personalization

### 7.1 分层模型

| 类型 | 作用域 | 产生方式 | 是否需要确认 | 保留策略 |
|---|---|---|---|---|
| Working Memory | 单个 Run/Step | Runtime 自动 | 否，但只用于当前执行 | 默认短期；仅 Checkpoint 摘要持久化 |
| Task Memory | 单个 Task 跨 Run | 从已确认状态和历史执行结构化生成 | 自动生成可用，但必须带来源 | Task 结束后按策略过期或归档 |
| Episodic Memory | 一次已完成教学协作 | Agent 生成 MemoryCandidate | 教师确认后才跨 Task 复用 | 有有效期、撤销和 supersedes |
| Semantic Memory | 可验证知识、术语和课程事实 | 平台事实或受控导入 | 平台事实无需二次确认；模型推断需要 | 版本化、来源和知识有效期 |
| Teacher Profile | 身份、角色、课程权限 | Platform | 正式管理流程 | 按身份治理保留，不属于 Agent Memory |
| Preference | 展示、输出形式、教学偏好 | 教师显式设置；或推断候选 | 显式设置直接生效；推断需确认 | 可查看、编辑、撤销和导出 |

### 7.2 自动生成、确认和禁止存储

可以自动生成：

- 当前 Run 的工作摘要；
- Task 内已确认事实的结构化索引；
- 带来源、置信度和有效期的 MemoryCandidate；
- 可重新计算的检索和评测指标。

需要教师或管理员确认：

- 可跨 Task 复用的教师偏好；
- 对课堂策略有效性的概括；
- 从多次事件归纳的 Episodic Memory；
- 任何可能影响学生教学决策的推断。

禁止存储为 Memory：

- API Key、OIDC Token、Cookie、数据库连接串；
- 隐藏思维链；
- 无限制的完整 Prompt/Response；
- 未授权跨学校数据；
- 没有来源的学生能力标签；
- 真实学生敏感数据的无期限副本；
- 被撤销、删除或超出保留期的数据内容。

### 7.3 Memory 不是第二真值源

Memory 只保存索引、摘要、偏好或候选。User、Course、TeachingPlan、Evidence、GradeDecision、Delivery 等正式事实始终从 Platform 读取。源资源新版本出现、权限撤销或保留期结束时，Memory 必须失效或重新授权。

## 8. Context Engineering

### 8.1 完整流程

```text
Task
  ↓
Purpose + ActingContext
  ↓
Authorization
  ↓
Context Plan（资源类型、field mask、预算、时效）
  ↓
Context Retrieval
  ↓
Memory Retrieval
  ↓
Knowledge Retrieval
  ↓
Ranking / Deduplication / Conflict detection
  ↓
Compression
  ↓
Context Manifest（refs、versions、hashes、gaps）
  ↓
Model / Tool
```

### 8.2 `ContextPlan`

在实际检索前确定：

- Purpose；
- 必需、可选和禁止资源；
- 每种资源的字段白名单；
- tenant、actor、CourseRun 和 learner scope；
- 时间窗口；
- provenance 要求；
- token 分配；
- 冲突和缺失处理；
- retention / debug 策略。

这样可以避免读取全班提交、整份文件或全部历史对话后再截断。

### 8.3 `ContextManifest`

Manifest 不默认保存全文，而保存：

- 资源 Ref、版本、hash；
- 实际使用字段；
- 授权决策 Ref；
- 教师明确选择项；
- 来源和时效；
- 被排除项及原因；
- 冲突、未知和 Evidence 缺口；
- 压缩器版本和 token 统计；
- Skill、Prompt、Policy 版本。

Manifest 让运行可审计、可复现，也让模型无法把未提供内容误认为已知。

### 8.4 减少无效 token 的具体策略

1. 先按 Purpose 制定字段白名单，再查询。
2. 使用资源版本和 hash 去重，不重复发送同一 Evidence。
3. 只读取教师选择的 learner Evidence，不读取整个班级。
4. 长文件使用已授权片段和分层摘要，不发送完整二进制或全文。
5. 历史 Run 使用 Task Memory 摘要，不回放完整对话。
6. 将状态枚举、工具 Schema 和政策作为稳定模板。
7. 输出使用结构化 Schema，避免冗长自然语言协议。
8. 修复调用只提供失败输出、验证错误和最低必要 Context。
9. 每个 Context Source 记录 token 成本和命中价值，Evaluation 反向优化检索。
10. 超预算先降低可选上下文，不删除授权、政策和 Evidence provenance。

## 9. Evaluation 体系

Evaluation 不应只检查模型是否返回 JSON。推荐四层：

1. **Contract**：JSON、Zod、引用存在、版本一致。
2. **Policy**：权限、Evidence、教师审批、隐私和禁止动作。
3. **Task Quality**：目标对齐、可操作性、未知项、年龄适配和不虚构事实。
4. **Operations**：延迟、token、费用、重试、恢复率和人工修改量。

每个 SkillVersion 发布前必须通过固定合成评测集；线上只保存安全指标和抽样的经授权质量反馈。教师编辑距离、拒绝原因和最终采用情况可作为改进信号，但不能自动成为对教师或学生的能力评分。

## 10. packages 设计比较

### 10.1 方案 A：业务全部放在 `apps/api/modules`

优点：

- 单一部署、Codex 查找路径短；
- 无 package build 和版本协调成本；
- 数据库事务和模块内重构直接。

缺点：

- 当前已经出现 1,000–3,600 行的 Composition Service；
- 模块之间容易直接 import 具体 PostgreSQL Repository；
- Agent 与 Platform 的类型边界可能继续模糊；
- 未来独立 Worker 很难提取稳定协议。

### 10.2 方案 B：全部拆成 packages

优点：

- 看起来边界清晰；
- 可以独立构建和测试；
- 某些协议可被多个进程复用。

缺点：

- package 数量、tsconfig、build graph 和依赖发布显著增加；
- 业务事务被人为切碎；
- Codex 需要跨很多 manifest 和 re-export 找一个用例；
- 容易创建只有一个消费者的空抽象；
- 不会自动解决跨 Schema 直接写或过大服务。

### 10.3 方案 C：混合架构（推荐）

规则：

- 业务领域和 Application Service 继续留在模块化单体 `apps/api`；
- Web 留在 `apps/web`；
- 只有稳定的跨应用/跨进程协议进入 `packages`；
- 当前保留 `contracts`、`sample-data`、`test-fixtures`；
- 未来只有在 Agent Worker 成为真实独立进程时，才考虑 `agent-protocol`；
- 只有 Skill manifest/schema 有多个真实消费者时，才考虑 `skill-schema`；
- package 不能直接访问另一个模块的数据库。

### 10.4 评价

| 维度 | A 全在 API | B 全部 packages | C 混合架构 |
|---|---|---|---|
| Codex 维护 | 路径短但大文件重 | 查找和依赖成本高 | 边界明确且路径有限 |
| 类型边界 | 依赖纪律靠测试 | 物理边界多但可能虚假 | 只为真实共享协议建边界 |
| 测试 | 事务方便 | 单包测试多，集成复杂 | 模块测试 + 跨应用测试平衡 |
| 部署 | 最简单 | 构建图复杂 | 保持模块化单体部署 |
| Agent 扩展 | 容易与业务混合 | 可扩展但过早抽象 | 先内聚 Runtime，成熟再提协议 |
| 5 年成本 | 中等技术债 | 高组织成本 | 最可控 |

推荐方案 C。

## 11. 当前巨大 Composition Service 的处理原则

当前多个 `apps/api/src/composition` 文件超过 1,000 行，最大模型执行服务超过 3,600 行。问题不只是文件行数，而是 Composition Root 正在承担：

- HTTP 用例编排；
- 跨模块查询；
- 事务规则；
- Repository 具体实现访问；
- 状态机；
- Seed fallback；
- Audit/Outbox；
- 展示投影构造。

推荐逐用例拆分：

```text
module/
├── domain/
├── application/
│   ├── commands/
│   ├── queries/
│   ├── ports/
│   └── policies/
├── infrastructure/
└── facade.ts

composition/
└── create-product-app.ts  # 只组装依赖
```

拆分依据应是事务边界、状态所有者和变化原因，不是固定行数。迁移时保留现有公共 Contract，并用 facade 兼容，避免一次性重写。

## 12. 安全、数据与可观测性

### 12.1 安全

- 所有 Run 从服务端 Session 解析 ActingContext；
- Context Builder 执行资源级授权和字段级裁剪；
- Tool Router 使用 allowlist、risk level 和 Purpose；
- Secret 只在 Adapter 配置中，永不进入 Manifest、Audit 和 Prompt；
- 浏览器不接收 Provider SDK、API Key、内部错误体；
- production 缺少身份、数据库或 Provider 关键配置时 fail closed。

### 12.2 数据治理

- 每个 Agent Run 有 ModelDataManifest；
- Memory 有来源、用途、有效期、撤销和删除策略；
- 学生 Evidence 与教师 Preference 分开保留；
- Audit 保留安全事件和正式命令，不保存完整内容；
- 原始 Provider 响应默认不保存；本地调试内容必须 synthetic、ignored 和自动过期。

### 12.3 可观测性

- 技术指标：queue time、step latency、tool/model latency、retries、token、cost；
- 业务指标：Proposal 创建率、教师接受/修改/拒绝、从建议到正式动作的转化；
- 质量指标：Schema、Evidence、Policy、评测 rubric；
- 安全指标：拒绝授权、跨 tenant 尝试、敏感字段拦截；
- 所有指标使用 refs/hash，避免记录教师全文和学生敏感内容。

## 13. 推荐架构结论

七个现有数据库 Schema 继续作为兼容边界是合理的；把七个历史模块原样当作未来五年的最终架构则不合理。

推荐的新架构是：

- 继续使用模块化单体和单一 PostgreSQL；
- 以 Platform / Agent / Integration 三层重新明确依赖；
- Platform 内形成 Identity & Trust、Education 子域、Work、Content；
- Agent 内形成 Runtime、Context、Skills、Memory、Evaluation、Gateway；
- 先通过 Port、Facade、Application Service 和 architecture test 建立边界；
- 物理 Schema 移动只在有明确收益、前向 Migration 和完整回归时进行；
- 使用混合 package 策略，不把全部业务拆成 packages；
- Agent 永远通过授权快照读取业务事实，只返回 Proposal/Draft/MemoryCandidate。

这套设计保留了 Edu-Agent 已经验证的教育业务闭环，也为更快、更稳、更省 token、可恢复和可个性化的 Agent Runtime 留出明确演进路径。
