# Edu Agent

教育智能体平台的第一轮工程验证仓库。

`main` 保存 Gate 1A 无 LLM 基线。当前 feature 分支继续验证
Gate 1B 的真实 PostgreSQL 边界：

- 五类 Ingress 合约；
- 七模块模块化单体骨架；
- PostgreSQL 七 Schema migration 基础；
- Authorization、Run、ArtifactRevision、Outbox 和 Audit；
- MockModelProvider 与 FakeTool；
- 无真实模型、无云资源的 Walking Skeleton。
- 官方 `postgres:18` 可重复集成环境；
- 模块独立 migration owner 与低权限运行角色；
- PostgreSQL Repository Adapter；
- CourseRun、LearningObjective、LearningInteractionProfile；
- 最小 Attempt、EvidenceObservation、EvidenceClaim；
- 只读 LearningEvidenceView；
- 不可变 ResolvedLearningInteractionContract；
- 事务、并发幂等、Outbox、崩溃恢复、连接池与权限测试。

最小 `Attempt` 仅用于给 `EvidenceObservation` 提供不可变、可追溯的
观察来源，不扩展 Opportunity、Assistance 或完整学生自适应模型。
Outbox 采用 at-least-once 投递、租约回收和幂等 Consumer Effect，
不声称 exactly-once。

## 本地命令

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm test:postgres
pnpm dev
```

`pnpm test` 不会启动 Docker。数据库集成测试使用
`127.0.0.1:55432`，首次运行会生成被 Git 忽略的随机本地凭证：

```bash
pnpm db:env
pnpm db:up
pnpm db:migrate
pnpm test:postgres
pnpm db:down
pnpm db:clean
```

当前不包含真实学生数据、真实模型、CloudBase 或 Netlify 集成。
也不包含 Teacher Copilot、StudentSupportCase、完整
LearnerStateEstimate、Durable Workflow 或多 Agent。
