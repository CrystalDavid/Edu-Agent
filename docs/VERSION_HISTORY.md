# Edu-Agent 完整版本与功能历史

> 状态：CURRENT
> 核实基线：`main` @ `bbba3428602bb148a3d73a201ad97fcb29181c1b`，annotated tag `gate-2-10a-verified`。
> 核实日期：2026-08-02（Asia/Shanghai）。

本文只记录 Git、GitHub PR、Migration、代码、测试和仓库文档能够证明的事实。Git 不保存“某个提交创建时所在分支”时，分支信息标为“未核实”，不会用旧对话补全。

## 1. 核实口径与当前仓库事实

- `main` 上共有 93 个可达提交；`git rev-list --all` 也是 93，说明当前远程历史分支没有游离于 `main` 的产品提交。
- GitHub 有 10 个 PR，均已合并；verified tag 共 10 个，均为 annotated tag。
- Gate 2.10A 固化时，远程有 `main` 和 14 条历史功能分支；本次文档分支不计入该数字。
- API 注册 43 个不可改写的前向 Migration，分属七个 PostgreSQL Schema。
- 仓库包含 377 个跟踪文件、21 个既有 `docs/` 文件和 45 个 `.test` / `.spec` 测试源文件；这些数字是 Gate 2.10A 固化点的快照，不是长期不变量。
- Gate 编号不是严格时间序号。真实顺序是 Gate 2.5 → Gate 2.6A → Gate 2.5B → Gate 2.5C → Gate 2.7。
- 仓库中没有 Gate 2.6B 的分支、提交、PR、verified tag 或产品文档。Gate 2.6B 只曾作为“多模态文件理解”候选方向出现，**没有实施**。
- Gate 2、两轮 UI redesign 和 Teacher Portal UI v1 没有独立 PR/Tag；它们沿同一提交链进入 Gate 2.4 分支，并在 PR #2 中第一次合入 `main`。

## 2. 严格时间线

| 顺序 | 日期（Git） | 阶段 | 最终功能 HEAD | PR / Merge | Verified Tag | 固化状态 |
|---:|---|---|---|---|---|---|
| 0 | 2026-07-28 | 项目初始化与架构资料导入 | `3a98ecf103dea9d88b0e5b64117c543629171603` | 无 | 无 | 与 Gate 1A 同一根提交 |
| 1 | 2026-07-28 | Gate 1A — 七模块无 LLM Walking Skeleton | `3a98ecf103dea9d88b0e5b64117c543629171603` | 后续由 PR #1 一并验证 | 无独立 Tag | 已被 Gate 1B 基线包含 |
| 2 | 2026-07-28 | Gate 1B — PostgreSQL 与 Education 骨架 | `86d9f6f27b2234d56f419101f732eeffc851f603` | #1 / `6d1335a0a2a941bbd7439fd1aa4e5353bbc82d6a` | `gate-1b-verified` | VERIFIED |
| 3 | 2026-07-28—29 | Gate 2 — Teacher Copilot 纵向切片 | `c515b1d772a89e0b4d1f63d93ba00fbdf6340b1b` | 无独立 PR | 无 | 后由 Gate 2.4 纳入 main |
| 4 | 2026-07-29 | UI redesign v1 | `f6bb200e66950b2e431bf060001a5f59414f5a2f` | 无独立 PR | 无 | 后由 Gate 2.4 纳入 main |
| 5 | 2026-07-29 | UI redesign v2 | `42b4a4b56f948835a7892de03a0b564414a86423` | 无独立 PR | 无 | 后由 Gate 2.4 纳入 main |
| 6 | 2026-07-30 | Teacher Portal UI v1 | `43c8e03a8e0e7060989d886442de283ae6f43fc5` | 无独立 PR | 无 | Gate 2.4 开发基线 |
| 7 | 2026-07-31 | Gate 2.4 — Copilot 正确性与可恢复性 | `b353f35fdba7cd47d0b2537d94b00a81487816b8` | #2 / `3ec7f106a163b85d89c5f58fc30b5ed30375d3f3` | `gate-2-4-verified` | VERIFIED |
| 8 | 2026-07-31 | Gate 2.5 — 最小可恢复备课闭环 | `8a5d8d56e098548be2e38347f4f3eb34d5694600` | #3 / `15fb113e68b48b8f7e0ae40b9afbac29e7d55a66` | `gate-2-5-verified` | VERIFIED |
| 9 | 2026-07-31—08-01 | Gate 2.6A — Volcengine Ark Provider | `57e78bac25d9d46318c671c6ec7d2f3ab3fc34b5` | #4 / `6676b3f876809bd9529b71af56dab32f07cb3c37` | `gate-2-6a-verified` | VERIFIED（含 Live） |
| 10 | 2026-08-01 | Gate 2.5B — 文件与教学成果 | `2ac23d1e0ce2e1198f5820514e7979e42ccd4dd3` | #5 / `b3787fa117b74729e0e6347b993b2c7f4a5e37f4` | `gate-2-5b-verified` | VERIFIED |
| 11 | 2026-08-01 | Gate 2.5C — 教师产品稳定性 | `fbf5dedaf5fec3ac8cabda4d63b7e2bf0592559c` | #6 / `afdcfbd9d342822038dee3e6c1a19b64dca535ac` | `gate-2-5c-verified` | VERIFIED |
| 12 | 2026-08-01 | Gate 2.7 — 作业、学习 Evidence 与调整下一课 | `dd5437fc30f9cbc7f80790d3c2ceb44bc1b10d79` | #7 / `64e0aab9a54bdb47731d14ddca32c869c2cf25f6` | `gate-2-7-verified` | VERIFIED |
| 13 | 2026-08-01 | Gate 2.8 — 日程、待办与教师工作台 | `996400123fd2433d145ee8056bda639c61208ce4` | #8 / `44a67ef0ffa519d0ef9c6c2b84e42ab9204561d0` | `gate-2-8-verified` | VERIFIED |
| 14 | 2026-08-02 | Gate 2.9 — 课堂实施与课后反思 | `a264bb5718d5f3a3af78255691e6329b6b32166d` | #9 / `f2c756630b45e1b6e284d0f02269f0c094c3964d` | `gate-2-9-verified` | VERIFIED |
| 15 | 2026-08-02 | Gate 2.10A — 身份、学校组织与权限基线 | `2fd31f874afa9f6097cd1c6e019763148eb59a47` | #10 / `bbba3428602bb148a3d73a201ad97fcb29181c1b` | `gate-2-10a-verified` | VERIFIED |

