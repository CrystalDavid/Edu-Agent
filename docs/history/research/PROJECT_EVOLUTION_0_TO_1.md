# 教育智能体平台：从 0 到 1 的真实演进

> 状态：HISTORICAL / SUPERSEDED。本文保留 2026-07-30 调查及 Gate 2.5 补记；当前完整事实请使用 [VERSION_HISTORY](../../VERSION_HISTORY.md)、[CAPABILITIES](../../CAPABILITIES.md) 和 [ARCHITECTURE](../../ARCHITECTURE.md)。
> 调查基线：`feat/teacher-portal-ui-v1` / `43c8e03a8e0e7060989d886442de283ae6f43fc5`
> 调查日期：2026-07-30
> Gate 2.5 实施复核：2026-07-31；本文末次更新已将 Gate 2.4 合并基线和 Gate 2.5 实现事实合并进时间线。
> 本文是调查记录，不是新的产品承诺，也不修改既有架构决策。

## 1. 调查口径

本次结论按以下证据优先级形成：

1. 当前 Commit 中实际可执行的代码、Migration 和测试；
2. Git 提交内容、分支祖先关系和 Tag；
3. 与代码一致的 ADR、架构文档和阶段说明；
4. 已被后续提交改写或尚未实现的设计提议。

页面完成度、提交标题和文档中的“计划”均不能单独证明业务能力已经上线。

## 2. 仓库和分支拓扑

仓库从 Gate 1A 之后基本沿一条祖先链向前演进，而不是多个相互独立的产品实现：

```text
3a98ecf Gate 1A
  └─ 051f6f1 → 7f6bc5a → 181771a → 86d9f6f
       └─ 6d1335a main / gate-1b-verified
            └─ f49a234 … c515b1d Gate 2 Teacher Copilot
                 └─ 62d36f7 … f6bb200 UI redesign
                      └─ 2287568 … 42b4a4b UI redesign v2
                           └─ 19339e7 … 43c8e03 ordinary teacher portal UI v1
                                └─ 8ce69f7 … b353f35 Gate 2.4 correctness / recovery
                                     └─ 3ec7f10 main / gate-2-4-verified
                                          └─ 8124108 … Gate 2.5 recoverable lesson preparation
```

关键事实：

- `main` 已在 PR #2 通过 Merge Commit `3ec7f10` 合并 Gate 2.4；Gate 2.5 从该 main 创建，尚未合并。
- 关键 Merge Commit 是 Gate 1B 的 `6d1335a` 和 Gate 2.4 的 `3ec7f10`。
- annotated tags 为 `gate-1b-verified`（`6d1335a`）和 `gate-2-4-verified`（`3ec7f10`）。
- 仓库没有 Gate 1A Tag；Gate 1A 只能由根提交 `3a98ecf` 标识。
- 远程历史功能分支仍在，但它们是同一条演进链上的阶段锚点。

## 3. 0 到 1 时间线

