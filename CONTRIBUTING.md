# Contributing to Edu-Agent

Edu-Agent 使用七模块模块化单体和只向前 Migration。贡献的首要目标是保持教师控制、状态所有权、跨校隔离和可追溯 Evidence，而不是单纯让页面或测试“看起来通过”。

## 开始之前

1. 阅读 [README.md](README.md) 和 [AGENTS.md](AGENTS.md)；
2. 根据任务阅读 [当前能力](docs/capabilities.md)、[当前架构](docs/architecture.md) 和相关 ADR；
3. 确认工作区已有改动并只处理当前任务范围；
4. 从最新 `main` 创建主题分支。

本地推荐 Node.js 24、Corepack、pnpm 11.9.0 和 Docker Desktop：

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm demo:doctor
```

## 开发流程

1. 用 `rg` 核对 import、动态 import、路由、package scripts、测试和文档链接；
2. 明确状态属于哪个模块/Schema；
3. 保持 Contract、Application Service、Repository Port 和 Adapter 边界；
4. 使用 synthetic 数据开发和测试；
5. 运行与风险相称的测试；
6. 更新唯一权威文档；
7. 按主题提交，推送分支并创建 Draft PR。

常用入口见 [docs/development.md](docs/development.md)。不要直接猜测内部脚本；根 `package.json` 是稳定命令注册表。

## Migration 和数据库

- 不修改、合并、重排或重命名任何历史 Migration；
- 新 Migration 只追加到 owning module 的 `infrastructure/migrations/`；
- 同步更新唯一 registry `apps/api/src/database/migrations.ts`；
- 不让 app/worker role 获得 Migration owner 或其他 Schema 的直接写权限；
- 数据库变更必须通过 PGlite、architecture 和真实 PostgreSQL 验证。

详见 [Migration ownership](infra/postgres/migration-ownership.md)。

## Contract 和产品状态

- Web/API 共享路由、DTO、枚举和 Zod Schema 归 `packages/contracts`；
- 不复制 Schema，不用宽泛 cast 绕过解析；
- Agent 输出只能先形成 Proposal/Draft；教师显式确认前不能成为正式状态；
- 建议、处置、计划、实施、观察和反思必须保持不同事实；
- 不通过跨 Schema SQL 或便利 Repository 改写别的模块状态。

## 测试

最低基础检查：

```powershell
corepack pnpm test:secrets
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:architecture
corepack pnpm test:static
corepack pnpm build
corepack pnpm verify:markdown-links
git diff --check
```

涉及 PostgreSQL、浏览器、模型或 Demo 编排时，再运行相应的 `test:postgres`、`test:playwright`、`test:ark-fake` 和 `demo:doctor`。完整矩阵见 [docs/validation.md](docs/validation.md)。

## 文档

- 当前能力只维护在 `docs/capabilities.md`；
- 当前架构只维护在 `docs/architecture.md`；
- 未来计划只维护在 `docs/roadmap.md`；
- Verified 历史更新 `docs/version-history.md` 和 `CHANGELOG.md`；
- 详细 Gate/UI/研究记录进入 `docs/history/`；
- 长期不可逆决策使用独立 ADR，不能覆写旧 ADR；
- 所有移动必须更新本地链接并通过 Markdown verifier。
- 主题文档使用小写 kebab-case，例如 `version-history.md`；只保留 GitHub、Agent 和目录索引约定的全大写入口文件。

## Commit 与 PR

- 使用能说明一个主题的语义提交，例如 `docs:`、`fix:`、`refactor:`、`test:`、`chore:`；
- 只暂存明确路径，不使用 `git add .` 或 `git add -A`；
- 不 force push 或重写已共享历史；
- 默认创建 Draft PR，并在描述中列出范围、风险、测试、Migration 状态和人工检查点；
- 不自动合并，不因文档/清理提交创建 Verified Gate Tag。

## 不得提交

`.env.local`、真实 Key/Token、数据库数据/备份、`.demo/`、LocalObjectStore、`node_modules/`、`dist/`、构建缓存、测试报告/Trace/Video/截图、个人桌面报告或外部参考仓库副本。Playwright 产物应写入 `C:\Code\test\edu-agent\playwright`、`EDU_AGENT_TEST_OUTPUT_ROOT` 指定目录或系统临时目录，不得散落在仓库根目录。
