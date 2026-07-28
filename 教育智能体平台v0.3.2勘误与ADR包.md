# 教育智能体平台 v0.3.2 勘误与 ADR 包

> 文档状态：第一轮工程验证基线<br>
> 基线版本：`教育智能体平台v0.3.2架构修订.md`<br>
> 修订日期：2026-07-28<br>
> 适用范围：教师验收演示与第一轮工程 Spike，不代表学校生产部署方案

## 0. 总体裁决

v0.3.2 已经具备启动第一轮工程验证的成熟度，但还不应直接命名为 v0.4，也不应立即铺开完整平台建设。Claude 给出的顺序——“先勘误、冻结关键 ADR、搭骨架、做无 LLM 闭环，再接入真实模型”——成立。

本包不重写 v0.3.2，而是修正六个会影响代码边界、数据归属和验证结论的问题，并冻结第一轮实现所需的最小 ADR。其核心裁决如下：

1. 保留七模块模块化单体，不新增“教学 Runtime”、参与者服务、机会服务或建议服务。
2. 将可复用的教学互动规则与一次运行的不可变契约分开。
3. 所有 AI 执行必须归属于 `QueryRun` 或 `TaskRun`；`AgentRun` 只是短生命周期子执行记录。
4. `WorkflowInstance` 是长期执行状态的唯一真值源，`Task.waiting/running` 只是用户层投影。
5. 领域事件不得直接唤起 Agent，必须经过触发策略、授权、预算和幂等门。
6. 机会、证据、建议接受和实际教学行为不得混为同一事实。
7. 第一轮采用本机开发、合成数据、模块化单体和可替换模型适配器；不购买云服务器。

### 0.1 规范优先级

如本文与 v0.3.2 冲突，以本文勘误和状态为 `Accepted` 的 ADR 为准。状态为 `Proposed` 的 ADR，在用户确认前不得形成不可逆实现依赖。

优先级为：

```text
法律、学校治理要求和正式授权
→ Accepted ADR
→ 本文勘误
→ v0.3.2 正文
→ 实现细节和框架默认行为
```

---

# 1. v0.3.2 勘误

## E-001：拆分可复用互动配置与运行时契约

### 原问题

v0.3.2 的 `LearningInteractionContract` 同时被描述为“一次或一类互动的版本化领域契约”。这会让一个对象同时承担：

- 可复用的教学设计；
- 课程或学校发布配置；
- 当前请求的权限、参与者、帮助边界和模型预算快照；
- 运行时输入。

结果是发布状态、运行状态和情境解析互相污染，也无法回答“某次 AgentRun 到底执行了哪个不可变约束集合”。

### 修订

拆为两个对象：

#### `LearningInteractionProfile`

可复用、可发布、可版本化的教学互动配置，归属 Education Domain Kernel。

它可以声明：

- 适用的学习目标、活动类型和参与模式；
- 默认帮助边界、提示层级和答案释放规则；
- 允许的 AI 参与方式；
- 证据采集条件和禁止推断项；
- 可及性选项；
- 教师接管点；
- 允许 Runtime 调整的参数范围。

它不包含用户当前权限、一次运行的参与者名单、实时预算、临时数据范围或 Tool 授权。

生命周期：

```text
draft → reviewed → published → superseded | retired
```

状态所有者：Education Domain Kernel。<br>
写入者：获授权的课程设计者、教师或教研发布者；Agent 只能生成草稿。<br>
读取者：互动解析器、教师、Runtime、审计和评测。<br>

#### `ResolvedLearningInteractionContract`

在 `QueryRun` 或 `TaskRun` 创建时生成并封存的不可变运行输入，归属 Work Core 的运行清单。

它由以下信息解析得到：

- 已发布的 `LearningInteractionProfile`；
- 当前 `LearningObjective`、`TeachingPlan` 或活动；
- 本次参与者及参与拓扑；
- Governance 决策和 `AuthorizationDecision`；
- 当前用户明确指令；
- 可及性要求；
- 模型、Token、时间和 Tool 风险预算；
- 适用的 Policy 版本。

必须包含：

```yaml
contract_id: rlic_...
bound_run_ref: query_run:... | task_run:...
source_profile_ref: profile_id@version
policy_refs: [...]
participant_scope: teacher_only | individual | small_group | whole_class
participant_refs: [...]
visibility_rules: [...]
evidence_attribution_rules: [...]
allowed_support:
  max_hint_level: ...
  answer_release: ...
runtime_budget:
  model_class: ...
  max_tokens: ...
  deadline_ms: ...
authorization_decision_refs: [...]
resolution_reasons: [...]
content_hash: ...
sealed_at: ...
```

运行期间允许 Agent 在已声明范围内自适应；越过边界必须终止当前执行步骤并生成新的解析版本或请求人工决定，不能原地覆写已封存契约。

