# Edu-Agent 开发指南

> 状态：CURRENT

本文是开发者和工程 Agent 的仓库导航与稳定命令入口。产品不变量见 [Agent 指南](../AGENTS.md)，当前架构见 [当前架构](architecture.md)。

## 环境与安装

本轮验证环境：Node.js `24.14.0`、pnpm `11.9.0`、Docker `29.6.2`、Docker Compose `5.3.1`。项目使用 `packageManager` 固定 pnpm 版本，建议通过 Corepack 调用。

```powershell
cd D:\03_Edu-Agent
corepack pnpm install --frozen-lockfile
corepack pnpm app:doctor
```

根 `.env.example` 只说明变量；真实本机配置放 `.env.local`。本地 PostgreSQL 环境由脚本生成 `infra/local/postgres/.env.local`，两者都被 Git 忽略。

## 代码与文档定位

| 要修改什么 | 从哪里开始 | 共同检查 |
|---|---|---|
| HTTP route / middleware | `apps/api/src/app.ts` | contracts、auth、route order、HTTP tests |
| 服务组装 / Application Service | `apps/api/src/composition/` | owning module Port、transaction/outbox、PostgreSQL tests |
| 模块状态 / Repository | `apps/api/src/modules/<module>/` | Schema ownership、Migration、architecture tests |
| Migration | `<module>/infrastructure/migrations/` + `apps/api/src/database/migrations.ts` | 序号、owner、43 个历史文件不变 |
| Web 页面 / 路由 | `apps/web/src/App.tsx`、`route.ts`、`pages/` | lazy import、AppRoute、Playwright |
| Web API client | `apps/web/src/api.ts` | shared transport/error/session、contract、build |
| DTO / Zod / route builder | `packages/contracts/src/` | Web/API/tests 的兼容性 |
| 匿名示例数据 | `packages/sample-data` 或 API composition 的领域专用 sample fixture | 不含断言/真实学校数据 |
| 测试构造器 | `packages/test-fixtures`、`tests/fixtures`、`tests/support` | 产品不得依赖 |
| 专用测试配置 | `tests/config` | 根目录只保留工具自动发现的默认配置 |
| 本地生命周期 | 根 `package.json` → `scripts/local` / `scripts/postgres` | 不删除长期 DB/ObjectStore |
| 当前事实文档 | `docs/capabilities.md` / `architecture.md` | 不在历史文档重复维护 |

更细的路径见 [仓库结构地图](project/repository-map.md)。

## 稳定命令

### 本机应用与可选示例数据

| 命令 | 作用 |
|---|---|
| `corepack pnpm app:doctor` | 检查 Node/pnpm、Docker、端口和本地环境；只读诊断 |
| `corepack pnpm app:prepare` | 启动 PostgreSQL并执行 Migration；不写入示例业务数据 |
| `corepack pnpm app:dev` | 启动当前数据库上的 API/Web/Worker；不自动 Seed |
| `corepack pnpm sample:seed` | 显式、幂等写入匿名示例学校与课程 |
| `corepack pnpm sample:dev` | 首次体验入口：准备环境、写入示例数据并启动应用 |
| `corepack pnpm app:down` | 关闭开发数据库容器，保留 Volume |
| `corepack pnpm app:reset` | 显式重置本机数据库；具有破坏性，需理解保护条件 |
| `corepack pnpm dev` | `app:dev` 的稳定别名 |

### 构建与验证

| 命令 | 作用 |
|---|---|
| `corepack pnpm typecheck` | 构建本地共享包后检查全部 workspace |
| `corepack pnpm build` | 所有 workspace production build |
| `corepack pnpm analyze:bundle` | 分析已构建的 Web 初始图和最大 chunk |
| `corepack pnpm test` | 默认非 live、非真实 PostgreSQL Vitest 套件 |
| `corepack pnpm test:unit` | unit 与 Gate 2 contract |
| `corepack pnpm test:architecture` | 模块、权限、Schema 和产品不变量 |
| `corepack pnpm test:static` | 文件/源码级静态断言 |
| `corepack pnpm test:e2e` | HTTP walking skeleton |
| `corepack pnpm test:node-smoke` | Node 原生 Gate 1A 路径 |
| `corepack pnpm test:migrations` | PGlite Migration |
| `corepack pnpm test:postgres` | 临时真实 PostgreSQL 集成测试 |
| `corepack pnpm test:playwright` | 隔离默认浏览器回归 |
| `corepack pnpm test:ark-fake` | 隔离 Fake Ark 浏览器回归 |
| `corepack pnpm test:secrets` | 跟踪文件 Secret 扫描 |
| `corepack pnpm verify:version-history` | Commit/Tag/Gate 文档证据 |
| `corepack pnpm verify:markdown-links` | Markdown 本地链接 |
| `corepack pnpm verify:repo-sync` | Git 跟踪、忽略、禁止目录、upstream/HEAD |

### 真实模型

`model:probe:live` 和 `test:model:live` 只在用户明确配置 `.env.local`、同意真实调用和成本后运行。严格模式不能把 skipped、Mock 或 Fake Ark 当作 live 成功。

## 数据库生命周期

- `db:up` / `db:down` 管理长期开发 PostgreSQL；
- `db:migrate` 只向前执行 registry 中 Migration；
- `db:clean` 和 `app:reset` 是显式破坏性入口；
- `test:postgres` 与 Playwright 使用独立 Compose project、端口和 Volume；
- `.local-data/object-store` 是长期本机文件，不随普通测试或清理删除。

Playwright 的报告、结果、Trace、Video 和截图使用 `tests/config/test-artifacts.ts` 解析外部路径：Windows 优先 `C:\Code\test\edu-agent\playwright`，也可设置 `EDU_AGENT_TEST_OUTPUT_ROOT`；这些产物不进入仓库根目录。

详细本地流程见 [运维指南](operations.md) 和 [本机运行指南](operations/local-environment.md)。

## 新增能力时的路径

1. 先确定 owning module 和状态不变量；
2. 先改 `packages/contracts` 的边界，再实现 API/Service/Repository；
3. 需要数据库时追加 Migration 并登记；
4. 通过 Composition Root 注入 Port/Adapter；
5. Web 只消费类型化 API，不直接表达数据库/模型内部状态；
6. 增加 unit/architecture/PostgreSQL/Playwright 中最接近风险的回归；
7. 更新当前权威文档和 `CHANGELOG.md` / `version-history.md`（仅完成 Gate 时）。

## 已知维护热点

以下文件较大，但本轮不因行数机械拆分：

- `apps/web/src/api.ts`；
- `apps/api/src/app.ts`；
- `apps/api/src/composition/postgres-model-invocation-service.ts`；
- 大型 Composition Service、Repository、Contract 和页面；
- `apps/web/src/pages/TeachingWorkspacePage.tsx`。

后续拆分必须先固定公共契约和依赖图，保持 route/middleware 顺序、Schema 单一真值和业务语义，并有回归测试。具体延期见 [目标仓库结构](project/target-repository-structure.md)。
