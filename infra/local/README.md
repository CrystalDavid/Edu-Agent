# 本地运行环境

本地环境由 PostgreSQL、API、Web 和文件存储组成。所有命令从仓库根目录运行。

```bash
corepack pnpm app:doctor
corepack pnpm app:prepare
corepack pnpm app:dev
```

首次体验示例课程可使用 `corepack pnpm sample:dev`。

| 配置或数据 | 位置 |
| --- | --- |
| PostgreSQL Compose | [postgres/compose.postgres.yml](postgres/compose.postgres.yml) |
| 数据库本机配置 | `infra/local/postgres/.env.local` |
| 应用与模型配置 | 根目录 `.env.local` |
| 上传文件 | `.local-data/object-store/` |

`corepack pnpm app:down` 停止数据库容器并保留 Volume。详细步骤见 [PostgreSQL](postgres/README.md) 与 [本机运行指南](../../docs/operations/local-environment.md)。