状态所有者：Work Core。<br>
写入者：互动解析器通过 Work Core 在 Run 创建事务中写入。<br>
读取者：Agent Runtime、Capability Gateway、Evidence 管道和审计。<br>
生命周期：`created → sealed → retained`，不设可变的 published 状态。

---

## E-002：统一 AI 执行归属，补充 QueryRun

### 原问题

v0.3.2 的部分示例把运行直接写成 `runtime_ref: task_run:...`，但纯读取型 AI 请求不应被强行伪装为 Command/Task。同时，若 `InteractionThread`、`TaskRun`、`AgentRun` 和 `WorkflowInstance` 都能表示“正在进行”，状态真值会分裂。

### 修订

Ingress 明确区分五类业务语义：

```text
Query | Command | DomainEvent | ObservationEvent | WorkflowSignal
```

- `Query`：请求读取、解释、比较或生成不改变正式业务状态的结果。
- `Command`：请求创建、修改、提交、发布或执行具有副作用的动作。
- `DomainEvent`：正式领域聚合已经提交的业务事实，只能由状态所有者在事务中产生。
- `ObservationEvent`：用户行为、系统遥测或外部观察，不是正式领域事实；只能进入证据候选、个性化候选或分析管道。
- `WorkflowSignal`：定向发送给一个已有 `WorkflowInstance` 的合法信号。

`Schedule` 是触发来源，不是业务语义。Scheduler 到期后只能产生：

- 发给既有 `WorkflowInstance` 的 `WorkflowSignal`；或
- 一个经过 TriggerPolicy、AutomationGrant、授权、预算和幂等检查的新 `Command`。

`ObservationEvent` 不得被改名为 DomainEvent，不得直接修改正式状态，也不得直接启动 Agent。

运行归属规则：

| 场景 | 必需对象 | 可选对象 | 不应创建 |
|---|---|---|---|
| 简单确定性读取 | Query receipt / audit | 无 | AgentRun、Task |
| 需要 LLM 的读取或解释 | QueryRun | AgentRun | Task、WorkflowInstance |
| 有限工作或形成 Proposal/Artifact | Task → TaskRun | AgentRun | 无 |
| 跨时间等待、重试、补偿 | Task + WorkflowInstance | 多个 TaskRun/AgentRun | 以 Task 状态代替 Workflow 状态 |
| 纯人工协作消息 | InteractionThread | ArtifactRef | AgentRun |

关键不变量：

1. 每个 `AgentRun` 必须且只能绑定一个 `QueryRun` 或 `TaskRun`。
2. `InteractionThread` 是交互容器，不拥有执行状态。
3. `WorkflowInstance` 是等待、重试、Signal、Timer、补偿和恢复的状态真值源。
4. `Task.waiting/running` 由当前 `TaskRun` 和 `WorkflowInstance` 投影得到，不得反向驱动工作流。
5. `AgentRun` 不拥有正式业务状态，也不能直接修改正式领域聚合。

状态所有者：

- `InteractionThread`、`QueryRun`、`Task`、`TaskRun`：Work Core；
- `AgentRun`：Agent Runtime；
- `WorkflowInstance`：Durable Execution 分区；
- 用户可见 Task 状态：Work Core 投影。

---

## E-003：补齐参与拓扑、可见性和证据归因

### 原问题

仅有 participants 列表无法表达教师 Copilot、个别辅导、小组协作和全班互动之间的差异。若缺少可见性与归因，系统可能把小组答案归因给个人、把教师私有草稿暴露给学生，或把 AI 贡献误作学生能力证据。

### 修订

不新增顶级“参与者服务”。在 `ResolvedLearningInteractionContract` 中增加：

```yaml
participation:
  mode: teacher_only | individual | small_group | whole_class
  actors:
    - actor_ref: ...
      role_in_interaction: facilitator | learner | observer | guardian | ai_assistant
  visibility:
    - resource_kind: message | artifact | evidence | suggestion
      audience: [...]
  contribution_attribution:
    require_actor: true
    allow_group_attribution: true
    infer_individual_from_group: false
  consent_or_notice_refs: [...]
```

Evidence 至少记录：

- `subject_ref`：证据描述谁；
- `actor_ref`：实际完成动作的人；
- `contributor_refs`：协作或 AI 贡献；
- `interaction_ref` 和 `run_ref`；
- `assistance_context`；
- 可见范围和用途限制。

状态所有者：互动参与规则由 Work Core 的已解析契约持有；正式 Evidence 归 Education Domain Kernel。<br>
写入者：参与名单由发起者或课程服务提供，Governance 过滤；Evidence 由确定性采集器或经确认的观察写入。<br>
读取者：Runtime 只读取最小参与切片；Estimate 和教师界面读取带归因的 Evidence。<br>
生命周期：随 Run 封存；Evidence 按其自身保留策略保存。

