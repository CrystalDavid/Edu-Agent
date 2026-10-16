# 开发指南

需要 Node.js 24、Corepack 和 Docker Desktop。pnpm 版本由根 `package.json` 固定。

```bash
git clone https://github.com/CrystalDavid/Edu-Agent.git
cd Edu-Agent
corepack pnpm install --frozen-lockfile
corepack pnpm app:doctor
corepack pnpm sample:dev
```

已有工作空间使用 `corepack pnpm app:dev`。应用和模型配置见 [本机运行指南](../operations/local-environment.md)。

## 从哪里改起

| 工作 | 入口 |
| --- | --- |
| HTTP 路由与中间件 | `apps/api/src/app.ts` |
| 服务装配与业务编排 | `apps/api/src/composition/` |
| 模块逻辑与持久化 | `apps/api/src/modules/<module>/` |
| 数据库迁移 | 模块的 `infrastructure/migrations/` 与 `apps/api/src/database/migrations.ts` |
| 页面与路由 | `apps/web/src/pages/`、`App.tsx`、`route.ts` |
| Web API client | `apps/web/src/api.ts` |
| 共享 DTO、路由和 Schema | `packages/contracts/src/` |
| 示例课程 | `packages/sample-data/` 与 `scripts/sample/` |
| 测试配置 | `tests/config/` |

详细文件地图见 [仓库结构](repository-map.md)，界面规格见 [UI 设计](../ui/README.md)。

## 常用命令

所有命令从仓库根目录运行。

| 命令 | 用途 |
| --- | --- |
| `corepack pnpm app:doctor` | 检查运行时、Docker 与端口 |
| `corepack pnpm app:prepare` | 启动数据库并执行迁移 |
| `corepack pnpm app:dev` | 启动 API、Web 与 Worker |
| `corepack pnpm sample:seed` | 载入示例课程 |
| `corepack pnpm app:down` | 停止数据库，保留数据 |
| `corepack pnpm typecheck` | 检查共享包与应用类型 |
| `corepack pnpm test` | 运行默认测试 |
| `corepack pnpm test:architecture` | 检查模块协作与状态所有权 |
| `corepack pnpm test:postgres` | PostgreSQL 集成测试 |
| `corepack pnpm test:playwright` | 浏览器业务回归 |
| `corepack pnpm test:ark-fake` | Fake Ark 模型回归 |
| `corepack pnpm build` | 构建全部 workspace |
| `corepack pnpm analyze:bundle` | 查看 Web 构建体积 |
| `corepack pnpm verify:markdown-links` | 检查文档链接 |
| `corepack pnpm verify:repo-sync` | 检查仓库结构与同步 |

更多测试组合见 [验证指南](validation.md)，其他编排命令见 [脚本索引](../../scripts/README.md)。

## 新增功能

1. 在 [架构](../architecture/README.md) 中确认所属模块。
2. 在 `packages/contracts` 定义前后端协议。
3. 实现 Application Service 和 Repository；数据库变化通过追加 Migration 表达。
4. 在 Composition Root 装配依赖，为 Web 接入类型化 API。
5. 运行对应的单元、接口或浏览器回归，并更新功能与使用文档。

部署配置见 [运维入口](../operations/README.md)，计划中的工作见 [路线图](../roadmap.md)。
