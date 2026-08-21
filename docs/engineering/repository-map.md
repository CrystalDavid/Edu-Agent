# Edu-Agent 仓库结构地图

> 状态：CURRENT SUPPORTING GUIDE
> 最新产品基线：`gate-2-10a-verified`

本地图回答“文件应放在哪里”。首要入口是根 [项目 README](../../README.md)，状态所有权和数据流以 [当前架构](../architecture/README.md) 为准。

## 根目录

```text
Edu-Agent/
├── README.md / CHANGELOG.md
├── AGENTS.md / SECURITY.md / CONTRIBUTING.md
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   ├── contracts/
│   ├── sample-data/
│   └── test-fixtures/
├── infra/
│   ├── local/
│   └── postgres/
├── scripts/
├── tests/（专用测试配置位于 `tests/config/`）
├── docs/
├── .env.example
├── package.json / pnpm-lock.yaml / pnpm-workspace.yaml
└── 工具自动发现的默认 TypeScript、Vitest、Playwright、Drizzle 配置
```

根目录不再放阶段性研究、Gate 计划、UI 规格、专用测试配置或测试输出。新的当前文档按 [文档入口](../README.md) 分工，详细历史进入 `docs/history/`。

## `apps/api` — 服务端和七模块

| 路径 | 作用 |
|---|---|
| `src/index.ts` | API 进程入口、端口与启动失败处理 |
| `src/app.ts` | Express application、middleware、auth 和 route 组合 |
| `src/composition/` | Product Composition Root、Application Service、Worker 组装；不包含 Sample Seed |
| `src/database/migrations.ts` | 43 个 Verified 基线 + 8 个后续前向 Migration 的唯一 registry（当前 51 个） |
| `src/platform/` | PostgreSQL、auth、errors、server 等平台 Adapter |
| `src/modules/` | 七个状态所有者模块 |

每个模块通常包含：

```text
apps/api/src/modules/<module>/
├── application/                Application Service / use case
├── domain/                     领域类型和规则
└── infrastructure/
    ├── migrations/             该模块只向前 SQL Migration
    └── postgres-*.ts           Repository Adapter
```

实际目录按模块复杂度略有不同。Migration 统一位于 `<module>/infrastructure/migrations/`；不要创建 `infrastructure/postgres/migrations` 或第二个 registry。执行器是 `apps/api/src/platform/postgres/bootstrap.ts`。

七模块：

- `identity-governance-audit` → `governance`；
- `work-assistant-durable-execution` → `work`；
- `agent-runtime-context` → `runtime`；
- `capability-integration` → `capability`；
- `artifact-collaboration` → `artifact`；
- `education-domain` → `education`；
- `personalization-memory-analytics` → `personalization`。

正式写入只能发生在 owning module。Composition Service 可以编排多个 Port/transaction，但不能用跨 Schema SQL 绕过所有权。

## `apps/web` — 教师门户

| 路径 | 作用 |
|---|---|
| `src/main.tsx` | 浏览器入口 |
| `src/App.tsx` | Session/bootstrap 与现行 Page lazy composition |
| `src/route.ts` | `AppRoute`、URL 解析和导航 |
| `src/pages/` | 当前 `Teacher*Page`、Workspace 和业务详情页 |
| `src/components/portal/` | 教师门户功能组件 |
| `src/api.ts` | 当前单一 API client；后续可在保留 transport 契约后按领域拆分 |
| `public/images/` | 正式界面静态图片；当前包含教师头像 |
| `public/fonts/` | 正式字体、Attribution 和许可证 |

旧的未路由 Page、Inspector/Student legacy components 和 `demo-read-model.ts` 已在清理分支删除。新增页面必须同时进入 `route.ts`、`App.tsx` 和回归测试，不能只创建文件。

## `packages` — 共享边界

| Package | 消费者 | 内容边界 |
|---|---|---|
| `@edu-agent/contracts` | Web、API、tests | route builder、DTO、enum、Zod Schema；不含 Repository/UI |
| `@edu-agent/sample-data` | `scripts/sample`、Gate 2 tests | stable anonymous refs/data；产品 API/Web 不依赖 |
| `@edu-agent/test-fixtures` | tests | Gate 1A/1B 测试构造器；`apps/*` 不得依赖 |

稳定依赖方向：

```text
apps/web -> contracts
apps/api      -> contracts + product SDKs
scripts/sample -> contracts + sample-data + API repository adapters
tests         -> contracts + sample-data + test-fixtures
```

## `infra` 与 Migration

- `infra/local/postgres/compose.postgres.yml`：PostgreSQL 18 本地编排；
- `infra/local/postgres/.env.example`：无 Secret 模板；
- `infra/local/postgres/.env.local`：脚本生成的本地凭据，Git ignored；
- `infra/postgres/migration-ownership.md`：Schema owner、app/worker role 和 Migration 规则。

43 个 Verified 基线 Migration 分布：runtime 6、artifact 9、capability 6、education 6、governance 6、personalization 1、work 9。其后只追加 8 个前向文件，当前 registry 为 51；既有文件不可修改、合并、重排或重命名。Scoped Preference 的共享 Contract 位于 `packages/contracts/src/memory-scope.ts`，Personalization Resolver/授权 Port 位于该模块的 `domain/` 与 `application/`，跨 Schema 校验 Adapter 位于 `apps/api/src/composition/teacher-preference-scope-authorization-adapter.ts`。