第一轮仅实现 `teacher_only` 和 `individual`，但 Schema 必须能表达其他模式。

---

## E-004：拆开 Opportunity 的计划、事件和投影

### 原问题

v0.3.2 把 `planned → offered → accessed/declined/inaccessible → completed` 压在一个 `LearningOpportunity` 状态机中。这里混合了：

- 教师或系统提供了什么；
- 学习者发生了什么；
- 系统对当前可及性的估计；
- 分析视图。

一个班级中的同一活动会对不同学生产生不同轨迹，单状态聚合会覆盖事实。

### 修订

#### `OpportunityOffer`

正式表示课程、教师或支持方案向某一范围提供的学习或展示机会。

状态：

```text
draft → scheduled → offered → closed | cancelled
```

#### `LearnerOpportunityEvent`

不可变事件，针对具体学习者记录：

```text
access_confirmed | accessed | engaged | submitted | completed
declined | barrier_reported | unavailable | not_observed
```

事件必须带来源、观察时间、actor、assistance 和证据引用。`not_observed` 不等于“未参与”。

#### `LearnerOpportunityStatus`

可重建投影，用于教师查看和公平性分析，不是能力事实。它可以显示：

- 是否被提供；
- 是否有可访问通道；
- 当前已知参与阶段；
- 障碍或未知项；
- 数据新鲜度。

状态所有者：`OpportunityOffer` 和事件归 Education Domain Kernel；状态投影由 Education Domain 的投影器重建。<br>
写入者：教师、课程交付服务、学习行为采集器；Agent 只能提交 `OperationalProposal`。<br>
读取者：教师、Evidence 解释器、公平性分析和 LearnerStateEstimator。<br>
生命周期：Offer 按活动关闭；事件不可变；投影随事件重建。

强约束：

1. 未被提供、不可访问或仅为 `not_observed` 时，不得产生负向能力 Claim。
2. Offer 被提供不等于学习者访问；访问不等于尝试；尝试不等于掌握。
3. 小组完成不得自动推断每个成员完成。

---

## E-005：领域事件不得直接启动 Agent

### 原问题

v0.3.2 架构图中的 `Education Domain → Agent Runtime` 直连，使 DomainEvent 看起来可以绕过授权、自治范围、预算、去重和用户控制直接启动 Agent。

### 修订

领域事件先完成所属聚合事务，再通过 Outbox 发布。任何后续智能执行必须走：

```text
Committed DomainEvent
→ Outbox / Event Bus
→ Trigger Router
→ TriggerPolicy + AutomationGrant + 去重 + 预算
→ ExecutionRequest(Query | Command)
→ Governance / Authorization
→ QueryRun | Task/TaskRun
→ Agent Runtime（如确有必要）
```

`Signal` 只能投递给已有 `WorkflowInstance`，不能作为隐式新 Agent 请求。

状态所有者：

- DomainEvent：产生它的领域模块；
- Outbox 投递状态：同一模块的基础设施表；
- TriggerRule：Work Core；
- AutomationGrant：Governance；
- Run：Work Core；
- AgentRun：Agent Runtime。

写入者：领域服务提交事件；Trigger Router 只能创建执行请求，不能修改原领域事实。<br>
读取者：投影器、审计、Trigger Router。<br>
生命周期：事件不可变；消费状态按 consumer 与 event id 幂等记录。

---

## E-006：接受建议不等于执行了教学动作

### 原问题

“Agent 生成 MoveSuggestion → 教师接受 → 写入 ObservedPedagogicalMove”的链条把界面动作误当成现实教学事实。教师可能接受后修改、延后或根本没有实施。

### 修订

改为：

```text
PedagogicalSuggestion（OperationalProposal）
→ SuggestionDisposition
   accepted | accepted_with_changes | rejected | deferred
→ 可选的计划或 Task
→ 独立观察/确认
→ ObservedPedagogicalMove
```

`SuggestionDisposition` 只记录教师对建议的处置，不证明建议已实施。`ObservedPedagogicalMove` 必须来自：

- 教师明确确认“已实施”；
- 经授权的课堂/教学系统事实；
- 可审查的结构化观察。

状态所有者：

- `PedagogicalSuggestion`：Artifact & Collaboration，类型为 `OperationalProposal`；
- `SuggestionDisposition`：Education Domain Kernel；
- 执行 Task：Work Core；
- `ObservedPedagogicalMove`：Education Domain Kernel。

写入者：Agent 只能写 Proposal；教师写处置；受信数据源或教师确认写实际动作。<br>
读取者：教师、教学改进 Case、评测和个性化分析。<br>
生命周期：Proposal 可修订和撤回；Disposition 追加记录；Observed Move 是带来源的正式观察。

