# Edu-Agent Agent 工作指南

本文件适用于 Codex、Claude Code 和其他工程 Agent，作用域为整个仓库。它只给出可执行边界和稳定入口；产品与架构细节通过链接读取，不在这里复制。

## 任务前先读

1. [README.md](README.md)：产品定位、业务闭环和当前限制；
2. [docs/CAPABILITIES.md](docs/CAPABILITIES.md)：REAL / PARTIAL / MOCK 状态；
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：七模块、Schema ownership 和数据流；
4. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)：目录、命令和修改路径；
5. 与任务直接相关的 ADR、Gate 历史或局部 README。

最新产品基线是 Gate 2.10A / `gate-2-10a-verified`。当前是普通教师端本地功能型 MVP，不得把尚未完成的云部署、学生端、考试或多模态写成已有能力。

## 七模块与状态所有权

| 模块 | Schema | 主要正式状态 |
|---|---|---|
| `identity-governance-audit` | `governance` | 身份、学校、成员、角色、Session、Authorization、Audit |
| `work-assistant-durable-execution` | `work` | Task/Run、Todo、Calendar、工作投影、Outbox effect |
| `agent-runtime-context` | `runtime` | AgentRun、授权上下文计划、ContextManifest |
| `capability-integration` | `capability` | 模型执行、Prompt/预算、Provider、ObjectStore Port |
| `artifact-collaboration` | `artifact` | Proposal、TeachingPlan、Reflection、文件和 Revision |
| `education-domain` | `education` | 课程、课时、作业、提交、批改、Evidence、实施和观察 |
| `personalization-memory-analytics` | `personalization` | 当前仅 Schema/Port 骨架 |

## 不可违反的不变量

- 正式状态只能由所属模块写入；禁止跨 Schema 直接写。
- 跨模块协作必须经过 Port、Application Service、Outbox 或明确的 Composition Service。
- Runtime 负责运行、上下文和解释，不直接修改 TeachingPlan、Grade、Evidence、LessonDelivery、Observation 或 Reflection 等领域状态。
- Agent 输出默认是 `Proposal` 或 `Draft`；生成、建议、接受建议、实施和正式确认是不同状态。
- 教师拥有最终控制权；不得通过 UI shortcut、后台 Worker 或测试便利绕过显式审批。
- 每次 Agent 运行重新解析 ActingContext、purpose、scope 和 field mask；上下文不构成永久授权。
- Evidence 保留来源、未知项、置信度和历史；不得静默转成永久 learner 标签。
- 跨学校访问必须 fail closed，且不得通过错误消息泄漏资源是否存在。
- Production 配置失败不得静默回 Mock、local identity 或 demo bypass。
- Audit、Authorization、Outbox 和 Revision 历史不可通过“清理”覆盖或删除。

## 主要目录

- `apps/api`：API、Composition Root、Worker、模块和 Migration；
- `apps/web`：当前教师门户、路由和 API client；
- `packages/contracts`：Web/API 共享协议唯一入口；
- `packages/demo-fixtures`：本地产品 Demo 的 stable synthetic 数据；
- `packages/test-fixtures`：测试专用构造器；产品不得依赖；
- `infra`：本地 PostgreSQL 与所有权说明；
- `scripts`：通过根 package scripts 调用的编排器；
- `tests`：跨 workspace 验证；
- `docs`：当前权威文档、ADR、运维和历史。

## 稳定命令入口

