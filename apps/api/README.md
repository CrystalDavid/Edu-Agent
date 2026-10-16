# Edu-Agent API

Express 服务端，负责教师门户的 HTTP API、模型任务、教学数据与文件管理。与 Web 一起从仓库根目录启动：

```bash
corepack pnpm app:dev
```

API 默认监听 `http://localhost:3001`。

| 入口 | 作用 |
| --- | --- |
| [src/index.ts](src/index.ts) | 进程启动 |
| [src/app.ts](src/app.ts) | HTTP 路由与中间件 |
| [src/composition](src/composition/) | 服务组装与 Worker |
| [src/modules](src/modules/) | 七个业务与能力模块 |
| [src/platform](src/platform/) | 数据库、身份等 Adapter |
| [src/database/migrations.ts](src/database/migrations.ts) | 数据库迁移 registry |

模块通过 Application Service、Port 和 Outbox 协作，数据库状态由所属模块维护。数据流与扩展方法见 [架构](../../docs/architecture/README.md) 和 [开发指南](../../docs/engineering/README.md)。