第一轮工程验证只实现 Proposal 与 Disposition；不得声称已经验证真实教学实施效果。

---

# 2. ADR 状态总表

| ADR | 决策 | 状态 | 决策所有者 |
|---|---|---|---|
| ADR-001 | 第一轮演示范围与非目标 | Accepted | 产品/架构 |
| ADR-002 | 模块化单体、TypeScript 单仓与默认技术栈 | Accepted | 用户/架构 |
| ADR-003 | 本机开发 + Netlify + CloudBase Serverless | Accepted；资源创建仍逐次确认 | 用户/架构 |
| ADR-004 | 模型适配、密钥和数据外发边界 | Accepted；启用真实模型待确认 | 架构/用户 |
| ADR-005 | 七模块边界与状态所有权 | Accepted | 架构 |
| ADR-006 | Ingress、Run 与 Domain/Observation Event 路由 | Accepted | 架构 |
| ADR-007 | 演示身份、访问控制和租户边界 | Accepted | 用户/架构 |
| ADR-008 | Outbox、幂等和审计最小基线 | Accepted | 架构 |
| ADR-009 | LearningInteraction 双层模型 | Accepted | 架构/教育领域 |
| ADR-010 | 参与拓扑、可见性和证据归因 | Accepted | 架构/教育领域 |
| ADR-011 | Opportunity、Evidence 与 Suggestion 语义 | Accepted | 架构/教育领域 |
| ADR-012 | LLM 合约执行与评测门 | Accepted | 架构 |

---

# 3. ADR-001：第一轮演示范围与非目标

## Context

当前目标是向教师展示并验收一个可信的教育智能体方向，不是上线学校生产系统。若第一轮同时实现完整多租户、真实学生数据、长期 Workflow、多 Agent、心理支持和自动生成 Skill，工程结果无法区分“架构正确”与“演示堆叠”。

## Decision

第一轮只交付两个纵向切片：

1. **教师 Copilot**：教师查看某个班级的合成学习证据，AI 起草下一课调整建议和 TeachingPlan Diff，教师可接受、修改、拒绝，并查看依据。
2. **引导式个别学习**：一个合成学生围绕一个学习目标完成尝试；系统按已解析互动契约提供分级提示，记录 AssistanceContext、Attempt 和 Evidence，但不自动写入高影响结论。

第一轮展示五个页面：

- 教师工作台；
- Case/Goal/Task 详情；
- 证据与学习状态说明；
- TeachingPlan/内容 Artifact Diff；
- 审计与“系统为何这样做”面板。

仅使用合成数据。非目标：

- 真实未成年人数据；
- 学校正式登录和组织同步；
- 自动向家长或学生发送消息；
- 心理健康判断或干预；
- 长期自主 Agent 进程；
- 多 Agent 群体协作；
- 自动发布个人 Skill；
- 完整教务、考试或排课系统；
- 学习成效因果证明。

## Consequences

可以验证核心边界、可解释性和教师操作价值，但不能把演示结果宣称为学校生产可用性或教育效果证据。

## Validation

两个纵向切片必须在 Mock 模型下完全可运行，再用真实模型做对照；失败时正式状态保持一致。

---

# 4. ADR-002：模块化单体、TypeScript 单仓与默认技术栈

## Context

项目当前由个人电脑开发，以快速形成可审查、可部署、可测试的演示为目标。微服务会放大部署、追踪、权限和数据一致性成本。

## Decision

采用模块化单体和一个 Git 单仓：

```text
apps/
  web/                 React + Vite
  api/                 Node.js HTTP API，默认 Express
packages/
  contracts/           Zod DTO、事件和执行合约
  test-fixtures/       合成教育数据与固定评测集
docs/
  adr/
  architecture/
infra/
  netlify/
  cloudbase/
```

默认栈：

- TypeScript；
- pnpm workspace；
- React + Vite；
- Ant Design 作为演示 UI 基础；
- Node.js + Express 薄 API 层；
- Zod 作为边界 Schema；
- PostgreSQL；
- Drizzle ORM 与 SQL migration；
- Vitest；
- Playwright；
- ESLint + Prettier。

框架只能存在于模块适配层，领域对象不得依赖 Express、Netlify、CloudBase 或具体模型 SDK。

## Rejected

- 第一轮微服务：拒绝，无法带来与复杂度相称的验证价值。
- 前后端两种主语言：拒绝，增加 DTO 漂移和个人开发成本。
- 用向量数据库或图数据库作为起点：拒绝，第一轮没有证明必要性。

## Consequences

部署单元少、类型共享和本地调试简单；代价是模块边界必须靠依赖规则、测试和代码评审保护。

## Status

