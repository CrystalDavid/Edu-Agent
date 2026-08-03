# Edu-Agent 推荐迁移路线

> 状态：待评审路线图
> 起点：`codex/teacher-delivery-experience` / `b9e43cb15b9d4be84235c1313933145a390bdc7e`
> 原则：每阶段可独立验证、可回退；先恢复维护结构，再建立边界，最后扩展 Agent 平台。

## 1. 路线总览

```text
阶段 0  决策冻结与基线证据
   ↓
阶段 1  低风险仓库结构恢复
   ↓
阶段 2  样例数据退出正式产品路径
   ↓
阶段 3  应用服务与模块 Facade 收口
   ↓
阶段 4  Agent Runtime Kernel
   ↓
阶段 5  Skill Registry 与 Evaluation
   ↓
阶段 6  Memory、Personalization 与 Context Engineering
   ↓
阶段 7  部署和小范围教师试点
```

阶段 1–3 形成新的长期维护基线；阶段 4–6 建设下一代 Agent 平台；阶段 7 才进入云部署和真实试点。

## 2. 全程约束

- 不 checkout baseline 覆盖当前本地功能；
- 不修改、合并或删除 43 个历史 Migration；
- 不删除教师门户、Agent、文件预览和课程工作区的有效改进；
- 不同时进行目录移动、数据库 Schema 更名和业务状态机重写；
- 不创建没有真实消费者的 package；
- 不机械改成微服务；
- 不让 Runtime 直接写 Platform 正式状态；
- 不用样例或 Fake 结果冒充正式产品数据；
- 每一阶段必须使用独立测试数据库和 ObjectStore；
- 开发数据库、上传文件和 `.env.local` 不受迁移与测试影响；
- 所有分支保留语义提交历史，不 force push。

## 3. 阶段 0：决策冻结与基线证据

### 目标

在移动任何文件前，让团队对“保留什么、调整什么、为什么”达成一致。

### 交付物

- `baseline-merge-report.md`；
- `future-agent-platform-design.md`；
- 本路线图；
- baseline 与当前 HEAD 的完整测试清单和结果；
- 43 个 Migration 的 checksum 清单；
- 当前 workspace package、根脚本和大文件基线；
- 当前 Web bundle 基线。

### 验收

- 用户确认当前功能改进全部应保留；
- 用户确认 `environments/` 和空壳 `deploy/` 不作为长期顶层；
- 无业务代码和目录移动；
- 文档链接和 `git diff --check` 通过。

### 回退

只新增分析文档，删除文档提交即可回退，不涉及运行状态。

## 4. 阶段 1：低风险仓库结构恢复

### 目标

恢复标准 pnpm monorepo，不改变产品行为。

### 变更

1. `environments/sample-data` → `packages/sample-data`。
2. `environments/local/postgres` → `infra/local/postgres`。
3. 将 `deploy/README.md` 的有效内容合并到 `docs/operations`，删除空壳 `deploy/`。
4. 删除空的 `environments/` 顶层。
5. `pnpm-workspace.yaml` 恢复只匹配 `apps/*` 和 `packages/*`。
6. 更新 package 路径、lockfile、tsconfig references、脚本和文档。
7. 保留 `scripts/local`、`scripts/testing`、`scripts/quality`、`scripts/postgres`、`scripts/security`。
8. 保留 `.local-data` 作为 Git ignored 本地运行根。

### 推荐提交拆分

```text
chore: move sample data into packages
chore: restore local postgres under infra
docs: remove premature deployment placeholder
test: verify canonical workspace structure
```

### 自动化保护

新增或加强 architecture/static assertions：

- workspace 根只允许 `apps/*` 和 `packages/*`；
- 根目录禁止无实现的 `environments` 和 `deploy`；
- `packages/sample-data` 不进入 Web bundle；
- 禁止跟踪 `.local-data`、output、node_modules、dist 和 Secret；
- 本地与测试数据库/ObjectStore 路径隔离。

### 验收

- 产品页面和 API 响应无行为变化；
- package graph 可安装、构建和类型检查；
- 全部测试通过；
- 43 个 Migration checksum 不变；
- Bundle 未显著增长；
- 所有根脚本仍有稳定入口；
- Git ignored 本地数据未被移动或删除。

