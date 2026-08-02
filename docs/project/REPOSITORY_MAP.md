# Edu-Agent 仓库结构地图

> 状态：CURRENT
> 基线：`gate-2-10a-verified`

本地图说明“代码应放在哪里”和“哪些目录只是运行产物”。更细的模块状态所有权见 [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md)。

## 1. 根目录总览

```text
Edu-Agent/
├─ apps/                    正式可部署应用
│  ├─ api/                  Express API、七模块、Composition Root、Worker
│  └─ web/                  React/Vite 教师门户
├─ packages/
│  ├─ contracts/            共享路由、DTO、Zod Schema
│  └─ test-fixtures/        合成 refs/seed 与测试夹具（存在产品依赖待清理）
├─ tests/                   跨 workspace 的测试套件
├─ scripts/                 Demo、PostgreSQL、安全和静态验证脚本
├─ infra/                   本地 Docker/PostgreSQL 配置
├─ docs/                    项目、产品、Demo、UI、验收文档
├─ output/                  本地生成/验收输出（Git ignored）
├─ .demo/                   本地数据库外运行状态和 ObjectStore（Git ignored）
├─ playwright-report*/      浏览器测试报告（Git ignored）
├─ test-results/            测试附件（Git ignored）
├─ node_modules/            pnpm 安装产物（Git ignored）
├─ package.json             根命令入口
├─ pnpm-workspace.yaml      workspace 定义
├─ *.config.ts              TypeScript / Vitest / Playwright / Drizzle 配置
├─ README.md                项目入口
└─ 教育智能体平台*.md       早期历史架构与第一轮计划
```

## 2. 正式产品代码

### `apps/api`

| 路径 | 职责 | 新代码放置规则 |
|---|---|---|
| `src/app.ts` | Express 路由装配、认证/CSRF、请求解析和安全错误映射 | 只做 HTTP adapter；业务规则进入 owning service |
| `src/composition/` | Product/Test Composition Roots、配置、Demo seed、Provider probe | 新 Adapter 的选择和运行时装配放这里；不要让领域 import SDK |
| `src/modules/<module>/domain/` | 领域对象、状态和 invariant（各目录实际细分略有差异） | 新领域对象进入拥有状态的既有模块 |
| `src/modules/<module>/application/` | Application Service、命令、读取服务、事务编排 | 正式写入和跨端口协调放这里 |
| `src/modules/<module>/infrastructure/` | PostgreSQL Repository、外部 Adapter、序列化 | Port 实现放这里，不把 SDK 类型泄漏给 domain/contracts |
| `src/platform/postgres/` | Migration registry、bootstrap、pool/role 支持 | 新 Migration 注册和数据库平台代码 |

当前七个模块目录：

```text
agent-runtime-context
artifact-collaboration
capability-integration
education-domain
identity-governance-audit
personalization-memory-analytics
work-assistant-durable-execution
```

不要为新业务创建第八模块，除非先有独立架构决策。状态必须放到现有 owning module，跨模块只通过 Port/Application Service/Outbox 协调。

### `apps/web`

| 路径 | 职责 | 新代码放置规则 |
|---|---|---|
| `src/pages/` | 一级页面和真实业务 workspace | 新页面状态从正式 API 读取；只有未保存表单/导航可放 React state |
| `src/components/` | 可复用视觉与业务组件 | 不在组件内建立第二套业务数组 |
| `src/api.ts` | 当前集中式、类型化 API client | 新产品调用复用 contracts route builder；后续可按域拆分但不能复制 |
| `src/route.ts` | 自定义 URL/parser/deep-link 状态 | 新深链加入这里并添加 route 测试 |
| `src/App.tsx` | 页面 lazy loading 和顶层 session/navigation | 不把领域逻辑堆入 App |

### `packages/contracts`

- `src/api-routes.ts`：服务端和 Web 共用的 URL 构造器；
- `src/gate*.ts` 及身份/文件等 contract 文件：Zod 请求响应、稳定 enum 和安全错误 DTO；
- `src/index.ts`：公开导出。

新增 API 时先在 Contracts 定义路由与 Zod，再实现 API adapter 和 Web client。禁止把 OpenAI/OIDC/PostgreSQL SDK 类型放入 Contracts。

## 3. Migration 与数据库

Migration 文件随 owning module 放置：

```text
apps/api/src/modules/<module>/infrastructure/postgres/migrations/*.sql
```

注册入口位于 `apps/api/src/platform/postgres/migration-registry.ts`。新增 Migration 必须：

1. 使用下一个模块内序号，不能改写已应用文件；
2. 进入 registry，并有 checksum/owner；
3. 可从空 PostgreSQL Volume 执行；
4. 对旧 Gate 数据前向兼容；
5. 通过 PGlite 和真实 PostgreSQL tests。

## 4. 测试专用代码