| 阶段 | Commit / Tag / 分支 | 实际完成内容 | 当前有效性 |
|---|---|---|---|
| 项目初始化 / Gate 1A | `3a98ecf` | pnpm monorepo、七模块骨架、五类 ingress contract、Composition Root、内存 Repository、Mock ModelProvider、Fake Tool、walking-skeleton、七 Schema 初始 Migration、架构静态测试 | 架构骨架仍有效；HTTP walking-skeleton 仍使用内存状态 |
| Gate 1B 环境 | `051f6f1` | 可复现 Docker PostgreSQL、迁移器、Schema owner / app / runtime / worker 角色 | 仍有效，并被真实 PostgreSQL 测试覆盖 |
| Gate 1B Adapter | `7f6bc5a` | Governance、Work、Runtime、Capability、Artifact 的 PostgreSQL Repository 和 Outbox 基础 | 代码仍在；主要由测试直接调用，未统一接入当前 HTTP Composition Root |
| Gate 1B Education | `181771a` | CourseRun、Objective、Profile、Attempt、Evidence、Claim、TeachingPlanAlignment 等最小教育持久化 | 仍有效；Gate 2 读取其中一部分 |
| Gate 1B 验证 | `86d9f6f`、`6d1335a`、`gate-1b-verified` | 真实事务回滚、Outbox 原子性、幂等并发、角色隔离、消费者租约等测试；合并到 main | 已实现并验证，是当前远程 main 的上限 |
| Gate 2 准备 | `f49a234` | Web/API workspace 依赖和本地开发准备 | 仍有效 |
| Gate 2 后端 | `66a8d8b` | 基于真实 PG 的 Teacher Copilot 演示切片；固定教师、课程、证据、目标；Mock ModelProvider 产生两种策略；写 Task、Run、Manifest、Artifact、Audit、Outbox | 核心代码仍有效，但仅为合成数据和确定性 Mock |
| Gate 2 前端 | `ecf9582` | 教师工作台、策略比较、接受/修改/拒绝/稍后处理、TeachingPlan/Run 查看 | 旧 Gate 2 页面仍可访问；部分语义存在缺陷 |
| Gate 2 本地演示 | `3262e6d`、`60f7700`、`ff449dd`、`55c7b0f` | Docker/迁移/Seed/API/Web 一键演示、HTTP 和 Playwright 验收、共享 Route Contract、启动诊断 | 启动能力仍有效；会清开发库的测试链已被 Gate 2.4 独立临时 Volume 替换 |
| Gate 2 视觉优化 | `76de0e7`、`a59760b`、`c515b1d` | 浅蓝教师工作台、路由级拆包分析、视觉/启动回归 | 组件和测试仍在；主信息架构已被后续版本替代 |
| UI redesign v1 | `62d36f7`–`f6bb200` | 明亮蓝视觉、本地化、简化系统术语、稳定启动、截图验收 | 视觉基础部分延续；导航和工作模型被 v2 替代 |
| UI redesign v2 | `2287568`–`42b4a4b` | 从系统对象导航改为教师日常任务视角；课程、待办、Agent 工作区高保真 Mock；蓝白视觉 | 产品方向仍有参考价值；页面实现被普通教师门户 v1 再次重构 |
| 普通教师端 UI v1 | `19339e7`、`99b3a51`、`fd73627`、`43c8e03` / `feat/teacher-portal-ui-v1` | 概览、日程、教学、学生、文件、Agent、设置七页面框架；HarmonyOS Sans；Playwright 验收；UI 说明文档 | 当前目标版本；除旧 Gate 2 切片外，主体是高保真 Mock |
| Gate 2.4 正确性与可恢复性 | `8ce69f7`–`b353f35`、PR #2、`3ec7f10`、`gate-2-4-verified` | 调查记录、E2E/PG 数据库隔离、身份 fail closed、Product/Test Root、TeacherRequest、Proposal 恢复、TeachingPlan 独立审核/批准、应用 Worker、真实浏览器闭环 | 已合并 main、人工验收并以 annotated tag 固化 |
| Gate 2.5 最小可恢复备课闭环 | `8124108` 起 / `feat/gate-2-5-recoverable-lesson-prep` | CourseRun → CurriculumUnit → Lesson、Work-owned `lesson_preparation` Task、TaskWorkingSet、每 Run 授权与封存、Lesson/Task-scoped Proposal/Plan、多版本唯一约束、`ready_for_use` 与显式完成、概览/教学/Agent/Plan/Runs 联动 | 已实现并通过 PostgreSQL、HTTP、架构和 Playwright 验收；尚未创建 PR、合并或 Tag |

## 4. 每个阶段为何这样设计

### 4.1 Gate 1A：先证明边界，而不是先堆页面

Gate 1A 的中心任务是验证模块边界和统一运行模型：

- 七模块按状态所有权划分，而不是按页面划分；
- 外部请求先转换为统一 Ingress，再路由到 QueryRun 或 TaskRun；
- ModelProvider 和 ToolPort 把模型/工具供应商隔离在 Capability 模块；
- Artifact Revision、Audit、Outbox、Idempotency 从一开始就是平台语义；
- 内存 Adapter 让架构在没有完整基础设施时可快速验证。

这个选择避免了项目一开始退化为“一个 React 页面直接调用一个大模型接口”。代价是 Gate 1A 的可见产品价值很低，而且这些内存服务后来没有全部被 PostgreSQL Adapter 替换进 Composition Root。

### 4.2 Gate 1B：验证 PostgreSQL 事务与权限边界

Gate 1B 没有继续扩页面，而是集中证明：

- 每个 Schema 有明确 owner；
- app、runtime、worker 的数据库权限不同；
- 业务写入、Outbox、Audit/Result 可以同事务提交或共同回滚；
- 幂等预留可处理并发、重放和冲突；
- Outbox worker 可以使用租约、重试和消费者去重；
- Profile 版本与封存的 ResolvedLearningInteractionContract 分离；
- Suggestion 的接受记录与“已经实施”严格分离。