### 回退

目录移动使用单独提交；失败时 revert 该提交即可。禁止同时夹带业务修复。

## 5. 阶段 2：样例数据退出正式产品路径

### 目标

让本地演示使用真实业务代码和数据库，而不是让正式 Application Service 依赖固定样例 Ref。

### 当前问题

`apps/api` 的多个 PostgreSQL 服务直接 import sample package。即使界面已去掉“演示/合成”字样，代码仍可能隐式使用固定学校、教师、课程或课时 Ref。这是比目录命名更重要的架构问题。

### 变更顺序

1. 对所有 `@edu-agent/sample-data` import 建立清单，分类为：
   - Seed 初始化；
   - 测试 Fixture；
   - 产品默认值；
   - 展示文案。
2. 保留 Seed Composition 对 sample data 的使用。
3. 产品 Application Service 改为从以下来源获得 Ref：
   - 服务端 Session 解析的 ActingContext；
   - Contract 请求中的业务 Ref；
   - 当前 Workspace/CourseRun Repository 查询；
   - 已封存 TaskWorkingSet / ContextManifest。
4. 删除产品路径中的固定 teacher、tenant、course、lesson fallback。
5. Demo 启动先执行明确 Seed，再使用与生产相同的 API 和授权路径。
6. architecture test 阻止正式源码 import `sample-data`、`test-fixtures`。

### 不应做

- 不复制一套“生产 Ref 常量”替代 sample Ref；
- 不把 Ref 放入前端环境变量；
- 不因方便而恢复 Header 伪造 actor/tenant；
- 不把测试 Fixture 移进产品 Composition Root。

### 验收

- API 以两个 synthetic School 验证 tenant 隔离；
- 未 Seed 数据时返回清晰空状态，不回退固定数据；
- Seed 后可完整走登录、备课、文件、作业、Reflection、Todo；
- production composition 不引用 sample/test package；
- Web bundle 不包含样例全集；
- 测试仍完全离线。

### 回退

每个业务服务单独迁移并保留 facade 兼容，不能一次改完所有服务后才验证。

## 6. 阶段 3：Application Service 与模块边界收口

### 目标

降低巨大 Composition Service 的维护风险，让 Codex 和开发者可以按用例定位代码，同时保持模块化单体。

### 优先级

按风险和收益排序：

1. 模型调用与 Proposal 消费；
2. Identity/Organization；
3. Assignment/Evidence；
4. Teacher Workbench；
5. Teaching Copilot / Lesson Preparation；
6. File Artifact；
7. Classroom Reflection。

### 拆分规则

- 以命令、查询、事务边界和状态所有者拆分，不以 500 行阈值机械拆分；
- 每个模块暴露 Application Facade / Port；
- Composition Root 只实例化、注入和启动；
- 模块间不 import 对方具体 PostgreSQL Repository；
- 跨 Schema 写入调用拥有模块的 Application Service；
- HTTP route 只做 Contract parse、Session/ActingContext 和响应映射；
- Audit、Outbox 和幂等由用例模板统一，但不建立万能 BaseService。

### 兼容策略

1. 为现有大服务建立外观接口；
2. 一次提取一个用例；
3. 原服务把调用委托给新用例；
4. Contract 和 HTTP route 暂不改；
5. 单元、PostgreSQL、HTTP 和 Playwright 验证后再提取下一个；
6. 全部迁移完成才删除旧实现。

### 验收

- Composition Root 不包含业务状态机；
- 新增业务用例可在单一模块内定位；
- 跨模块依赖有 architecture test；
- 无循环依赖；
- 现有 API、数据库和页面行为不变；
- 关键服务的复杂度和依赖数有可量化下降。

### 回退

Facade 保持旧接口；任一用例可回退委托，不需要回滚数据库。

## 7. 阶段 4：Agent Runtime Kernel

### 目标

将现有 TaskRun、AgentRun、ModelExecution、ContextManifest 和 Worker 能力收敛为可执行多 Step、可 Checkpoint 和可评测的 Runtime，但不改变教师审批语义。

### 设计工作