`Accepted`。2026-07-28 用户确认采用 TypeScript、pnpm、React、Vite、Node、Express、PostgreSQL 和 Drizzle；开发期 GitHub 仓库保持私有。

---

# 5. ADR-003：本机开发、Netlify 前端与 CloudBase Serverless

## Context

用户没有自有服务器，当前只需教师演示。购买并维护云服务器会引入运维、安全更新和持续费用，却不验证教育架构。

## Decision

分三层环境：

```text
Local
  Web + API + PostgreSQL/测试数据库 + MockModel

Preview
  GitHub PR → Netlify Deploy Preview
  默认连接 Mock API 或受限演示 API

Demo
  Netlify 静态前端
  → HTTPS
  → Tencent CloudBase HTTP 云函数 API
  → CloudBase PostgreSQL
  → 对象存储（仅在确有附件时）
  → DeepSeek API（仅后端调用）
```

第一轮不创建 CVM 云服务器，不部署 Kubernetes，不引入独立消息中间件。Outbox、任务队列和 Trigger consumer 先使用 PostgreSQL 表与单进程 Worker 实现逻辑语义。

现有 Netlify 站点不得直接覆盖。2026-07-28 的只读检查显示，该 URL 当前运行 `PPT Agent v2026.6.1`，不是空白站点。先从新仓库生成 Deploy Preview 或独立临时站点，验收构建、路由、API 与回滚；只有用户明确同意替换现有 PPT Agent 后，才将该站点关联到新仓库。

Cloud Function 的超时、并发和配额是部署环境参数，不写死为“60 秒”。HTTP 请求只等待一个可配置的短预算；超过预算的 AgentRun 必须返回运行引用并由前端轮询，不得依赖某一产品当前的最大执行时限。长期等待仍归 `WorkflowInstance`，不能靠一个持续 HTTP 请求实现。

## Rejected

- 立即购买云服务器：拒绝。
- 浏览器直接调用 DeepSeek：拒绝，会泄露密钥并绕过治理。
- 只部署前端、把业务状态放浏览器：拒绝，无法验证状态所有权和审计。

## Consequences

该方案适合当前演示并保留迁移空间，但 CloudBase 的地域、套餐、PostgreSQL 模式、函数配额和跨域能力必须在创建环境前实测。

## Status

`Accepted`。第一轮采用本机开发，远程演示允许采用 CloudBase Serverless，不购买 CVM。此 ADR 接受的是部署拓扑，不构成创建资源或接受费用的授权；任何可能计费的资源仍须逐次确认。现有 PPT Agent 站点不修改，先使用独立 Deploy Preview 或临时站点。

## Evidence

