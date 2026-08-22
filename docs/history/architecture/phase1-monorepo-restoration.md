# 阶段 1：长期维护 Monorepo 基线恢复报告

> 状态：IMPLEMENTED / VERIFIED
> 起点：`b9e43cb15b9d4be84235c1313933145a390bdc7e`
> 分支：`codex/phase1-monorepo-restoration`
> 范围：只调整仓库结构、路径引用、文档和结构保护测试；不改变产品行为。

## 1. 结果摘要

阶段 1 已恢复标准 pnpm monorepo：

- workspace 只包含 `apps/*` 与 `packages/*`；
- `sample-data` 使用原 package 名称迁入 `packages/sample-data`；
- 本地 PostgreSQL 编排迁入 `infra/local/postgres`；
- 没有真实部署资产的 `deploy/` 占位目录已经删除；
- `environments/` 顶层已经删除；
- `scripts/local`、`scripts/testing`、`scripts/quality`、`scripts/postgres`、`scripts/security` 保持不变；
- 当前登录、教师门户、课程、文件预览、Agent 入口和业务工作流代码没有修改；
- 43 个历史 Migration 没有修改、移动、重命名或重排；
- 完整离线、PostgreSQL 和浏览器回归通过。

## 2. 修改前目录树

```text
Edu-Agent/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   ├── contracts/
│   └── test-fixtures/
├── environments/
│   ├── local/
│   │   └── postgres/
│   └── sample-data/
├── deploy/
│   └── README.md
├── infra/
│   └── postgres/
├── scripts/
│   ├── local/
│   ├── testing/
│   ├── quality/
│   ├── postgres/
│   └── security/
├── tests/
└── docs/
```

## 3. 修改后目录树

```text
Edu-Agent/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   ├── contracts/
│   ├── sample-data/
│   └── test-fixtures/
├── infra/
│   ├── local/
│   │   └── postgres/
│   └── postgres/
├── scripts/
│   ├── local/
│   ├── testing/
│   ├── quality/
│   ├── postgres/
│   └── security/
├── tests/
├── docs/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── drizzle.config.ts
└── README.md
```

本地 `.env.local`、`.local-data/`、`node_modules/`、构建输出和测试产物继续 Git ignored，不属于仓库结构。

## 4. `git mv` 清单

### sample-data

```text
environments/sample-data/README.md       → packages/sample-data/README.md
environments/sample-data/package.json    → packages/sample-data/package.json
environments/sample-data/tsconfig.json   → packages/sample-data/tsconfig.json
environments/sample-data/src/index.ts    → packages/sample-data/src/index.ts
environments/sample-data/src/gate2.ts    → packages/sample-data/src/gate2.ts
```

### local PostgreSQL infrastructure

```text
environments/local/README.md                         → infra/local/README.md
environments/local/postgres/.env.example             → infra/local/postgres/.env.example
environments/local/postgres/README.md                 → infra/local/postgres/README.md
environments/local/postgres/compose.postgres.yml     → infra/local/postgres/compose.postgres.yml
```

未复制文件。Git 将上述内容识别为 rename。`environments/README.md` 在内容迁出后删除；`deploy/README.md` 的有效边界说明并入 `docs/operations.md` 后删除。

## 5. workspace 前后变化

### 修改前

```yaml
packages:
  - apps/*
  - packages/*
  - environments/*
```

### 修改后

```yaml
packages:
  - apps/*
  - packages/*
```

`docs`、`infra`、`scripts` 和 `tests` 没有成为 workspace package。冻结安装识别 6 个 workspace project：根、API、Web、Contracts、Sample Data 和 Test Fixtures。

## 6. package 与依赖变化

| 项目 | 修改前 | 修改后 | 语义变化 |
|---|---|---|---|
| package 名称 | `@edu-agent/sample-data` | `@edu-agent/sample-data` | 无 |
| package 物理位置 | `environments/sample-data` | `packages/sample-data` | 只纠正目录所有权 |
| API 依赖声明 | `workspace:*` | `workspace:*` | 无 |
| lockfile link | `../../environments/sample-data` | `../../packages/sample-data` | 路径更新 |
| root TS alias | `environments/sample-data/src` | `packages/sample-data/src` | 路径更新 |
| Vitest alias | `environments/sample-data/src` | `packages/sample-data/src` | 路径更新 |
| Web dependencies | 无 sample/test fixtures | 无 sample/test fixtures | 保持隔离 |

没有新增 package、第三方依赖或生产 SDK。`apps/api` 继续依赖 `@edu-agent/sample-data` 是阶段 2 需要治理的既有耦合，本阶段只恢复物理 monorepo，不改变 Application Service 逻辑。

## 7. 本地基础设施与数据保护