- ADR：Platform / Agent 边界；
- ADR：Run / Step / Checkpoint 状态与恢复；
- ADR：Tool Router 与副作用幂等；
- compatibility map：现有 TaskRun、AgentRun、ModelExecution 如何映射；
- 数据保留和日志脱敏说明。

### 最小实现

1. `AgentDefinitionVersion` 或等价版本引用；
2. `RunStep`；
3. `Checkpoint`；
4. `ToolInvocation`；
5. `EvaluationResult`；
6. Context Builder Port；
7. Planner/Executor 接口；
8. Worker lease、effect ledger 和恢复；
9. 现有单步备课调用的 compatibility adapter。

若需要表结构，只能新增前向 Migration，不能重写现有表。不要为了目标命名立即迁移旧历史数据；先使用关联表和兼容 view/facade。

### 首个纵向切片

只选择“课堂反思”或“备课”中的一个：

```text
Task
→ deterministic plan
→ build authorized context
→ model step
→ validate step
→ Proposal
→ wait for teacher
```

先证明 Step/Checkpoint/Recovery，再扩展其他 Skill。

### 验收

- Worker 重启可从安全 Checkpoint 恢复；
- 已成功工具副作用不重复；
- 同一输入成功结果复用；
- 取消、超时、重试和人工等待状态清楚；
- Agent 不直接写 TeachingPlan、Evidence、GradeDecision；
- 现有 Mock、Fake Ark 和真实 Ark Provider Contract 保持兼容。

## 8. 阶段 5：Skill Registry 与固定评测

### 目标

把备课、作业分析、教学调整和课堂反思从散落 Prompt/Service 逻辑变成可版本化 Skill。

### 变更

1. 定义 Skill manifest schema；
2. 将现有 PromptBundle 和 output schema 映射到 SkillVersion；
3. 定义 Context Policy、Tool allowlist、Memory policy、Budget policy；
4. 建立固定合成评测集和发布阈值；
5. 数据库记录 published version、hash、evaluation 和 rollout；
6. Run 固定引用 SkillVersion；
7. 新版本发布和回滚不改历史 Run。

### package 裁决

初期 Skill 代码放 `apps/api/src/agent/skills`。只有出现第二个真实执行进程或管理工具消费者时，才提取 `packages/skill-schema`。不为每个 Skill 建 package。

### 验收

- 四个 Skill 都有明确输入、输出、Context Policy 和评测；
- 未发布 Skill 不能在产品 Run 中执行；
- 相同 SkillVersion 可复现其 Manifest 和评测版本；
- Provider 切换不是 Skill 业务语义；当前仍保持单一 Volcengine Ark 生产 Provider；
- 教师审批和正式状态不被 Skill 绕过。

## 9. 阶段 6：Memory、Personalization 与 Context Engineering

### 目标

在不创建长期学生标签和第二真值源的前提下，提高上下文准确性、token 效率和教师个性化体验。

### 顺序

1. 先实现 ContextPlan、field mask、token budget 和 Manifest gaps；
2. 建立 Context Retrieval 质量指标；
3. 实现 Working Memory 与 Task Memory；
4. 实现 MemoryCandidate，不直接写长期 Memory；
5. 教师确认后形成 Episodic Memory 或 Preference；
6. 加入有效期、撤销、supersedes、导出和去标识；
7. 最后才考虑 Semantic Retrieval 或向量索引。

### 为什么不先上向量数据库

当前主要问题是授权范围、字段选择、版本和来源，不是缺少相似度搜索。先建立可追溯 ContextPlan 和结构化 Retrieval，能够更直接减少 token 和错误。向量检索只有在真实内容规模与评测证明需要时再引入。

### 验收

- 每次 Run 能解释使用、排除和缺失了什么；
- Task Memory 不复制正式业务真值；
- 教师可以查看和撤销可复用 Preference；
- 权限撤销后 Memory 不能继续泄露内容；
- 不存储 Secret、隐藏思维链和无来源学生标签；
- 在固定评测集上 token 降低且质量不下降；
- 延迟、token、成本和教师编辑量有可比较基线。

## 10. 阶段 7：部署与小范围教师试点

### 前置条件

只有阶段 1–6 的相关验收完成，才开始部署资产。至少需要：