| 路径 | 内容 |
|---|---|
| `tests/unit/` | domain/service/adapter 单元测试 |
| `tests/architecture/` | 模块边界、Product/Test Composition Root、bundle/SDK 等约束 |
| `tests/e2e/` | Vitest HTTP/application E2E |
| `tests/integration/` | PGlite Migration 等集成验证 |
| `tests/postgres/` | 真实 PostgreSQL repository/lifecycle/transaction 测试 |
| `tests/playwright/` | 教师门户浏览器主流程与截图/下载验证 |
| `tests/live/` | 默认关闭、只使用合成数据的真实 Ark 集成测试 |
| `tests/node/` | Node walking skeleton smoke |
| `tests/support/` | 测试服务器、隔离环境与辅助工具 |
| `tests/fixtures/` | 测试输入文件；不得放 Secret 或貌似真实的 Key |

Gate 1A 的内存 Repository 和 Test Container 仍服务隔离测试；它们不是产品 fallback。`packages/test-fixtures` 被 Product Composition 使用合成 demo seed 是当前命名/依赖债，见清理计划。

## 5. 脚本与基础设施

| 路径 | 内容 |
|---|---|
| `scripts/postgres/` | dev database lifecycle、隔离 E2E Compose Project、Migration/测试启动 |
| `scripts/demo/` | Demo doctor、seed/dev/test server、Playwright 隔离、bundle analysis |
| `scripts/security/` | Secret scan |
| `scripts/gate1a-static-check.mjs` | 历史与当前架构静态断言 |
| `scripts/verify-version-history.ts` | 版本文档、commit/tag/link 的离线一致性检查 |
| `infra/docker/` | PostgreSQL 18 Compose、角色和本地环境模板 |

长期开发数据库使用稳定 Compose project/volume；测试创建 `edu-agent-e2e-*` 临时资源。任何删除开发 volume 的命令必须显式 `ALLOW_DESTRUCTIVE_DB_RESET=1`。

## 6. 文档结构

| 路径 | 读者与状态 |
|---|---|
| `docs/project/` | 当前状态、版本、架构、仓库、清理和部署差距；优先阅读 |
| `docs/product/` | 各 Gate 的产品语义、功能矩阵和验收设计 |
| `docs/demo/` | 本地演示与身份/模型/数据库运行说明 |
| `docs/verification/` | 安全脱敏的验收记录 |
| `docs/ui/` | UI 规格、Design Token 与验收图片 |
| 根目录中文文档 | v0.3.x 与第一轮历史架构资料；HISTORICAL/SUPERSEDED，不代表当前代码 |

总入口：[docs/README.md](../README.md)。新增 Gate 文档放 `docs/product/GATE_<编号>_<主题>.md`，项目横切现状放 `docs/project/`，可提交的验收摘要放 `docs/verification/`。

## 7. 本地 Demo 与 Git-ignored 运行文件

| 路径 | 是否正式源码 | 生命周期 |
|---|---|---|
| `.env.local` | 否；Secret 配置 | Git ignored，测试不得读取输出或删除 |
| `.demo/uploads/objects` | 否；开发 LocalObjectStore 数据 | 持久保留，Demo/E2E 不得清空 |
| `.demo/e2e/<run-id>` | 否；隔离测试数据 | 只清理已解析并验证的当前 run 目录 |
| `.demo/live-model-reports` | 否；脱敏 live 摘要 | Git ignored、有界信息，不含内容/Secret |
| `output/` | 否；本地生成/验收产物 | Git ignored；不能当作产品真值 |
| `playwright-report*`、`test-results` | 否；测试报告 | Git ignored，可重建 |
| `apps/*/dist`、`packages/*/dist` | 否；构建输出 | Git ignored，可重建 |

## 8. 快速定位清单

- 新领域对象：`apps/api/src/modules/<owning-module>/domain`，并更新模块 application/repository/architecture test；
- 新 Migration：owning module 的 `infrastructure/postgres/migrations` + migration registry；
- 新 API Contract：`packages/contracts/src` + `api-routes.ts`；
- 新 API Handler：`apps/api/src/app.ts` 或对应 HTTP adapter，业务放 Application Service；
- 新教师页面：`apps/web/src/pages` + lazy route + typed `api.ts` client；
- 新单元/架构/数据库/浏览器测试：对应 `tests/*` 目录；
- 新 Gate 文档：`docs/product`；
- 新项目横切文档：`docs/project`；
- 新本地运行文件：必须放已忽略且与 E2E 隔离的目录，不能提交到仓库。

## 9. 历史和可能过时区域

已核实但本轮不删除的候选包括：八个未路由旧 Page、未引用 Inspector/Student components、只被旧 Page 使用的 `demo-read-model.ts`、被产品依赖的 `test-fixtures` 命名边界、仍保留的 Gate 1A exports、历史演示脚本，以及多份状态已过时的 Gate 文档。完整证据和风险见 [REPOSITORY_CLEANUP_PLAN.md](REPOSITORY_CLEANUP_PLAN.md)。
