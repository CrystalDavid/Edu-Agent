# Edu-Agent 仓库结构地图

> 状态：CURRENT SUPPORTING GUIDE
> 最新产品基线：`gate-2-10a-verified`

本地图回答“文件应放在哪里”。首要入口是根 [README](../../README.md)，状态所有权和数据流以 [ARCHITECTURE](../ARCHITECTURE.md) 为准。

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
│   ├── demo-fixtures/
│   └── test-fixtures/
├── infra/
├── scripts/
├── tests/
├── docs/
├── .env.example
├── package.json / pnpm-lock.yaml / pnpm-workspace.yaml
└── TypeScript、Vitest、Playwright、Drizzle 配置
```

根目录不再放阶段性研究、Gate 计划或 UI 规格。新的当前文档按 [docs/README](../README.md) 分工，详细历史进入 `docs/history/`。

## `apps/api` — 服务端和七模块

| 路径 | 作用 |
|---|---|
| `src/index.ts` | API 进程入口、端口与启动失败处理 |
| `src/app.ts` | Express application、middleware、auth 和 route 组合 |
| `src/composition/` | Product Composition Root、Application Service、Worker 组装、Demo seed |
| `src/database/migrations.ts` | 43 个 Migration 的唯一 registry |
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
| `src/teacher-portal-data.ts` | 仍被使用的显式 Demo/READ_ONLY Portal 数据 |
| `public/fonts/` | 正式字体、Attribution 和许可证 |

旧的未路由 Page、Inspector/Student legacy components 和 `demo-read-model.ts` 已在清理分支删除。新增页面必须同时进入 `route.ts`、`App.tsx` 和回归测试，不能只创建文件。

## `packages` — 共享边界

| Package | 消费者 | 内容边界 |
|---|---|---|
| `@edu-agent/contracts` | Web、API、tests | route builder、DTO、enum、Zod Schema；不含 Repository/UI |
| `@edu-agent/demo-fixtures` | API local demo、Gate 2 tests | stable synthetic refs/data；无断言或 Fake Provider |
| `@edu-agent/test-fixtures` | tests | Gate 1A/1B 测试构造器；`apps/*` 不得依赖 |

稳定依赖方向：

```text
apps/web -> contracts
apps/api -> contracts + demo-fixtures
tests    -> contracts + demo-fixtures + test-fixtures
```

## `infra` 与 Migration

- `infra/docker/compose.postgres.yml`：PostgreSQL 18 本地编排；
- `infra/docker/.env.example`：无 Secret 模板；
- `infra/docker/.env.local`：脚本生成的本地凭据，Git ignored；
- `infra/postgres/MIGRATION_OWNERSHIP.md`：Schema owner、app/worker role 和 Migration 规则。

43 个历史 Migration 分布：runtime 6、artifact 9、capability 6、education 6、governance 6、personalization 1、work 9。历史文件不可修改、合并、重排或重命名。

## `scripts` 与稳定命令

脚本实现按职责分为 `demo/`、`postgres/` 和 `security/`；仓库级 verifier 位于 `scripts/` 根。公共入口只在根 `package.json` 注册，并由 [DEVELOPMENT](../DEVELOPMENT.md) 说明。

不要直接恢复或复制已经失效的 `run-demo-fresh.mjs`。安全替代是隔离 `test:playwright`，长期数据重置则必须显式使用受保护的 `demo:reset`。

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

详细隔离语义见 [VALIDATION](../VALIDATION.md)。Gate 1A Test Container 虽不是产品 Composition Root，仍被测试使用，不属于可删除遗留代码。

## `docs`

```text
docs/
├── README.md
├── ARCHITECTURE.md / CAPABILITIES.md / VERSION_HISTORY.md
├── ROADMAP.md / DEVELOPMENT.md / VALIDATION.md / OPERATIONS.md
├── adr/
├── demo/
├── operations/
├── project/
└── history/
    ├── gates/
    ├── research/
    └── ui/
```

- 当前事实只进入根层权威文档；
- 项目同步/清理/研究记录放 `project/`；
- Gate 2.10B 详细差距放 `operations/`；
- Gate、早期研究和 UI 记录进入 `history/`；
- ADR 通过新增文件演进，不覆写旧决策；
- 文档移动后运行 `verify:markdown-links`。

## Git ignored 本地内容

| 路径 | 用途 | 清理边界 |
|---|---|---|
| `.env.local` | 本机模型/身份配置 | 不提交、不自动删除 |
| `infra/docker/.env.local` | 本地数据库凭据 | 不提交，由脚本创建 |
| `.demo/uploads/objects` | 长期开发 LocalObjectStore | 不能当缓存删除 |
| `.demo/*` 其他内容 | 日志、报告、Demo 状态 | 不提交，按用途人工判断 |
| `node_modules/`、`dist/` | 安装/构建产物 | 可重建，不提交 |
| `playwright-report*/`、`test-results/` | 测试报告 | 可重建，不提交 |
| `output/playwright/` | 本地验收截图 | 不提交，是否删除由用户决定 |
| `.playwright-cli/` | 浏览器自动化临时状态 | 可重建，不提交 |

## 快速定位

- 新 Route/DTO：`packages/contracts/src`；
- 新 HTTP endpoint：`apps/api/src/app.ts` + owning Application Service；
- 新领域状态：owning module + 新 Migration + registry；
- 新模型/存储身份 Adapter：`capability-integration` 或 platform Port/Adapter；
- 新 Page：`apps/web/src/pages` + `route.ts` + `App.tsx`；
- 新 synthetic Demo 数据：`packages/demo-fixtures` 或 API 领域专用 demo fixture；
- 新测试构造器/Fake：`packages/test-fixtures`、`tests/fixtures` 或 `tests/support`；
- 当前功能说明：`docs/CAPABILITIES.md`；
- 未来计划：`docs/ROADMAP.md`；
- 详细历史：`docs/history/`。

目标结构和明确延期项见 [TARGET_REPOSITORY_STRUCTURE](TARGET_REPOSITORY_STRUCTURE.md)。
