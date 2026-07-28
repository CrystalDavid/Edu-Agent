# Edu Agent

教育智能体平台的第一轮工程验证仓库。

当前分支只实现 Gate 1A：

- 五类 Ingress 合约；
- 七模块模块化单体骨架；
- PostgreSQL 七 Schema migration 基础；
- Authorization、Run、ArtifactRevision、Outbox 和 Audit；
- MockModelProvider 与 FakeTool；
- 无真实模型、无云资源的 Walking Skeleton。

## 本地命令

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm dev
```

当前不包含真实学生数据、真实模型、CloudBase 或 Netlify 集成。
