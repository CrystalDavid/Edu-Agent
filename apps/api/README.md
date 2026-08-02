# Edu-Agent API

`apps/api` 是服务端应用：Express 入口、Composition Root、Worker、七模块、PostgreSQL Adapter 和 Migration registry。

- HTTP 入口：`src/app.ts`；进程入口：`src/index.ts`；
- 服务组装：`src/composition/`；
- 状态所有权：`src/modules/<module>/`；
- 平台 Adapter：`src/platform/`；
- 唯一 Migration registry：`src/database/migrations.ts`；执行器：`src/platform/postgres/bootstrap.ts`。

禁止跨 Schema 直接写、由 Runtime 改写领域状态、修改历史 Migration，或让 production 回退 Local/Mock/Demo。先阅读根 [Agent 指南](../../AGENTS.md) 和 [当前架构](../../docs/architecture.md)。