从仓库根目录使用 Corepack：

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm demo:doctor
corepack pnpm demo:dev
corepack pnpm demo:down
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:unit
corepack pnpm test:architecture
corepack pnpm test:static
corepack pnpm test:postgres
corepack pnpm test:playwright
corepack pnpm test:ark-fake
corepack pnpm test:secrets
corepack pnpm build
corepack pnpm analyze:bundle
corepack pnpm verify:version-history
corepack pnpm verify:markdown-links
corepack pnpm verify:repo-sync
```

不要猜测并直接调用内部脚本；先检查根 `package.json` 和 [scripts/README.md](scripts/README.md)。数据库清理命令必须保持显式、可识别且 fail closed，普通测试不得间接重置长期开发 Volume。

## Migration 规则

- 43 个历史 Migration 只向前、不可修改、不可合并、不可重排、不可重命名。
- 新 Migration 放入 owning module 的 `infrastructure/migrations/`，使用下一个序号。
- 同步更新 `apps/api/src/database/migrations.ts`；不要建立第二个 registry。
- Migration 以受限 owner 执行；app/worker role 权限不得扩大。
- 修改数据库前至少运行 `test:migrations`、`test:architecture` 和 `test:postgres`。
- 详细规则见 [infra/postgres/MIGRATION_OWNERSHIP.md](infra/postgres/MIGRATION_OWNERSHIP.md)。

## Contracts 规则

- 路由、DTO、枚举和 Zod Schema 的共享真值放在 `packages/contracts`。
- Web 与 API 不得复制同一 Schema 或用 `any` 绕过解析。
- 保持现有 export 和 wire format；破坏性变更需要兼容层或独立 ADR。
- Gate 命名的历史文件可渐进整理，但不能为了文件名整齐改变公共契约。
- 修改 Contract 后同时检查 Web、API、tests 和文档消费者。

## Demo 与测试数据

- 所有数据必须明确为 synthetic；不得使用真实学校、教师或学生资料。
- `demo-fixtures` 可被产品本地 Demo 和测试复用，但不得含断言、fake behavior 或 test runner 逻辑。
- `test-fixtures` 只供测试；`apps/*` 不得依赖它。
- Fake Ark、Mock Provider 响应和 Playwright 专用行为属于 `tests/support` 或测试目录。
- 不复制两套可能漂移的 Demo 数据；优先共享稳定 refs/values。

## 测试要求

按改动风险选择最低验证，不以单个 `typecheck` 代替业务回归：

| 改动 | 最低验证 |
|---|---|
| 纯文档 | `verify:markdown-links`、相关 verifier、`git diff --check` |
| Web Page/路由/API client | `typecheck`、`test`、`build`、相关 Playwright |
| Contract | `typecheck`、`test`、`test:architecture`、相关 PostgreSQL/Playwright |
| API/Application Service | `typecheck`、`test`、`test:architecture`、`test:postgres` |
| Migration/Repository | 上述全部，加 `test:migrations` 和真实 PostgreSQL |
| 模型 Provider | Fake Ark 测试；只有用户明确配置时才运行 live probe |
| 仓库/脚本 | `test:secrets`、`verify:repo-sync`、`verify:markdown-links`、相关启动测试 |

任务结束前始终运行 `git diff --check`，检查 43 个 Migration 未修改，并确认临时 E2E 资源已清理。

## Git 与 PR

- 从最新 `main` 创建有主题的分支，使用语义化小提交；只暂存任务相关的明确路径。
- 不使用 `git add .` / `git add -A`，不覆盖用户已有改动。
- 不 force push、重写已共享历史、自动合并 PR 或自行创建 Verified Gate Tag，除非用户明确授权。
- 文档/清理提交不构成产品 Gate；Tag 只在完整 Gate 验收后创建。
- Draft PR 必须说明改动、风险、测试、Migration 状态和人工检查点。

## Secret、本地状态与生成物

- Secret 只放 `.env.local`、部署平台 Secret 或其他已批准的本地/外部存储。
- `.env.example` 只能放空值或安全占位，不得提交 Key、Token、Cookie、真实 DSN 或私钥。
- 不输出或提交模型完整 Prompt/响应、OIDC Token、API Key、学生资料或数据库备份。
- 不提交 `.demo/`、LocalObjectStore、`node_modules/`、`dist/`、`.playwright-cli/`、reports、`test-results/` 或 `output/playwright/`。
- 不删除 `.env.local`、长期开发数据库、`apps/api/.demo/uploads/objects` 或用户验收资料；仅在目标明确且用户授权时清理可再生缓存。

## 完成任务时更新什么

- 当前能力变化：`docs/CAPABILITIES.md`；
- 架构/状态所有权变化：`docs/ARCHITECTURE.md`，必要时新增 ADR；
- 已完成 Gate：`docs/VERSION_HISTORY.md` 和 `CHANGELOG.md`；
- 未来工作：只更新 `docs/ROADMAP.md`；
- 命令/目录变化：`README.md`、`docs/DEVELOPMENT.md` 和相关局部 README；
- 运维边界变化：`docs/OPERATIONS.md` / `docs/operations/`；
- 不把历史 Gate 文档改写成当前事实，移动后必须修复链接。