这部分是当前项目最扎实的工程资产，也是 `gate-1b-verified` 唯一 Tag 所标识的内容。

### 4.3 Gate 2：选一条“教师建议—人工审阅—Artifact”切片

Gate 2 沿用 Gate 1B 的 PG 语义，做出第一个可观察业务切片：

1. 读取固定 CourseRun、LearningObjective、Evidence、Profile、Goal 和现有 TeachingPlan；
2. 预留治理幂等键并记录 Authorization；
3. Mock ModelProvider 产生两种教学策略；
4. 写入 Task、TaskRun、Resolved Contract、ModelExecution、AgentRun、Run/Context Manifest；
5. 写 PedagogicalSuggestion Artifact Revision 和一个 TeachingPlan draft；
6. 教师接受或修改后再写 `in_review` TeachingPlan Revision；
7. 所有建议都保持 `implementationObserved=false`。

该切片选择正确地证明了“模型输出不是事实”和“教师接受不是实施完成”。在该阶段它仍是固定数据、固定输出、不可完整恢复的工程演示；Gate 2.4 后续补上了请求/Proposal 恢复和独立批准，但仍不是宽泛的日常教师工作流。

### 4.4 三轮 UI 重构：从系统对象转向教师心智模型

UI 的演进方向非常清楚：

- 最初 Gate 2：以 Goal、Evidence、Copilot、Plan、Runs 等系统对象为一级导航；
- redesign v1：降低术语密度，建立明亮蓝的教师工作台视觉；
- redesign v2：承认上一版仍像系统后台，转向课程、待办和日常任务；
- ordinary teacher portal v1：形成概览、日程、教学、学生、文件、Agent、设置的完整教师门户框架，并统一侧边栏、字体和组件。

普通教师端 UI v1 解决了产品信息架构、视觉一致性和演示可理解性；它没有把这些新页面接入真实业务 Repository。

## 5. ADR 与实现的对应关系

| ADR / 勘误主题 | 代码证据 | 判断 |
|---|---|---|
| ADR-001：首轮两个演示切片 | Teacher Copilot 合成切片存在；引导式个体学习不存在 | 部分实现 |
| ADR-002：模块化单体与 TS 技术栈 | pnpm、React/Vite、Express、Zod、PostgreSQL、Vitest、Playwright 均存在 | 已由代码证明；Drizzle 只做 Schema 声明，不是实际 Migration/Repository 主路径 |
| ADR-003：本地优先、未来 Netlify/CloudBase | 本地 Docker Demo 完整；无云部署配置 | 本地已证明，云端只存在于文档 |
| ADR-004：ModelProvider、未来 DeepSeek | Port 和 MockModelProvider 存在 | Port 已证明；真实 DeepSeek、出站治理和模型评测未开始 |
| ADR-005：七模块与状态所有权 | 目录、Schema、角色、架构测试存在 | 结构已证明；Personalization 无业务表，PG Adapter 未全部统一到 Port |
| ADR-006：统一 Ingress 与 Run | 五类 contract 和 walking-skeleton 存在 | 外部 DomainEvent 被拒绝；内部事件回放与完整 Observation 持久化未实现 |
| ADR-007：Demo 身份边界 | 固定 tenant/actor headers、strict policy、local/demo bypass 与注入 Audit | 缺失身份默认 401、production 禁止 bypass 已实现并验证；正式登录/access code/SSO 仍未实现 |
| ADR-008：Outbox、幂等、Audit | 真实 PostgreSQL 事务、并发测试和本地应用 Worker | Gate 2.4 相关 Work/Runtime/Capability/Artifact 事件已接入应用 Worker；租约、重试、幂等 effect 和恢复已验证，不声称 exactly-once |
| ADR-009：Profile 与封存交互合同 | Versioned Profile 和 immutable resolved contract 有表、服务和测试 | 已实现并验证 |
| ADR-010：参与拓扑、可见性、归因 | 仅有 `participationMode`、支持限制和答题边界字符串 | 主要只在文档 |
| ADR-011：证据与建议分离 | Evidence/Claim 与 SuggestionDisposition 分开，且实施状态不自动成立 | 已实现并验证；Opportunity 对象未实现 |
| ADR-012：LLM contract 与 eval gate | ModelProvider descriptor 和 Mock contract 存在 | 评测门禁、真实模型、失败策略未实现 |
| 勘误 E001：Profile / sealed contract | 表和不可变约束存在 | 已实现并验证 |
| 勘误 E002：Run 绑定 QueryRun / TaskRun | 字符串引用和检查约束存在 | 部分实现；没有完整引用完整性 |
| 勘误 E003：参与者可见性与归因 | 无完整实体/策略 | 只在文档 |
| 勘误 E004：Opportunity 独立于 Suggestion | 无 Opportunity 表/领域对象 | 只在文档 |
| 勘误 E005：外部 DomainEvent 禁止 | Contract 验证会拒绝外部 DomainEvent | 已实现；内部 Outbox 回放链未实现 |
| 勘误 E006：接受建议不等于实施 | Disposition 与 `implementationObserved=false` 的测试存在 | 已实现并验证 |

