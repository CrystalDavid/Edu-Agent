# 本地 PostgreSQL

使用官方 `postgres:18` 镜像，默认地址为 `127.0.0.1:55432`。从仓库根目录管理数据库：

```bash
corepack pnpm db:env
corepack pnpm db:up
corepack pnpm db:migrate
corepack pnpm db:down
```

| 项目 | 值 |
| --- | --- |
| Compose project | `edu-agent-dev` |
| Volume | `edu-agent-dev-postgres-data` |
| 配置文件 | `infra/local/postgres/.env.local`，由 `db:env` 在缺失时创建 |

`db:down` 停止容器并保留数据。日常启动也可直接使用 `app:prepare` 和 `app:dev`。

## 重置开发数据

`db:clean` 会删除开发数据库 Volume。需要重新开始时，使用显式开关：

```powershell
$env:ALLOW_DESTRUCTIVE_DB_RESET = "1"
corepack pnpm db:clean
Remove-Item Env:ALLOW_DESTRUCTIVE_DB_RESET
```

## 测试数据库

`corepack pnpm test:postgres` 与 `corepack pnpm test:playwright` 为每次运行创建独立的 `edu-agent-e2e-<run-id>` Compose project、临时 Volume、端口和凭据，并在结束后清理。测试配置见 [验证指南](../../../docs/engineering/validation.md)。