## 3. 各阶段详细记录

### 0. 项目初始化与架构资料导入

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 把 v0.3 红队审查、v0.3.1/v0.3.2 架构修订、ADR 包和第一轮工程计划落到一个 TypeScript/pnpm 单仓。 |
| 开发基线 | 无父提交；创建时分支名未被 Git 保存，标记为**未核实**。 |
| 功能分支 / HEAD | 无可独立证明的初始化分支；与 Gate 1A 共用根提交 `3a98ecf103dea9d88b0e5b64117c543629171603`。 |
| PR / Merge / Tag | 无独立 PR、Merge Commit 或 Tag。 |
| 新增对象与状态所有者 | 架构文档冻结 Task/TaskRun、ArtifactRevision、ActionIntent、AuthorizationDecision、AgentRun、Capability、Education objects 等概念，并裁决七模块状态所有权；并非所有文档对象都已实现。 |
| Database / Adapter | 同一根提交已经包含七个 `0001` Migration、Drizzle Schema、五个内存 Repository 和 Fake Tool；因此仓库无法把“纯初始化”与 Gate 1A 代码拆成两个提交。 |
| API / UI | 初始化了 Express API、React/Vite Web、共享 Contracts 和基础页面。 |
| 权限、事务、幂等、审计 | 规范上确立 ActingContext/ActionIntent、AuthorizationDecision、Audit、Outbox、模块所有权；首轮代码只实现最小验证面。 |
| 测试与验收 | 根提交带 Architecture、Ingress、Walking Skeleton、PGlite 和 Node smoke 测试；没有独立人工验收记录。 |
| 已实现 / 未实现 | 已建立仓库、工具链和架构骨架；真实 PostgreSQL Adapter、产品闭环、真实模型、文件、身份均未完成。 |
| 后续修正 | Gate 1B 完成真实 PostgreSQL；后续 Gate 逐步把早期 ADR 的一部分转成产品代码。当前实现以 [ARCHITECTURE](ARCHITECTURE.md) 为准。 |
| 主要文档 | [v0.3 红队审查](history/research/教育智能体平台架构红队审查与v0.3建议.md)、[v0.3.1 修订](history/research/教育智能体平台v0.3.1架构修订.md)、[v0.3.2 修订](history/research/教育智能体平台v0.3.2架构修订.md)、[v0.3.2 ADR 包](adr/教育智能体平台v0.3.2勘误与ADR包.md)。 |

### 1. Gate 1A — 七模块无 LLM Walking Skeleton

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 在不依赖 LLM 的前提下证明七模块、统一 Ingress、Task/Run、授权、Audit、Outbox 和 Artifact revision 的最小纵向调用。 |
| 开发基线 | 仓库根；分支名未核实。 |
| 功能分支 / HEAD | 无独立可证明分支；HEAD `3a98ecf103dea9d88b0e5b64117c543629171603`。 |
| PR / Merge / Tag | Gate 1A 没有独立 PR/Tag；PR #1 的标题和测试后来把 Gate 1A/1B 作为共同基线验证。 |
| 新增领域对象 / 所有者 | Governance：AuthorizationDecision/Audit；Work：Task/TaskRun/QueryRun/Idempotency/Outbox；Runtime：AgentRun；Capability：ToolExecution；Artifact：ArtifactRevision；Education/Personalization 先建 Schema 边界。 |
| Migration | 七模块各一个 `0001`：governance、work、runtime、capability、artifact、education、personalization。 |
| Repository / Adapter | In-memory Governance/Work/Runtime/Capability/Artifact Repository；Fake Tool；Gate1A Container。 |
| API | Walking Skeleton command、artifact query、五类 frozen semantic ingress。 |
| UI | 最小 React 展示，不是教师产品门户。 |
| 关键工作流 | Command → Authorization → Task/TaskRun → AgentRun → ToolExecution → ArtifactRevision → Audit/Outbox；幂等重放不重复创建结果。 |
| 权限 / 事务 / 审计 | 先用模块内存实现验证调用约束；数据库角色文件只提供早期 runtime 权限草案。 |
| 测试 | Architecture boundaries、Ingress contract、Vitest E2E、Node smoke、PGlite Migration 和静态断言。 |
| 已实现 / 未实现 | 完成架构骨架；未完成 PostgreSQL 产品路径、Education 业务、教师 Copilot、正式身份。 |
| 后续修正 | Gate 1B 增加 PostgreSQL Adapter；Gate 2.4 后内存 Container 明确只属于 Test Composition Root。 |
| 主要文档 | [第一轮工程验证计划](history/research/教育智能体平台第一轮工程验证计划.md)。 |