- Docker Compose、无 Secret 模板和生命周期 README 迁入 `infra/local/postgres`；
- `db:env`、`db:up`、`db:down`、`db:migrate` 和测试编排的路径引用已经同步；
- 根 `.env.local` 未读取、未修改、未提交；
- 本地 PostgreSQL `.env.local` 随其基础设施目录保留在 `infra/local/postgres/.env.local`，未读取内容且继续 Git ignored；
- 开发 Volume `edu-agent-dev-postgres-data` 未删除或重建；
- `.local-data/object-store` 和上传文件未移动或清理；
- PostgreSQL/Playwright 测试只创建并删除独立 `edu-agent-e2e-*` 临时资源。

## 8. deploy 处理

原 `deploy/` 只有 README 和未来 Gate 2.10B 描述，没有 Docker image、部署 manifest、Terraform、Kubernetes 或可验证发布流程。

处理结果：

- 有效边界说明并入 `docs/operations.md`；
- 详细差距继续由 `docs/operations/deployment-readiness-gaps.md` 维护；
- 删除根 `deploy/`；
- 文档明确：只有出现经评审、可执行、可验证的部署资产时才建立部署目录。

本阶段没有开始 Gate 2.10B。

## 9. 新增结构保护

新增 `tests/architecture/canonical-monorepo-structure.test.ts`，验证：

- workspace 只包含 `apps/*` 和 `packages/*`；
- `environments/` 与 `deploy/` 不存在；
- sample data 位于 `packages/sample-data`；
- local PostgreSQL 位于 `infra/local/postgres`；
- Web manifest 和源码不依赖 sample-data/test-fixtures；
- API/Web 生产依赖不包含 test-fixtures；
- `scripts/local`、`testing`、`quality`、`postgres`、`security` 保持存在；
- 不恢复 `scripts/demo`。

Gate 1A Static Assertions 同步增加 canonical root 检查。`verify:repo-sync` 的必需路径也已更新。

## 10. 测试结果

| 验证 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | PASS；6 workspace projects；lockfile 无需重新解析 |
| `pnpm typecheck` | PASS；Contracts、Sample Data、Test Fixtures、Web、API |
| `pnpm test:unit` | PASS；11 files / 51 tests |
| `pnpm test:architecture` | PASS；9 files / 57 tests |
| `pnpm test:static` | PASS；1,354 assertions |
| `pnpm test:e2e` | PASS；1 file / 5 tests |
| `pnpm test:migrations` | PASS；1 test；43 migrations |
| `pnpm test:node-smoke` | PASS；5 tests |
| `pnpm test:secrets` | PASS；402 tracked files；无 Secret |
| `pnpm test:postgres` | PASS；16 files / 94 tests |
| `pnpm test:playwright` | PASS；20 tests；2.1 min |
| `pnpm test:ark-fake` | PASS；1 test |
| `pnpm build` | PASS；全部 workspace production build |
| `pnpm analyze:bundle` | PASS；initial 806.8 KiB raw / 262.2 KiB gzip |
| `pnpm app:doctor` | PASS；Node/pnpm/Docker/Compose/本地 DB 配置可用 |
| `pnpm verify:markdown-links` | PASS；57 Markdown files / 141 local links |

第一次默认 Playwright 调用仅因外层命令设置为 120 秒而被终止，没有报告产品测试失败；清理确认后以 300 秒上限重新执行，最终 20/20 通过，并删除隔离资源。

## 11. 未解决问题

以下问题明确留给后续阶段，不属于本次结构恢复：

1. 多个 API Application Service 仍直接 import `@edu-agent/sample-data` 中的固定 Ref；阶段 2 应让正式服务只从 ActingContext、请求和 Repository 获取 Ref。
2. `apps/api/src/composition` 仍有大型服务；拆分属于独立应用边界重构。
3. Agent Runtime Kernel、Skill Registry、Memory、Personalization 和新的 Worker 均未开始。
4. 当前没有真实云部署资产、正式 OIDC 配置、托管 PostgreSQL 或云 ObjectStore。
5. 历史架构报告保留迁移前路径作为审计证据，不应被误读为当前目录说明；当前路径以 README、AGENTS、`docs/development.md` 和本报告为准。

## 12. 最重要的限制

- 本阶段证明的是“目录和 workspace 恢复后产品仍可运行”，不是“样例数据已完全退出产品运行时”。
- 不得在后续工作中重新创建 `environments/` 或空壳 `deploy/`。
- 不得因为 sample-data 位于 packages 就把它视为业务真值；正式状态仍属于 PostgreSQL 和所属模块。
- 不得修改 43 个历史 Migration。
- 不得把测试专用 Fixture 放入应用依赖或 Web bundle。
- 不得以本阶段为由开始 Runtime、Skill、Memory 或 UI 重构。

## 13. 提交结构

```text
docs: record monorepo architecture decisions
chore: move sample data into packages
chore: restore local postgres infrastructure layout
docs: remove premature deployment placeholder
test: verify canonical workspace structure
docs: record phase 1 monorepo restoration
```

前五个提交分别隔离分析、sample package、local infrastructure、deploy 文档和结构测试；本报告使用独立文档提交，不混入运行代码。