## 6. 被后续修改或推翻的决定

1. **导航模型发生两次改变。** Gate 2 的系统对象导航被 v2 的日常工作导航取代；ordinary portal v1 又把 Agent 恢复为一级入口，并从 68px rail 改为 260px 品牌侧栏。
2. **页面覆盖范围扩大，但真实后端范围没有同步扩大。** 七个教师门户页面出现后，真实 API 仍只有 Gate 2 Teacher Copilot、TeachingPlan、Run 和 Gate 1A walking-skeleton。
3. **“使用真实 PostgreSQL”只对部分业务面成立。** Gate 2.4 已让所有教师产品 API 只使用 PostgreSQL Product Container；内存 Gate 1A 被移到 Test Container。普通门户的日程、学生、文件等仍是前端 Mock。
4. **Drizzle 没有成为数据库唯一事实来源。** 实际迁移和 Repository 使用手写 SQL；Drizzle Schema 未覆盖全部约束、FK 和 Trigger。
5. **Demo 身份缺省放行已被 Gate 2.4 推翻。** 现在固定 Header 必须显式提供；仅 local/demo 的显式 bypass 可注入合成教师且写 Audit。access code/短期 token 仍未实现。
6. **含混的 TeachingPlan latest 读取已被 Gate 2.4 推翻。** 现在分别维护 current approved 与 current in-review 指针，并提供 drafts/history API；兼容字段仍存在，但产品读取不再把最大 revision 当正式计划。

## 7. 文档的当前有效性

### 仍可作为有效约束

- `教育智能体平台v0.3.2架构修订.md`
- `教育智能体平台v0.3.2勘误与ADR包.md`
- `教育智能体平台第一轮工程验证计划.md`
- `infra/postgres/MIGRATION_OWNERSHIP.md`
- `infra/docker/README.md`
- `docs/demo/LOCAL_DEMO.md`
- `docs/ui/TEACHER_PORTAL_UI_V1.md`

其中 ADR 和工程验证计划仍需以代码是否落地为准。

### 已被后续 UI 版本部分覆盖

- `docs/ui/GATE2_UI_REDESIGN.md`
- `docs/ui/GATE2_UI_REDESIGN_V2.md`

它们对设计演进有价值，但不再是当前页面结构的唯一规范。

### 明显过时或冲突

- 根 `README.md` 在调查基线中停留在 Gate 1B；Gate 2.4 与 Gate 2.5 已持续更新为当前真实范围。
- UI 文档中的部分 Mock 数量与当前数组不完全一致，例如待办数量。
- 静态权限测试仍读取旧的 `0001_runtime_role.sql` 角色名称；真实启动和角色测试使用后续 Migration。
- 调查基线没有产品功能矩阵；Gate 2.4 建立矩阵，Gate 2.5 已按逐交互真实状态更新。

## 8. 演进结论

项目已经从架构概念走到一个被真实 PostgreSQL、事务、角色、审计、Outbox、Artifact Revision 和应用 Worker 支撑的最小教师备课闭环，并拥有成熟度较高的普通教师端视觉原型。

Gate 2.4 完成了“请求与 Proposal 可恢复、审核与批准语义正确”的跨越；Gate 2.5 又把真实课程/课时、TaskWorkingSet、备课状态和页面联动接入同一条链路。下一阶段应在“文件与教学成果”和“可恢复真实模型 Provider”之间选择一个，不宜同时推进，更不应顺带产品化日程、作业、学生或云部署。