- [CloudBase Node.js HTTP 云函数快速开始](https://docs.cloudbase.net/en/cloud-function/quickstart/httpfunc/nodejs)
- [CloudBase 环境说明](https://docs.cloudbase.net/en/quick-start/env-overview)
- [Netlify Git 工作流](https://docs.netlify.com/build/git-workflows/overview/)
- [Netlify Deploy Previews](https://docs.netlify.com/deploy/deploy-types/deploy-previews/)

---

# 6. ADR-004：模型适配、密钥和数据外发边界

## Context

真实模型能验证提示适配和结果波动，但不应成为骨架运行的前提。模型密钥属于高敏感凭证；一旦出现在对话、代码、前端或 Git 历史中，就不能再视为安全。

## Decision

1. 定义 `ModelProvider` 接口，至少有 `MockModelProvider` 和可插拔的 `DeepSeekProvider`。
2. CI、单元测试和默认本地演示使用 Mock；真实模型通过后端环境变量显式启用。
3. 架构不冻结任何供应商模型 ID。默认模型和复核模型分别由 `DEEPSEEK_DEFAULT_MODEL` 与 `DEEPSEEK_REVIEW_MODEL` 配置，并在 Gate 2 真实接入时依据当时可用模型验证。
4. `ModelProfile` 只声明能力、风险、预算和数据处理要求，不把供应商型号变成领域枚举。
5. 密钥只进入本地未跟踪的 `.env.local` 或 CloudBase Secret/环境变量；不得进入前端 bundle、日志、截图、测试 fixture、Markdown 或 Git。
6. 所有送模数据经过字段级最小化和敏感信息过滤。第一轮只允许合成数据。
7. Provider 记录模型 id、请求目的、PromptBundle 版本、Token、延迟和错误类别，但不默认记录完整敏感 Prompt。
8. 成本预算、并发和单次 Token 上限由 `GovernanceProfile` 与 Run budget 决定。

用户在对话中提供过的 API 密钥必须在接入前撤销并重新生成；旧值不得被使用或保存。

## Consequences

模型故障不会阻断确定性业务闭环，且可以比较 Mock 与接入时实际可用模型的行为；代价是需要维护稳定的 Provider 合约、配置校验和固定评测集。

## Operational note

供应商模型目录变化很快。真实接入时必须查询官方模型目录、验证账号可用性和结构化输出表现，再填写环境变量；ADR 不因供应商改名而修改。

---

# 7. ADR-005：七模块边界与状态所有权

## Decision

仍采用一个部署单元内的七个业务模块：

| # | 模块 | 拥有的状态 | 允许写入者 | 主要读取者 | 明确不拥有 |
|---:|---|---|---|---|---|
| 1 | Identity, Governance & Audit | Identity、Role/Relationship、Policy binding、AutomationGrant、AuthorizationDecision、AuditRecord | 身份/治理服务；管理员；授权流程 | 所有模块按接口读取决策 | 教学事实、Task、Agent 状态 |
| 2 | Work, Assistant & Durable Execution | Case、Goal、Task、TaskRun、QueryRun、InteractionThread、PersonalAssistantShell、WorkflowInstance、TriggerRule | Work 服务、用户命令、Workflow 引擎 | UI、Runtime、个性化 | 正式 Evidence、Agent 私有状态 |
| 3 | Agent Runtime & Context | AgentRun、PlanStep、ContextManifest、运行预算消耗 | Runtime | Work Core、审计 | Task 真值、权限、正式领域状态 |
| 4 | Capability & Integration | CapabilityDescriptor、ExecutionContract、GovernanceProfile 引用、Tool adapter、Skill/Procedure 包 | 平台发布者；用户可提交个人候选 | Runtime、Workflow | 授权决定、Timer、长期状态 |
| 5 | Artifact & Collaboration | ContentArtifact、OperationalProposal、ConfigurationAsset、EvidenceAsset 及版本/Diff/审批 | 用户、受控 Tool、Agent 草稿 | Work、Education、UI | 正式 Evidence 语义、业务状态 |
| 6 | Education Domain Kernel | 课程、目标、互动 Profile、Attempt、EvidenceObservation、EvidenceClaim、Estimate、Opportunity、教学决定 | 领域服务；教师确认；受信采集器 | Runtime、教师、分析 | AgentRun、个性化 Candidate |
| 7 | Personalization, Memory & Learning Analytics | Preference、MemoryEntry、MemoryView 定义、Candidate、Personal Skill、效果评估投影 | 用户；受控学习管道 | Shell、Context、用户设置 | 正式教育事实、权限、C 级决策 |

模块 2 内部可以分包但不独立部署：

```text
Work Core
Assistant Continuity
Durable Execution
```

数据库基线是一个 PostgreSQL 实例和七个模块 Schema：

```text
governance.*
work.*
runtime.*
capability.*
artifact.*
education.*
personalization.*
```

每个模块独立拥有自己的 migration；所有跨模块写入必须通过目标模块应用服务。禁止共享 ORM Repository 后直接写其他 Schema，禁止 Runtime 数据库角色写入 `education`、`governance` 和 `personalization` 的正式表。

若 CloudBase Spike 证明目标环境不能满足预期的 Schema 管理或角色授权，再通过新 ADR 降级为“单一 Schema + 强制模块前缀 + Repository 边界测试”。该 fallback 不是当前并行基线。

## Invariants

- Runtime 不直接写 Education Domain。
- Personalization 不覆盖 Canonical Source。
- Artifact 发布不等于领域事实生效。
- Space-local 授权只覆盖 Space-local Artifact 和协作动作，不传递领域数据权限。
- `TaskWorkingSet` 只保存 `ResourceRef`、purpose、requested field mask 和 `AuthorizationDecision` 引用，不保存长期有效的 access 结论。

---

# 8. ADR-006：Ingress、Run 与 Domain/Observation Event 路由

## Decision

统一入口为判别联合：

```ts
type IngressEnvelope =
  | QueryEnvelope
  | CommandEnvelope
  | DomainEventEnvelope
  | ObservationEventEnvelope
  | WorkflowSignalEnvelope;
```

路由规则：

```text
Query
├─ 确定性读取 → Application Service → Response
└─ 需语义解释 → QueryRun → 可选 AgentRun

Command
├─ 确定性命令 → Application Service → DomainEvent/Artifact
└─ 需开放规划 → Task → TaskRun → 可选 AgentRun

DomainEvent
→ 只能由所属模块聚合事务提交并进入 Outbox
→ 可选 Trigger Router
→ 经授权的新 Command

ObservationEvent
→ Evidence/Personalization candidate pipeline
→ 不直接写正式事实、不直接启动 Agent

WorkflowSignal
→ 指定 WorkflowInstance

Scheduler 到期
├─ 已有 WorkflowInstance → WorkflowSignal
└─ 新工作 → Trigger Router → 授权、Grant、预算、幂等 → Command
```

只有满足以下条件才使用 LLM：

- 目标或材料需要语义理解；
- 固定规则无法可靠完成；
- 输出是草稿、解释、排序或规划，而非未经确认的正式事实。

只有出现跨时间等待、Signal、Timer、持久重试或补偿时才创建 `WorkflowInstance`。多 Agent 不是路由类型，只是一个 TaskRun 内经预算批准的执行策略；第一轮不实现。

---

# 9. ADR-007：演示身份、访问控制和租户边界

## Context

演示无需接入学校 SSO，但公开 Netlify URL 不能等同于授权。即使使用合成数据，也要验证边界，否则后续会把演示捷径固化为架构。

## Decision

- Seed 一个演示学校、一个教师身份和若干合成学生。
- 使用后端校验的演示访问码换取短期签名 token；访问码不编译进前端。
- 所有 API 校验 `tenant_ref`、actor、purpose 和对象级授权。
- Token 短期有效，可由后端整体撤销；演示 API 限流并设置每日模型预算。
- 前端仅显示授权后的字段，后端仍执行字段级过滤。
- Preview 和 Demo 环境使用不同访问码与数据库。
- 不承诺该方案满足学校生产身份认证；生产前另做 SSO、账号恢复、监护关系和生命周期 ADR。

## Status

`Accepted`。采用后端演示访问码和短期 Token；第一轮邀请 1～3 位指定教师，全部使用合成数据。具体访问码属于运行 Secret，不进入文档或仓库。

---

# 10. ADR-008：Outbox、幂等和审计最小基线

## Decision

1. 聚合更新和 Outbox 事件在同一数据库事务提交。
2. Consumer 以 `(consumer_name, event_id)` 记录处理结果；系统承诺至少一次投递和幂等效果，不声称 exactly-once。
3. Command、Tool 调用、Artifact 发布和触发执行必须携带幂等键。
4. 模型调用通常不可真正回滚；超时后的重试必须通过 Provider 请求 id、Run 状态和预算策略防止无限重复。
5. AuditRecord 至少记录 actor、purpose、resource、decision、run、model/tool、版本、时间和结果，不把敏感正文复制进审计表。
6. 所有正式写入都能追溯到人类命令、受信系统事件或明确授权的 Workflow step。

## Validation

故障注入必须覆盖：

- Outbox 发布前后崩溃；
- 相同 DomainEvent 重放；
- 相同 Command 重试；
- Tool 超时但下游可能已成功；
- 模型超时；
- Workflow 恢复；
- Artifact 并发版本冲突。

---

# 11. ADR-009：LearningInteraction 双层模型

## Decision

采用 E-001 的双层结构：

```text
LearningInteractionProfile（可复用、可发布）
          ↓ resolve
ResolvedLearningInteractionContract（一次 Run，不可变）
          ↓ execute
QueryRun / TaskRun → AgentRun
```

状态归属、写入者和生命周期以 E-001 为准。

Runtime 只能：

- 在契约范围内选择提示、问题、工具和表达；
- 请求更多上下文；
- 产生草稿、Proposal 和 Evidence 候选；
- 报告无法满足契约。

Runtime 不能：

- 修改 Profile；
- 扩大参与者或数据范围；
- 提高自治等级；
- 放宽答案释放或安全边界；
- 把自己的输出直接写成 Claim、Estimate 或 Observation。

---

# 12. ADR-010：参与拓扑、可见性和证据归因

## Decision

采用 E-003 的 Participation 结构。第一轮实现矩阵：

| 模式 | 第一轮 | 可见性 | Evidence 归因 |
|---|---|---|---|
| teacher_only | 实现 | 仅教师；可显式发布 Artifact | AI 只作为贡献者，不形成学生 Evidence |
| individual | 实现 | 学生本人与获授权教师 | 区分 learner、AI assistance 和 teacher intervention |
| small_group | 只保留 Schema | 未实现时拒绝运行 | 不允许从组自动推个人 |
| whole_class | 只保留 Schema | 未实现时拒绝运行 | 不允许从全班投影推个人 |

未实现的模式必须 fail closed，而不是退化为 individual。

---

# 13. ADR-011：Opportunity、Evidence 与 Suggestion 语义

## Decision

采用 E-004 与 E-006。建立以下不可互换关系：

```text
OpportunityOffer
  └─ LearnerOpportunityEvent*
       └─ LearnerOpportunityStatus（投影）

Attempt
  └─ EvidenceObservation
       └─ EvidenceClaim
            └─ LearnerStateEstimate

LearningEvidenceView（只读投影）
  └─ 汇总 EvidenceObservation、EvidenceClaim、来源、时效与不确定性

PedagogicalSuggestion
  └─ SuggestionDisposition
       └─ 可选 Task / TeachingPlan change
            └─ 独立 ObservedPedagogicalMove
```

`LearningEvidenceView` 只用于 API、教师阅读和 Runtime Context，不是可写聚合，也不生成新的权威事实。正式估计必须能回溯：

- 学习目标和概念；
- Opportunity 是否存在且可及；
- Attempt；
- AssistanceContext；
- Observation；
- EvidenceRule 与版本；
- 时间和不确定性。

第一轮只允许确定性规则从结构化 Attempt 生成 Evidence 候选；任何 LLM 解释必须作为带置信度的建议，由教师确认后才能影响正式教学决定。

---

# 14. ADR-012：LLM 合约执行与评测门

## Context

仅有 Schema 不足以约束模型。没有运行时强制、固定评测和版本绑定，`ResolvedLearningInteractionContract` 会沦为 Prompt 文档。

## Decision

每次 AgentRun 必须绑定：

- `ResolvedLearningInteractionContract`；
- `PromptBundle@version`；
- `ModelProvider/model_id`；
- `CapabilityDescriptor@version`；
- Tool `ExecutionContract@version`；
- `ContextManifest`；
- 输出 Schema；
- Governance 决策和预算；
- Eval policy 版本。

执行顺序：

```text
precondition check
→ context field filtering
→ prompt assembly
→ model/tool call
→ schema validation
→ evidence/source-reference validation
→ policy post-check
→ produce draft/proposal
→ audit
```

若验证失败：

- 不写正式状态；
- 在预算内最多进行受控修复；
- 仍失败则返回可解释错误和人工接管点；
- 不静默降级为无约束输出。

固定评测集至少覆盖：

- 不越过提示上限；
- 不泄露其他学生信息；
- 不把 AI 贡献当作学生独立表现；
- 不把缺少 Opportunity 当成能力不足；
- 每个教学建议能引用允许的 Evidence；
- Prompt 注入材料不能扩大 Tool 权限；
- Mock 与真实模型均满足输出合约。

状态所有者：

- PromptBundle、Capability 合约：Capability & Integration；
- ContextManifest、AgentRun：Agent Runtime；
- Eval fixtures/results：Personalization, Memory & Learning Analytics；
- 权限和审计：Identity, Governance & Audit。

---

# 15. 本包冻结的关键不变量

1. 平台不是以 Task 为唯一中心；长期连续性由 Case、Goal 及其与 Task/TaskRun 的显式关系表达。Goal 不强制属于 Case，Task 可以独立存在；`Case → Goal → Task → TaskRun` 只是常见主路径，不是全局强制树。
2. Personal Assistant Shell 持久存在，但不持有权限、不执行 Tool、不拥有正式业务状态。
3. AI 执行必须绑定 QueryRun 或 TaskRun。
4. WorkflowInstance 是长期执行状态真值源。
5. Runtime 不直接写正式 Education State。
6. Agent 输出默认是草稿、Proposal 或候选，不是事实。
7. Space 只能授权 Space-local Artifact 和协作动作，不传递领域数据权限。
8. TaskWorkingSet 不缓存长期 access 结论。
9. Profile 可重建；MemoryEntry 可持久、可审查、可编辑、可版本化；Memory View 是按任务生成的最小视图。
10. Skill/Procedure 不拥有权限、Timer、Retry、Signal、Compensation 或长期运行状态。
11. Opportunity、Attempt、EvidenceObservation、EvidenceClaim 和 LearnerStateEstimate 不得互相代替；LearningEvidenceView 只能是读取投影。
12. 建议被接受不证明现实行为已经发生。
13. DomainEvent 启动智能执行前必须经过触发策略、授权、Grant、预算和幂等。
14. 低风险个性化可以轻量生效；B/C 级不能绕过其风险门。
15. 第一轮所有学生、课程、家庭和学校数据均为合成数据。
16. 任何 API 密钥都不得出现在前端、仓库、文档、日志或测试数据中。

---

# 16. 已确认决策与仍需逐次授权的事项

2026-07-28 已确认：

- ADR-002、ADR-003、ADR-007 转为 Accepted；
- 开发期仓库私有；
- 八年级数学“一次函数斜率与图像关系”；
- 全部使用合成数据；
- 先创建独立 Preview/临时站点，不修改现有 PPT Agent；
- 远程演示允许 CloudBase Serverless，不购买 CVM；
- 真实模型默认关闭；
- 后端演示访问码和短期 Token；
- 第一轮邀请 1～3 位教师；
- 目标验收日期为 2026-09-20。

仍需逐次授权：

1. 创建任何可能计费的腾讯云资源；
2. 开启真实模型及其预算；
3. 创建或修改 Netlify 站点；
4. 首次 push 远程仓库；
5. 未来是否替换现有 PPT Agent 站点。