- 正式 OIDC；
- 托管 PostgreSQL；
- 云 ObjectStore；
- Secret Manager；
- HTTPS、域名、CSP、安全 Header 和限流；
- Migration 发布和回滚流程；
- 备份恢复演练；
- 日志、指标、告警和支持流程；
- 数据处理、保留、导出和去标识说明；
- 远程 E2E 和容量测试；
- 明确的试点学校、合成迁移路径和退出方案。

### 部署目录何时创建

当首个可执行部署资产出现时再创建 `deploy/` 或 `infra/deployment/`，并由部署技术事实决定结构。只有说明文档时继续放 `docs/operations`。

## 11. 每阶段统一验证矩阵

每个实施阶段至少运行：

- Secret Scan；
- TypeScript；
- Vitest；
- Architecture tests；
- Static Assertions；
- HTTP E2E；
- Node Smoke；
- PGlite Migration；
- PostgreSQL integration；
- 默认 Playwright；
- Fake Ark Playwright；
- Production Build；
- Bundle Analysis；
- Local/Demo Doctor；
- Markdown links；
- `git diff --check`；
- Migration checksum verification；
- repo sync verification。

涉及真实 Provider 的阶段另外运行 Live Test，并与普通离线测试分开报告。结构迁移不应强制依赖公网。

## 12. 建议的分支与 PR 策略

每个阶段使用单一目的分支和小型语义提交：

```text
chore/restore-monorepo-structure
refactor/remove-sample-data-runtime-coupling
refactor/application-module-facades
feat/agent-runtime-kernel
feat/versioned-agent-skills
feat/context-memory-personalization
```

规则：

- 结构 PR 不夹带产品 UI；
- Schema PR 不夹带目录大移动；
- 每个 PR 有 before/after 依赖图、迁移说明和验证证据；
- 不 squash 已经有审计价值的语义提交；
- 不 force push；
- 每阶段先人工验收再固化；
- 只有产品 Gate 创建 verified Tag，纯清理或文档阶段不滥用 Gate Tag。

## 13. 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| 移动 sample package 时漏改脚本/tsconfig | 构建或测试失败 | 单独提交，使用 `rg`、workspace graph 和完整回归 |
| 产品服务继续依赖固定 Ref | 多学校/真实身份语义错误 | architecture test + 逐服务迁移 |
| 拆大服务时改变事务边界 | 数据不一致、重复 Proposal | 以事务用例拆分，PostgreSQL 幂等/并发测试 |
| Runtime 新旧状态重复 | 页面状态分裂 | compatibility facade，单一读取投影，禁止双写无对账 |
| Skill 版本仅存在配置文件 | 历史 Run 不可复现 | 发布元数据、hash 和 Run 绑定入库 |
| Memory 成为第二事实源 | 过期/越权/错误个性化 | Candidate + confirmation + provenance + expiry |
| 过早微服务化 | 部署和事务复杂度暴增 | 保持模块化单体，只有真实独立扩缩需求才拆进程 |
| 文档目标架构被误认为已实现 | 开发误判 | 所有目标文档标明状态，CURRENT 文档只写实际能力 |

## 14. 完成定义

新的长期维护基线完成时，应满足：

- 标准 pnpm monorepo 已恢复；
- 当前有效产品功能全部保留；
- 根目录无不具备真实职责的顶层；
- Sample/Test 数据和正式产品路径分离；
- Composition Root 只组装依赖；
- 模块通过 Application Port/Facade 协作；
- Agent 通过授权、版本化快照读取 Platform 数据；
- Run/Step/Checkpoint/Skill/Evaluation 有清晰模型；
- Memory 不成为第二真值源；
- Context Manifest 能解释使用了什么和缺少什么；
- 所有改动有自动化回归和可回退提交；
- 架构让 Codex 可以从用例、状态所有者和 Contract 快速定位代码。

## 15. 下一步建议

下一步不是立即实施未来 Agent Runtime，而是先评审三份架构文档。确认后只执行阶段 1 的低风险结构恢复，并在完整回归通过后停下来验收。

阶段 1 和阶段 2 不应合并成一个大 PR：目录正确不代表数据边界正确；先恢复物理结构，再逐项消除产品 sample coupling，能够把故障范围控制在可审计、可回退的尺度内。