### 2. Gate 1B — PostgreSQL 与最小 Education Domain

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 证明七 Schema ownership、真实 PostgreSQL 事务、并发幂等、Outbox 租约和最小 Education 持久化。 |
| 开发基线 | `main` @ `3a98ecf103dea9d88b0e5b64117c543629171603`（PR #1 的 base/parent 可核实）。 |
| 功能分支 / HEAD | `feat/round-1-skeleton` @ `86d9f6f27b2234d56f419101f732eeffc851f603`。 |
| PR / Merge / Tag | [PR #1](https://github.com/CrystalDavid/Edu-Agent/pull/1)；Merge `6d1335a0a2a941bbd7439fd1aa4e5353bbc82d6a`；`gate-1b-verified`。 |
| 新增领域对象 / 所有者 | Education：CourseRun、LearningObjective、LearningInteractionProfile、Attempt、EvidenceObservation、EvidenceClaim、TeachingPlanAlignment；其他模块增加真实持久化记录。 |
| Migration | 六个 `0002_gate1b_*` Migration；Personalization 仍只有 `0001`。引入 owner/app/runtime/worker/migrator 角色和细粒度 grants。 |
| Repository / Adapter | PostgreSQL Governance、Work、Runtime、Capability、Artifact、Education Repository；连接池与迁移器。 |
| API | Gate1A HTTP 合同不变，主要新增 Repository/Service 验证面。 |
| UI | 无实质产品 UI 扩展。 |
| 关键工作流 | 事务回滚、相同幂等键并发、Artifact Revision 竞争、Outbox 原子提交和租约恢复。 |
| 权限 / 事务 / 审计 | 应用、Runtime、Worker 不以超级用户运行；Runtime 对 Education/Personalization 只读，Worker 只领取允许的 Outbox 字段。 |
| 测试 | 真实 Docker PostgreSQL、角色隔离、事务、并发、Outbox、Artifact immutable、Education contract；PR #1 后 annotated tag 固化。 |
| 已实现 / 未实现 | 建立数据库工程基线；尚无教师产品切片、课程页面、模型 Provider 或正式身份。 |
| 后续修正 | Gate 2 建立产品切片；Gate 2.4 将 Product/Test Composition Root 分离；所有后续 Migration 继续 owner/checksum 规则。 |
| 主要文档 | [第一轮工程验证计划](history/research/教育智能体平台第一轮工程验证计划.md)、[Migration ownership](../infra/postgres/MIGRATION_OWNERSHIP.md)。 |

### 3. Gate 2 — Teacher Copilot 纵向切片

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 用一条合成教师建议流程验证 Task → Context → Mock Model → Proposal → 教师处置 → TeachingPlan/Audit。 |
| 开发基线 | `main` @ Gate 1B merge `6d1335a0a2a941bbd7439fd1aa4e5353bbc82d6a`。 |
| 功能分支 / HEAD | `feat/gate-2-teacher-copilot` @ `c515b1d772a89e0b4d1f63d93ba00fbdf6340b1b`。 |
| PR / Merge / Tag | 无独立 PR/Tag；该提交链后来作为 PR #2 第二父链的一部分进入 `main`。 |
| 新增领域对象 / 所有者 | Work：CaseRecord、GoalRecord、TaskResult、SuggestionDisposition、ResolvedLearningInteractionContract；Runtime：ContextManifest；Capability：ModelExecution；Artifact：结构化 PedagogicalSuggestion/TeachingPlan Revision。 |
| Migration | Runtime `0003`、Artifact `0003`、Capability `0003`、Education `0003`、Work `0003`。 |
| Repository / Adapter | PostgreSQL Gate2 Repository/Service、确定性 MockModelProvider、Demo Seed；产品仍带固定合成教师/租户。 |
| API | Demo workspace、Teacher Copilot task、Proposal/Disposition、Run explanation、TeachingPlan endpoints；共享 Route Contract。 |
| UI | 教师工作台、策略比较、Evidence、diff、处置、TeachingPlan 与 Runs；随后同分支加入浅蓝视觉和 route-level bundle 分析。 |
| 关键工作流 | 合成教师请求生成两种策略；教师接受、修改、拒绝或稍后处理；写 Task/Run/Manifest/Artifact/Audit/Outbox。 |
| 权限 / 事务 / 幂等 / 审计 | 有 tenant-scoped PG 和幂等基础，但缺身份默认拒绝、Proposal 完整恢复和正确 current plan 语义。 |
| 测试 | HTTP、PostgreSQL、Playwright、启动诊断、视觉/启动回归和 bundle measurement。 |
| 已实现 / 未实现 | 完成确定性 Mock 的 Teacher Copilot 切片；真实教师输入未完整进入 Task、两套 Composition Root 并存、身份和审核语义有缺口。 |
| 后续修正 | Gate 2.4 系统性修复数据库隔离、身份、请求、Proposal 恢复、Plan 状态和 Worker；后续 UI 版本替代主要界面。 |
| 主要文档 | [早期 0→1 调查](history/research/PROJECT_EVOLUTION_0_TO_1.md)（SUPERSEDED，但保留调查证据）。 |

### 4. UI redesign v1

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 把早期系统概念页面重塑为亮蓝色、中文化的教师工作空间。 |
| 开发基线 | `feat/gate-2-teacher-copilot` @ `c515b1d772a89e0b4d1f63d93ba00fbdf6340b1b`。 |
| 功能分支 / HEAD | `feat/gate-2-ui-redesign` @ `f6bb200e66950b2e431bf060001a5f59414f5a2f`。 |
| PR / Merge / Tag | 无独立 PR、Merge Commit 或 Tag。 |
| 领域 / Database / Adapter | 无新领域对象或 Migration；沿用 Gate 2 API/Repository。 |
| API / UI | 中文化导航、亮蓝工作台、页面布局和本地 Demo 启动稳定性；仍以高保真演示数据为主。 |
| 工作流 / 权限 | 不改变后端状态所有权、事务或授权；只调整表现与导航。 |
| 测试 | 新增视觉 redesign acceptance 和 Demo API startup 回归。 |
| 已实现 / 未实现 | 视觉和信息架构改进；没有补齐业务持久化、正式身份或状态正确性。 |
| 后续修正 | v2 明确否定 v1 的系统概念密度，进一步转向教师日常任务；Teacher Portal UI v1 再次替代整体框架。 |
| 主要文档 | [Gate 2 UI redesign](history/ui/GATE2_UI_REDESIGN.md)（SUPERSEDED）。 |

### 5. UI redesign v2

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 围绕教师每日任务重排首页和导航，收敛为蓝白视觉系统。 |
| 开发基线 | `feat/gate-2-ui-redesign` @ `f6bb200e66950b2e431bf060001a5f59414f5a2f`。 |
| 功能分支 / HEAD | `feat/gate-2-ui-redesign-v2` @ `42b4a4b56f948835a7892de03a0b564414a86423`。 |
| PR / Merge / Tag | 无独立 PR、Merge Commit 或 Tag。 |
| 领域 / Database / Adapter | 无新领域对象或 Migration。 |
| API / UI | 首页围绕备课、日程、课程、学生和文件；导航减法、Agent 入口调整、颜色/字号规范。 |
| 工作流 / 权限 | 仍沿用 Gate 2 的合成流程和身份边界。 |
| 测试 | UI v2 acceptance、性能和文档记录。 |
| 已实现 / 未实现 | 更贴近教师心智模型；真实 Todo、日历、文件、课程层级和学生 Evidence 尚未实现。 |
| 后续修正 | Teacher Portal UI v1 重新建立稳定一级导航、卡片和页面骨架；Gate 2.5—2.10A 将高保真区域逐步接成真实 API。 |
| 主要文档 | [UI redesign v2](history/ui/GATE2_UI_REDESIGN_V2.md)（SUPERSEDED）。 |

### 6. Teacher Portal UI v1

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 冻结普通教师端侧边栏、一级路由、组件体系、HarmonyOS Sans 字体和页面职责，为后续真实闭环提供稳定外壳。 |
| 开发基线 | `feat/gate-2-ui-redesign-v2` @ `42b4a4b56f948835a7892de03a0b564414a86423`。 |
| 功能分支 / HEAD | `feat/teacher-portal-ui-v1` @ `43c8e03a8e0e7060989d886442de283ae6f43fc5`。本地别名 `feat/gate-2-5a-teacher-daily-workflow` 指向同一提交，但没有远程分支。 |
| PR / Merge / Tag | 无独立 PR/Tag；随后作为 Gate 2.4 开发基线并由 PR #2 合入。 |
| 领域 / Migration | 无新领域对象或 Migration。 |
| API / UI | 概览、日程、教学、学生、文件、Agent、设置一级框架；课程/作业/考试/学生/文件等大量数据仍为前端数组。 |
| 工作流 / 权限 | 保留 Gate 2 详情页和深链，业务状态仍受早期缺陷影响。 |
| 测试 | 路由、页面、字体、视觉和无死链的 Playwright acceptance。 |
| 已实现 / 未实现 | 完成高保真普通教师门户外壳；未完成真实课程、文件、作业、日程、身份。 |
| 后续修正 | 侧边栏、一级路由、字体、Design Token 和卡片体系持续冻结；后续 Gate 只在框架内替换 Mock 和补真实交互。 |
| 主要文档 | [Teacher Portal UI v1](history/ui/TEACHER_PORTAL_UI_V1.md)（HISTORICAL）。 |

### 7. Gate 2.4 — Teacher Copilot 正确性与可恢复性

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 修复 E2E 数据破坏、身份默认放行、双 Composition Root、请求丢失、Proposal 不可恢复和 TeachingPlan 状态混淆。 |
| 开发基线 | `feat/teacher-portal-ui-v1` @ `43c8e03a8e0e7060989d886442de283ae6f43fc5`；PR base 是当时 `main` @ `6d1335a0a2a941bbd7439fd1aa4e5353bbc82d6a`。 |
| 功能分支 / HEAD | `feat/gate-2-4-copilot-correctness` @ `b353f35fdba7cd47d0b2537d94b00a81487816b8`。 |
| PR / Merge / Tag | [PR #2](https://github.com/CrystalDavid/Edu-Agent/pull/2)；Merge `3ec7f106a163b85d89c5f58fc30b5ed30375d3f3`；`gate-2-4-verified`。 |
| 新增对象 / 所有者 | 不新建 TeacherRequest 聚合；Teacher request 成为 Work Task typed input。Artifact 管 draft/in_review/approved 和 current 指针；Work 管唯一 SuggestionDisposition。 |
| Migration | Runtime `0004_gate2_4_request_context`、Artifact `0004_gate2_4_teaching_plan_lifecycle`、Work `0004_gate2_4_task_request_and_disposition`。 |
| Repository / Adapter | Product Container 全部 PostgreSQL；Test Container 保留 Gate1A 内存实现；Local Copilot Outbox Worker。 |
| API | Proposal pending/detail/Disposition/Run；明确 current-approved、current-in-review、drafts、history 和 approve。 |
| UI | Copilot 真实 request、刷新/URL 恢复、四种处置；TeachingPlan 单独批准；Runs 显示 request/Evidence/Audit/Outbox。 |
| 关键工作流 | request → Task/Contract/ContextManifest → Proposal → accepted/changed → in_review → 单独 approve；reject/defer 不改 current。 |
| 权限 / 事务 / 幂等 / 审计 | 默认 401；Demo bypass 仅 local/demo 且 Audit；expected version、唯一 disposition、409；业务事实同步提交，Worker at-least-once + Consumer Effect。 |
| 测试 | 数据库 Volume 隔离、身份 401/403、Product/Test Root、并发 disposition/approval、Revision immutable、Worker recovery、HTTP/PG/Playwright。 |
| 已实现 / 未实现 | Copilot 正确性与恢复语义完成；正式登录、课程层级、文件、Todo、学生等未实现。 |
| 后续修正 | Gate 2.5 加真实 Lesson/TaskWorkingSet；Gate 2.10A 用正式 Session 取代普通产品的演示 Header。 |
| 主要文档 | [Gate 2.4](history/gates/GATE_2_4_COPILOT_CORRECTNESS.md)。 |

### 8. Gate 2.5 — 最小可恢复备课闭环

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 把 Copilot 放入 CourseRun → Unit → Lesson → lesson_preparation Task → Plan approval → explicit completion 的真实闭环。 |
| 开发基线 | `main` @ `3ec7f106a163b85d89c5f58fc30b5ed30375d3f3`。 |
| 功能分支 / HEAD | `feat/gate-2-5-recoverable-lesson-prep` @ `8a5d8d56e098548be2e38347f4f3eb34d5694600`。 |
| PR / Merge / Tag | [PR #3](https://github.com/CrystalDavid/Edu-Agent/pull/3)；Merge `15fb113e68b48b8f7e0ae40b9afbac29e7d55a66`；`gate-2-5-verified`。 |
| 新增对象 / 所有者 | Education：CurriculumUnit、Lesson、objective/evidence/plan binding；Work：LessonPreparationTaskDetails、TaskWorkingSet/Revision、PreparationStatusHistory；Runtime：AuthorizedContextPlan；Artifact：TeachingPlanScopeLifecycle。 |
| 状态所有者 | Work 拥有 `planned → in_progress → awaiting_plan_review → ready_for_use → completed/cancelled/reopen`；Artifact 拥有 draft/in_review/superseded/approved/current；Runtime 只拥有当次授权上下文。 |
| Migration | Education `0004`、Work `0005`、Runtime `0005`、Artifact `0005`；当时总数 25。 |
| Repository / Adapter | Gate2.5 Education/Work PostgreSQL Repository、Lesson preparation/read/application services、正式 Seed。 |
| API | CourseRun/Unit/Lesson；Task list/create/detail/start/reopen/complete/cancel/history；WorkingSet selections；AuthorizedContextPlan/Manifest；Lesson-scoped TeachingPlan views。 |
| UI / 工作流 | 教学选择课时 → Task → Agent 上下文 → Proposal 恢复 → in-review → approve → ready_for_use → explicit complete；概览/教学/Plan/Runs 同步。 |
| 权限 / 事务 / 幂等 / 审计 | 每 Run 重新授权，不复用旧权限；所有状态转换 expected version + idempotency + Audit/Outbox；并发 active review/current approved 单赢家。 |
| 测试 | 课程层级、状态机、WorkingSet、Plan unique constraints、并发、重启恢复、HTTP 和完整 Playwright。 |
| 已实现 / 未实现 | 普通教师最小备课闭环完成；仍只用 Mock Provider，无文件、作业、日历、正式身份。 |
| 后续修正 | Gate 2.6A 增真实 Provider；2.5B 增文件；2.5C 修页面状态；2.7/2.9 增 Evidence/Reflection 来源；2.10A 增正式身份。 |
| 主要文档 | [Gate 2.5](history/gates/GATE_2_5_RECOVERABLE_LESSON_PREPARATION.md)。 |

### 9. Gate 2.6A — Volcengine Ark 单一生产 Provider

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 在不改变 Gate 2.5 业务语义的前提下，引入唯一生产 Provider `VolcengineArkProvider` 和真实 Doubao Seed 2.1 Turbo 调用。 |
| 开发基线 | `main` @ `15fb113e68b48b8f7e0ae40b9afbac29e7d55a66`。 |
| 功能分支 / HEAD | `feat/gate-2-6a-volcengine-ark-provider` @ `57e78bac25d9d46318c671c6ec7d2f3ab3fc34b5`。 |
| PR / Merge / Tag | [PR #4](https://github.com/CrystalDavid/Edu-Agent/pull/4)；Merge `6676b3f876809bd9529b71af56dab32f07cb3c37`；`gate-2-6a-verified`。 |
| 新增对象 / 所有者 | Capability：ModelExecution lifecycle/events、BudgetDecision、ProviderCapabilitySnapshot；Governance：ModelDataManifest；Runtime/Work：run lifecycle timing；PromptBundle 为版本化 application object。 |
| Migration | Runtime `0006`、Capability `0004`/`0005`、Governance `0003`、Work `0006`；Live 固化时总数 30。 |
| Repository / Adapter | ModelProvider Port、MockModelProvider、VolcengineArkProvider（server-only OpenAI-compatible SDK）、Fake Ark Server、PostgresModelExecutionRepository。 |
| API | provider availability/capabilities/usage；invocation create/detail/status/cancel/retry。 |
| UI | Teacher 无模型选择器；显示 queued/running/validating/retry/failure/succeeded；Runs 显示 Token、延迟、费用和脱敏 request ID。 |
| 关键工作流 | 事务内封存上下文并 queue → 事务外租约 Worker 调 Ark → JSON/Zod/Evidence/Policy validate → 最多一次 repair → 唯一 Proposal。 |
| 权限 / 安全 / 幂等 | Server-only secrets、ModelDataManifest 只允许合成数据、预算、超时/取消、有限重试、request hash 复用；不保存完整 Prompt/响应/错误体。 |
| 测试 | 同一 Provider contract、32 项合成评测、Fake Ark 故障矩阵、PG lifecycle/lease/reuse、HTTP/Playwright；严格 Live 真实验证 18 次公网请求（16 成功、2 客户端超时），无 Mock/Fake fallback。 |
| 已实现 / 未实现 | 文本/结构化输出、图片/JSON Schema/function/streaming capability probe 均实机通过；产品只使用非流式文本 Chat Completions。无第二模型、路由、多模态产品或 Provider 会话真值。 |
| 后续修正 | Live acceptance 显式发送 `thinking: disabled` 解决受限 JSON 超时；2.5B 后仍禁止上传内容进入模型。Gate 2.6B 未实施。 |
| 主要文档 | [Gate 2.6A](history/gates/GATE_2_6A_VOLCENGINE_ARK_PROVIDER.md)、[Live Acceptance](history/gates/GATE_2_6A_LIVE_ACCEPTANCE.md)。 |

### 10. Gate 2.5B — 文件与教学成果闭环

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 安全保存、版本化、关联教师文件，并把明确 approved TeachingPlan 导出为正式 DOCX。 |
| 开发基线 | `main` @ `6676b3f876809bd9529b71af56dab32f07cb3c37`。 |
| 功能分支 / HEAD | `feat/gate-2-5b-file-and-teaching-artifacts` @ `2ac23d1e0ce2e1198f5820514e7979e42ccd4dd3`。 |
| PR / Merge / Tag | [PR #5](https://github.com/CrystalDavid/Edu-Agent/pull/5)；Merge `b3787fa117b74729e0e6347b993b2c7f4a5e37f4`；`gate-2-5b-verified`。 |
| 新增对象 / 所有者 | Artifact：FileAsset、immutable FileVersion、ArtifactFileBinding、FileOperationIdempotency、TeachingPlanFileExport；Capability：ObjectStore Port/LocalObjectStore。 |
| Migration | Artifact `0006_gate2_5b_file_artifacts`、`0007_gate2_5b_shared_object_keys`。 |
| Repository / Adapter | PostgresFileArtifactRepository/Service、LocalObjectStore、OOXML summary extractor、TeachingPlanDocxRenderer。 |
| API | File list/detail/upload/version/download/delete/restore/binding；explicit TeachingPlan Revision DOCX export。 |
| UI / 工作流 | 上传/搜索/分类/下载/版本/软删除/恢复；Lesson/Task/Plan binding；approved Revision 导出 DOCX，新 approved 形成同一 Asset 新 Version。 |
| 权限 / 事务 / 补偿 / 审计 | 用户文件名不作路径；流式 hash、MIME/OOXML/大小校验；对象先写、DB 失败补偿和 orphan marker；正式成果禁止手工换版/改绑定/删除；下载重新授权。 |
| 测试 | ObjectStore/path/MIME/hash、immutable version、幂等、补偿/orphan、tenant、DOCX OOXML 内容、服务/API 重启、独立 E2E ObjectStore/Volume 和 Playwright。 |
| 已实现 / 未实现 | Local 文件闭环和 DOCX 完成；无云 ObjectStore、分享、协作、OCR、文件内容进模型、完整 Office 渲染或 PPT 设计。 |
| 后续修正 | Gate 2.5C 封堵正式导出文件的通用写入口并改善跨页上下文；Gate 2.10A 把文件下载置于 Session/School 授权下。 |
| 主要文档 | [Gate 2.5B](history/gates/GATE_2_5B_FILE_AND_TEACHING_ARTIFACTS.md)。 |

### 11. Gate 2.5C — 教师产品正确性与体验收口

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 不扩业务模块，修复备课、模型、Plan、文件之间的状态、按钮、恢复和单一真值问题。 |
| 开发基线 | `main` @ `b3787fa117b74729e0e6347b993b2c7f4a5e37f4`。 |
| 功能分支 / HEAD | `feat/gate-2-5c-teacher-product-stabilization` @ `fbf5dedaf5fec3ac8cabda4d63b7e2bf0592559c`。 |
| PR / Merge / Tag | [PR #6](https://github.com/CrystalDavid/Edu-Agent/pull/6)；Merge `afdcfbd9d342822038dee3e6c1a19b64dca535ac`；`gate-2-5c-verified`。 |
| 领域 / Migration | 不新增领域对象或 Migration；状态真值仍由 Work/Artifact/Capability 拥有。 |
| Repository / API | 复用既有 API，强化结构化 409 后 reload、正式导出保护和资源深链。 |
| UI | 修正 ready/completed/cancel/reopen CTA、active in-review 文案、active model 禁止重复提交、Proposal scope 清空、文件 Lesson/Asset URL、Runs polling、删除/恢复反馈和假成功。 |
| 权限 / 幂等 / 审计 | 正式 export 文件通用写接口 fail closed；前端不自行重放冲突命令，刷新后端版本。 |
| 测试 | 审计 20 项：P0=1、P1=8、P2=8 全部修复，P3=3 记录；Unit/PG/HTTP/Playwright/Fake Ark 和服务重启回归。 |
| 已实现 / 未实现 | P0/P1/DEAD 清零，页面一致性收口；不做视觉重构、作业、学生、日历或云部署。 |
| 后续修正 | Gate 2.7 以后逐步替换剩余作业/学生/日程 Mock；通用 Agent 和考试仍是明确 Mock/READ_ONLY。 |
| 主要文档 | [Stabilization Matrix](history/gates/TEACHER_PRODUCT_STABILIZATION_MATRIX.md)。 |

### 12. Gate 2.7 — 作业、学习 Evidence 与教学调整

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 教师创建/发布作业、查看匿名提交、批改确认、生成可追溯 Evidence，并显式调整下一课。 |
| 开发基线 | `main` @ `afdcfbd9d342822038dee3e6c1a19b64dca535ac`。 |
| 功能分支 / HEAD | `feat/gate-2-7-assignment-learning-evidence` @ `dd5437fc30f9cbc7f80790d3c2ceb44bc1b10d79`。 |
| PR / Merge / Tag | [PR #7](https://github.com/CrystalDavid/Edu-Agent/pull/7)；Merge `64e0aab9a54bdb47731d14ddca32c869c2cf25f6`；`gate-2-7-verified`。 |
| 新增对象 / 所有者 | Education：CourseRunEnrollment、Assignment/Version/Item/ObjectiveLink、Submission/AttemptDetails/ItemResponse、TeacherGradeDecision/ItemGrade、AssignmentEvidenceSource；Work：grading details/source context；Artifact：Assignment file binding。 |
| 状态所有者 | Assignment `draft→published→closed→archived`；Grade `draft→confirmed→superseded`；Attempt/Response immutable；Evidence immutable + supersedes。 |
| Migration | Education `0005`、Work `0007`、Artifact `0008`。 |
| Repository / Adapter | Gate2.7 Education/Work PostgreSQL Repository、AssignmentLearningService、正式合成 Seed。 |
| API | Assignment lifecycle/history；synthetic submission/import/detail；grading queue/draft/confirm/reopen/history；analytics/common errors/Evidence；adjust-next-lesson。 |
| UI / 工作流 | Lesson → Assignment draft/publish → 12 anonymous learners/submissions → grade confirm → Evidence → selected Evidence → next Lesson Task → existing Copilot/Plan flow。 |
| 权限 / 事务 / 幂等 / 审计 | 未交不是 0 分；confirmed grade/evidence 不覆盖；tenant/Assignment/current source 校验；advisory lock/partial unique/expected version；Agent 只见 selected Evidence。 |
| 测试 | lifecycle、immutable attempt、grade revision、Evidence lineage、recalculable analytics、concurrency、tenant、restart、HTTP/Playwright。 |
| 已实现 / 未实现 | 教师作业与学习证据闭环完成；数据为匿名合成，无学生提交端、正式名单、完整题库/考试或长期能力模型。 |
| 后续修正 | Gate 2.8 把截止/未交/待批改投影到工作台；Gate 2.9 让 Assignment Evidence 可被教师选择进入 Reflection。 |
| 主要文档 | [Gate 2.7](history/gates/GATE_2_7_ASSIGNMENT_LEARNING_EVIDENCE.md)。 |

### 13. Gate 2.8 — 日程、待办与教师统一工作台

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 统一概览、Todo、Calendar 和源业务提醒，不复制备课/作业/Plan/模型/文件真值。 |
| 开发基线 | `main` @ `64e0aab9a54bdb47731d14ddca32c869c2cf25f6`。 |
| 功能分支 / HEAD | `feat/gate-2-8-teacher-workbench` @ `996400123fd2433d145ee8056bda639c61208ce4`。本地同名分支后来由 `gh` 更新到 Merge Commit，不改变远程功能 HEAD。 |
| PR / Merge / Tag | [PR #8](https://github.com/CrystalDavid/Edu-Agent/pull/8)；Merge `44a67ef0ffa519d0ef9c6c2b84e42ab9204561d0`；`gate-2-8-verified`。 |
| 新增对象 / 所有者 | Work：TeacherTodo、CalendarEvent、TodoCalendarLink、TeacherWorkProjection、TeacherWorkPreference、Todo/Calendar status history。 |
| Migration | Work `0008_gate2_8_teacher_workbench`。 |
| Repository / Adapter | PostgresGate2.8WorkRepository、TeacherWorkbenchService、Outbox-driven/rebuild projection。 |
| API | Todo CRUD/status/preference/resources/schedule/agent handoff；Calendar list/CRUD/status；Workbench overview/action-items/projection/preferences。 |
| UI / 工作流 | 概览和日/周/月读取同一 API；Todo 安排 Calendar 但状态独立；来源提醒只能 deep link 回源；snooze/pin/hide 不改源；Todo 显式关联 Lesson 后进入 Agent。 |
| 权限 / 事务 / 幂等 / 审计 | teacher+tenant 隔离、IANA timezone、expected version、重复安排幂等、source version 改变后重评提醒、Worker replay upsert。 |
| 测试 | Todo/Calendar lifecycle、timezone/cross-day、projection unique/replay、snooze source invariance、Agent context、restart、Playwright。 |
| 已实现 / 未实现 | 个人工作台闭环完成；无共享/外部日历、复杂 recurrence、自动 Agent 或自动完成源业务。 |
| 后续修正 | Gate 2.9 添加待实施/待反思和 Reflection follow-up 投影；Gate 2.10A 将 Todo/Calendar 按真实用户和学校隔离。 |
| 主要文档 | [Gate 2.8](history/gates/GATE_2_8_TEACHER_WORKBENCH.md)。 |

### 14. Gate 2.9 — 课堂实施、观察与课后反思

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 严格区分 approved plan 与课堂事实，由教师确认实施/观察，Agent 只生成 Reflection draft，并显式创建后续行动。 |
| 开发基线 | `main` @ `44a67ef0ffa519d0ef9c6c2b84e42ab9204561d0`。 |
| 功能分支 / HEAD | `feat/gate-2-9-classroom-reflection-loop` @ `a264bb5718d5f3a3af78255691e6329b6b32166d`。 |
| PR / Merge / Tag | [PR #9](https://github.com/CrystalDavid/Edu-Agent/pull/9)；Merge `f2c756630b45e1b6e284d0f02269f0c094c3964d`；`gate-2-9-verified`。 |
| 新增对象 / 所有者 | Education：LessonDelivery/Revision、ClassroomObservation/Revision、ObservedPedagogicalMove、InstructionalDecision；Artifact：LessonReflection/Revision；Work：Reflection task/follow-up links/projections。 |
| 状态所有者 | 教师确认的 Delivery/Observation Revision 才是事实；confirmed immutable + amend/supersede；Reflection draft/confirmed/history 独立于 TeachingPlan。 |
| Migration | Education `0006`、Artifact `0009`、Work `0009`、Capability `0006`、Governance `0004`；当时总数 41。 |
| Repository / Adapter | Gate2.9 Education/Artifact/Work PostgreSQL Repository、ClassroomReflectionService、Reflection PromptBundle/validator。 |
| API | Delivery draft/detail/update/confirm/amend/history；Observation draft/confirm/supersede/list；Reflection draft/generate/update/confirm/history/follow-up；pending summaries。 |
| UI / 工作流 | Lesson 记录 adopted/adjusted/skipped/added → teacher confirm → observations → selected context → Agent reflection draft → teacher confirm → explicit next prep/Assignment/Todo。 |
| 权限 / 事务 / 幂等 / 审计 | Calendar 结束不产生事实；Agent 不确认；session key/unique/locks/expected version；每次 Reflection run 重授权 selected observation/evidence；follow-up 独立幂等。 |
| 测试 | Plan immutable vs delivery、revision histories、observation scopes、Reflection context/output/follow-up、tenant/learner、Worker replay、restart、Playwright。 |
| 已实现 / 未实现 | 课堂实施—反思—后续行动完成；无实时课堂助手、音视频、自动观察、考勤、长期 learner label 或多模态。 |
| 后续修正 | Gate 2.10A 将确认者和范围绑定到正式 Session/Membership/CourseRun access。 |
| 主要文档 | [Gate 2.9](history/gates/GATE_2_9_CLASSROOM_REFLECTION_LOOP.md)。 |

### 15. Gate 2.10A — 正式身份、学校组织与权限基线

| 项目 | 仓库事实 |
|---|---|
| 产品目标 | 从固定演示教师/Header 身份升级为服务端 Session、学校 Membership、角色、工作空间与 CourseRun 授权。 |
| 开发基线 | `main` @ `f2c756630b45e1b6e284d0f02269f0c094c3964d`。 |
| 功能分支 / HEAD | `feat/gate-2-10a-identity-organization-foundation` @ `2fd31f874afa9f6097cd1c6e019763148eb59a47`。 |
| PR / Merge / Tag | [PR #10](https://github.com/CrystalDavid/Edu-Agent/pull/10)；Merge `bbba3428602bb148a3d73a201ad97fcb29181c1b`；`gate-2-10a-verified`。 |
| 新增对象 / 所有者 | Governance：UserAccount、ExternalIdentityLink、Organization、Membership、RoleAssignment、CourseRunAccess、AuthenticationSession、OidcLoginState、OrganizationInvitation foundation、IdentityCommand、SecurityEvent、DataGovernanceRequest。 |
| 状态所有者 | Governance 拥有身份/组织/会话；Education/Work/Artifact/Capability/Runtime 继续拥有业务状态。ordinary_teacher 和最小 school_admin 可用，subject_lead/homeroom 仅 Schema 边界。 |
| Migration | Governance `0005_gate2_10a_identity_organization`、`0006_gate2_10a_model_data_scope`；当前总数 43。 |
| Repository / Adapter | IdentityProvider Port、LocalIdentityProvider、OidcIdentityProvider (`openid-client`)、PostgresIdentityOrganizationService/Governance Repository。 |
| API | provider/session/login/callback/refresh/logout/workspace/sessions；school/members/status/roles/course access/security events；data governance requests。 |
| UI / 工作流 | 未登录 Login；HttpOnly session；多学校选择/恢复；侧边栏真实 user/school/role；Settings session/org/admin/data request；suspend 即时阻断。 |
| 权限 / 安全 / 幂等 / 审计 | 不透明 token 只存 SHA-256；HttpOnly/SameSite、production Secure、Origin+CSRF；ActingContext 每请求从 active membership 解析；跨学校 404；管理员命令 expected version/idempotency/Audit；Demo bypass 默认关闭。 |
| 测试 | Secret 377、TypeScript、Vitest 105、Architecture 51、Static 1343、HTTP 5、Node 5、PGlite、PG 93/43 migrations、Playwright 19、Fake Ark 1、build/bundle/doctor；School A/B、OIDC state、session、CSRF、suspend、admin 和既有闭环。 |
| 已实现 / 未实现 | 本地可运行正式会话和 provider-neutral OIDC 产品代码；未完成真实云 IdP 配置、邮件邀请、MFA/SCIM、云 DB/ObjectStore、监控备份、正式学生/家长身份或部署。 |
| 后续建议 | Gate 2.10B 应只解决云部署与试点运维差距，见 [DEPLOYMENT_READINESS_GAPS](operations/DEPLOYMENT_READINESS_GAPS.md)。 |
| 主要文档 | [Gate 2.10A](history/gates/GATE_2_10A_IDENTITY_ORGANIZATION_FOUNDATION.md)。 |

## 4. Verified Tag 指向

| Tag | 指向的 Merge Commit |
|---|---|
| `gate-1b-verified` | `6d1335a0a2a941bbd7439fd1aa4e5353bbc82d6a` |
| `gate-2-4-verified` | `3ec7f106a163b85d89c5f58fc30b5ed30375d3f3` |
| `gate-2-5-verified` | `15fb113e68b48b8f7e0ae40b9afbac29e7d55a66` |
| `gate-2-6a-verified` | `6676b3f876809bd9529b71af56dab32f07cb3c37` |
| `gate-2-5b-verified` | `b3787fa117b74729e0e6347b993b2c7f4a5e37f4` |
| `gate-2-5c-verified` | `afdcfbd9d342822038dee3e6c1a19b64dca535ac` |
| `gate-2-7-verified` | `64e0aab9a54bdb47731d14ddca32c869c2cf25f6` |
| `gate-2-8-verified` | `44a67ef0ffa519d0ef9c6c2b84e42ab9204561d0` |
| `gate-2-9-verified` | `f2c756630b45e1b6e284d0f02269f0c094c3964d` |
| `gate-2-10a-verified` | `bbba3428602bb148a3d73a201ad97fcb29181c1b` |

这些映射由 `corepack pnpm verify:version-history` 离线验证：tag 必须是 annotated tag、peeled target 必须匹配表中 Merge Commit、功能 HEAD 必须是 Merge Commit 的父提交之一。
