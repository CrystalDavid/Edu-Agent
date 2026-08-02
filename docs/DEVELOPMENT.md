# Edu-Agent 开发指南

> 状态：CURRENT

本文是开发者和工程 Agent 的仓库导航与稳定命令入口。产品不变量见 [AGENTS](../AGENTS.md)，当前架构见 [ARCHITECTURE](ARCHITECTURE.md)。

## 环境与安装

本轮验证环境：Node.js `24.14.0`、pnpm `11.9.0`、Docker `29.6.2`、Docker Compose `5.3.1`。项目使用 `packageManager` 固定 pnpm 版本，建议通过 Corepack 调用。

```powershell
cd D:\03_Edu-Agent
corepack pnpm install --frozen-lockfile
corepack pnpm demo:doctor
```

根 `.env.example` 只说明变量；真实本机配置放 `.env.local`。本地 PostgreSQL 环境由脚本生成 `infra/docker/.env.local`，两者都被 Git 忽略。

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
| 产品 synthetic Demo | `packages/demo-fixtures` 或 API composition 的领域专用 Demo fixture | 不含断言/真实数据 |
| 测试构造器 | `packages/test-fixtures`、`tests/fixtures`、`tests/support` | 产品不得依赖 |
| 本地生命周期 | 根 `package.json` → `scripts/demo` / `scripts/postgres` | 不删除长期 DB/ObjectStore |
| 当前事实文档 | `docs/CAPABILITIES.md` / `ARCHITECTURE.md` | 不在历史文档重复维护 |

更细的路径见 [仓库结构地图](project/REPOSITORY_MAP.md)。

## 稳定命令

### 本地 Demo

| 命令 | 作用 |
|---|---|
| `corepack pnpm demo:doctor` | 检查 Node/pnpm、Docker、端口和本地环境；只读诊断 |
| `corepack pnpm demo:up` | 启动 PostgreSQL、迁移并幂等 Seed，不启动 Web/API 常驻进程 |
| `corepack pnpm demo:dev` | doctor → demo:up → API/Web/Worker；普通开发入口 |
| `corepack pnpm demo:down` | 关闭开发数据库容器，保留 Volume |
| `corepack pnpm demo:reset` | 显式重置 Demo 状态；具有破坏性，需理解保护条件 |
| `corepack pnpm dev` | `demo:dev` 的稳定别名 |

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
- `db:clean` 和 `demo:reset` 是显式破坏性入口；
- `test:postgres` 与 Playwright 使用独立 Compose project、端口和 Volume；
- `apps/api/.demo/uploads/objects` 是长期开发文件，不随普通测试或清理删除。

详细本地流程见 [OPERATIONS](OPERATIONS.md) 和 [LOCAL_DEMO](demo/LOCAL_DEMO.md)。

## 新增能力时的路径

1. 先确定 owning module 和状态不变量；
2. 先改 `packages/contracts` 的边界，再实现 API/Service/Repository；
3. 需要数据库时追加 Migration 并登记；
4. 通过 Composition Root 注入 Port/Adapter；
5. Web 只消费类型化 API，不直接表达数据库/模型内部状态；
6. 增加 unit/architecture/PostgreSQL/Playwright 中最接近风险的回归；
7. 更新当前权威文档和 CHANGELOG/VERSION_HISTORY（仅完成 Gate 时）。

## 已知维护热点

以下文件较大，但本轮不因行数机械拆分：

- `apps/web/src/api.ts`；
- `apps/api/src/app.ts`；
- `apps/api/src/composition/postgres-model-invocation-service.ts`；
- 大型 Composition Service、Repository、Contract 和页面；
- `apps/web/src/teacher-portal-data.ts`。

后续拆分必须先固定公共契约和依赖图，保持 route/middleware 顺序、Schema 单一真值和业务语义，并有回归测试。具体延期见 [目标仓库结构](project/TARGET_REPOSITORY_STRUCTURE.md)。
