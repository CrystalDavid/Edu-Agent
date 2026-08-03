# Local environment

本机环境只负责提供开发依赖，不拥有任何教学业务真值。

- PostgreSQL Compose：`postgres/compose.postgres.yml`；
- 本机数据库配置：`postgres/.env.local`（Git ignored）；
- 应用配置：仓库根 `.env.local`（Git ignored）；
- 持久化文件：仓库根 `.local-data/object-store/`（Git ignored）。

使用 `corepack pnpm app:doctor` 检查环境，使用 `corepack pnpm app:dev` 启动当前数据库中的真实应用状态。