显式 remember 的共享 Contract 位于 `packages/contracts/src/memory-command.ts`；低风险 Catalog 与纯 Interpreter 分别位于 Personalization Domain 的 `teacher-preference-catalog.ts` 和 `explicit-teacher-memory-command.ts`；typed 写入 Port 位于 `application/explicit-teacher-memory-command-service.ts`；Work/Personalization 编排位于 `apps/api/src/composition/postgres-conversation-dispatch-service.ts`。Work `0013_explicit_memory_command_turn.sql` 只扩展 immutable Turn 的合法 command 组合与有界结果 refs，不创建第二个 Migration registry，也不让 Work 直接写 Personalization。

显式 forget 继续使用 `memory-command.ts` 的兼容 union；纯 Interpreter、typed revoke Port 和服务端 flag 分别位于 `explicit-teacher-forget-command.ts`、`application/explicit-teacher-forget-command-service.ts` 与 `infrastructure/memory-explicit-forget-config.ts`。确认入口仍由 Conversation Composition 协调，只接受持久化 receipt refs 的子集。PR-2C1 不新增 Migration，现有 51 个文件保持不变。

正式 temporary override 的共享 Contract 位于 `packages/contracts/src/temporary-memory-override.ts`；纯 Runtime Interpreter、typed Catalog Port、WorkingMemory V2 与 Pack V3 分别位于 `agent-runtime-context/domain/explicit-temporary-preference-override.ts`、`application/temporary-preference-catalog-port.ts`、`domain/working-memory.ts` 和 `domain/memory-context-pack.ts`。Composition Adapter 只读复用 Personalization Catalog；`lesson-preparation@7` 是唯一接入 Skill。PR-2C2 复用 Runtime 0007 的 JSONB，不新增 Migration，registry 保持 51。

## `scripts` 与稳定命令

脚本实现按职责分为 `local/`、`testing/`、`quality/`、`postgres/` 和 `security/`；仓库级 verifier 位于 `scripts/` 根。公共入口只在根 `package.json` 注册，并由 [开发指南](README.md) 说明。

不要直接恢复或复制已经失效的旧启动脚本。浏览器测试使用隔离 `test:playwright`，长期数据重置必须显式使用受保护的 `app:reset`。

## `tests`

| 目录 | 证明范围 |
|---|---|
| `unit/`、`gate2/` | 纯逻辑和 Contract |
| `architecture/` | 模块/Schema/Ingress/安全不变量 |
| `e2e/` | 无浏览器 HTTP skeleton |
| `integration/` | PGlite Migration |
| `node/` | Gate 1A Test Container |
| `postgres/` | 临时真实 PostgreSQL |
| `playwright/` | 隔离浏览器业务流程 |
| `live/` | 显式 opt-in 真实 Provider |
| `fixtures/`、`support/` | 测试数据、Fake Ark 和 loader |
| `config/` | 专用 Playwright/Vitest 配置和仓库外产物路径策略 |

详细隔离语义见 [验证指南](validation.md)。Gate 1A Test Container 虽不是产品 Composition Root，仍被测试使用，不属于可删除遗留代码。

## `docs`

```text
docs/
├── README.md
├── capabilities.md / roadmap.md / version-history.md
├── architecture/
├── engineering/
├── operations/
├── ui/
└── history/
    ├── architecture/
    ├── gates/
    ├── project/
    ├── research/
    └── ui/
```

- 当前架构只进入 `architecture/`，当前 UI 只进入 `ui/`；
- 开发、仓库地图和验证说明进入 `engineering/`；
- Gate 2.10B 详细差距放 `operations/`；
- 阶段报告、早期研究和旧 UI 记录进入 `history/`；
- `history/` 不是工程 Agent 的默认阅读范围；
- ADR 通过 `architecture/decisions/` 的新增文件演进，不覆写旧决策；
- 文档移动后运行 `verify:markdown-links`。

## Git ignored 本地内容

| 路径 | 用途 | 清理边界 |
|---|---|---|
| `.env.local` | 本机模型/身份配置 | 不提交、不自动删除 |
| `infra/local/postgres/.env.local` | 本地数据库凭据 | 不提交，由脚本创建 |
| `.local-data/object-store` | 长期开发 LocalObjectStore | 不能当缓存删除 |
| `.local-data/*` 其他内容 | 日志、报告和本机运行状态 | 不提交，按用途人工判断 |
| `node_modules/`、`dist/` | 安装/构建产物 | 可重建，不提交 |
| `C:\Code\test\edu-agent\playwright` | Windows 测试报告、结果、Trace、Video 和截图 | 仓库外生成，不提交 |
| `EDU_AGENT_TEST_OUTPUT_ROOT` | 跨平台自定义测试产物根目录 | 可选环境变量，不提交 |
| 旧根目录测试产物 | 可再生报告、结果和浏览器状态 | 已移出仓库；当前没有可验证的长期外部归档 |

## 快速定位

- 新 Route/DTO：`packages/contracts/src`；
- 新 HTTP endpoint：`apps/api/src/app.ts` + owning Application Service；
- 新领域状态：owning module + 新 Migration + registry；
- 新模型/存储身份 Adapter：`capability-integration` 或 platform Port/Adapter；
- 新 Page：`apps/web/src/pages` + `route.ts` + `App.tsx`；
- 新匿名样例数据：`packages/sample-data`；业务专用 Seed 只由 `scripts/sample` 显式组合；
- 新测试构造器/Fake：`packages/test-fixtures`、`tests/fixtures` 或 `tests/support`；
- 当前功能说明：`docs/capabilities.md`；
- 未来计划：`docs/roadmap.md`；
- 当前 UI 规范：`docs/ui/README.md`；
- 详细历史：`docs/history/`（仅在明确追溯时读取）。
