# 本地 PostgreSQL 生命周期

项目使用官方 `postgres:18`，默认只绑定 `127.0.0.1:55432`。

## 长期开发数据库

```powershell
corepack pnpm db:env
corepack pnpm db:up
corepack pnpm db:migrate
corepack pnpm db:down
```

- Compose Project：`edu-agent-dev`
- Volume：`edu-agent-dev-postgres-data`
- `db:env` 只在缺失时创建被 Git 忽略的 `infra/local/postgres/.env.local`
- `db:down` 停止容器但保留 Volume

删除长期开发 Volume 必须显式授权：

```powershell
$env:ALLOW_DESTRUCTIVE_DB_RESET = "1"
corepack pnpm db:clean
Remove-Item Env:ALLOW_DESTRUCTIVE_DB_RESET
```

未设置变量时 `db:clean` 在调用 Docker 前 fail closed。

## 临时测试数据库

`pnpm test:postgres` 与 `pnpm test:playwright` 不使用长期开发数据库。每次运行创建独立：

- Compose Project：`edu-agent-e2e-<run-id>`
- Volume：`edu-agent-e2e-<run-id>-postgres-data`
- 随机端口和凭据

测试结束后临时 Volume 会被删除；runner 同时核验开发 Volume identity、`infra/local/postgres/.env.local` 和本地上传目录在前后完全一致。
