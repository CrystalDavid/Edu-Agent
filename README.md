# Edu-Agent

Edu-Agent 是面向普通教师的教育智能体平台工程仓库。当前最新 verified 版本是 **Gate 2.10A — 正式身份、学校组织与权限基线**：

- `main`：`bbba3428602bb148a3d73a201ad97fcb29181c1b`
- annotated tag：`gate-2-10a-verified`
- 产品定位：**普通教师端本地功能型 MVP，已具备正式身份和学校组织基线，尚未达到云端学校试点生产条件。**

## 当前能力

当前代码已经形成以下真实、持久化、可恢复的教师闭环：

- 服务端 HttpOnly Session、本地/OIDC Identity Provider、学校 Membership/Role/CourseRun access、多学校工作空间和最小 school admin；
- CourseRun → Unit → Lesson 与 `lesson_preparation` Task；
- TaskWorkingSet → AuthorizedContextPlan → sealed ContextManifest；
- Mock 或 Volcengine Ark 的事务外 ModelExecution，含预算、取消、重试、恢复、Zod/Evidence/Policy 校验；
- Proposal 恢复、教师四种处置、TeachingPlan `draft → in_review → approved`、单独批准和显式完成备课；
- FileAsset/FileVersion、LocalObjectStore、Lesson/Task/Plan 绑定和 approved TeachingPlan DOCX 导出；
- Assignment、immutable SubmissionAttempt、教师批改、可追溯 Evidence 和“调整下一课”；
- TeacherTodo、CalendarEvent、来源业务投影和统一工作台；
- 教师确认的 LessonDelivery/ClassroomObservation、Agent Reflection draft、正式 Reflection 与显式后续行动；
- 七模块、七个 PostgreSQL Schema、Audit、Authorization、Outbox、租约 Worker 和幂等 Consumer Effect。

考试、开放式 Agent 对话、部分设置内容仍是明确标记的 Mock/READ_ONLY。学生端、家长端、长期 learner 模型、多模态产品流程、第二模型供应商和云部署尚未实现。逐页面/逐闭环状态见 [当前能力地图](docs/project/CURRENT_CAPABILITIES.md) 和 [教师门户功能矩阵](docs/product/TEACHER_PORTAL_FUNCTION_MATRIX.md)。

## 本地启动

前置条件：Node.js、Corepack、pnpm（由 Corepack 管理）和 Docker Desktop。

```powershell
cd D:\03_Edu-Agent
corepack pnpm install
corepack pnpm demo:doctor
corepack pnpm demo:dev
```

打开 `http://localhost:5173/`，选择合成本地身份登录。Local Identity Adapter 不实现密码，也不代表已配置生产 OIDC。默认模型是离线 `MockModelProvider`；真实 Ark/OIDC Secret 只能存放在被 Git 忽略的 `.env.local`，不能进入浏览器、日志、文档或提交。

完整运行说明：[LOCAL_DEMO.md](docs/demo/LOCAL_DEMO.md)。

## 常用验证

```powershell
corepack pnpm verify:version-history
corepack pnpm test:secrets
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:architecture
corepack pnpm test:static
corepack pnpm test:e2e
corepack pnpm test:node-smoke
corepack pnpm test:migrations
corepack pnpm test:postgres
corepack pnpm test:playwright
corepack pnpm test:playwright:ark-fake
corepack pnpm build
corepack pnpm analyze:bundle
corepack pnpm demo:doctor
```

- 普通自动化不访问公网；Fake Ark 与真实 Ark 验收严格分离。
- `test:postgres` 和 Playwright 每次使用独立 `edu-agent-e2e-*` Compose Project/Volume，并核验开发数据库和 `.env.local` 未变化。
- E2E ObjectStore 位于独立 `.demo/e2e/<run-id>`，不会删除 `.demo/uploads/objects`。
- 删除长期开发数据库 Volume 必须显式 `ALLOW_DESTRUCTIVE_DB_RESET=1`；未设置时 fail closed。
- `test:model:live` 与 `model:probe:live` 默认关闭，只能在显式 live/strict 配置下调用真实 Ark，且禁止 Mock/Fake fallback。

## 架构速览

这是 pnpm workspace 模块化单体：

```text
apps/web                 React/Vite 教师门户
apps/api                 Express API、七模块、Composition Root、Worker
packages/contracts       共享路由、DTO、Zod Schema
packages/test-fixtures   合成 demo/test refs（存在待清理产品依赖）
PostgreSQL               governance/work/runtime/capability/artifact/education/personalization
```

Product Composition Root 只装配 PostgreSQL-backed services；Gate 1A 内存 repositories 只属于 Test Composition Root。正式写入遵循：

```text
Session → ActingContext → ActionIntent → AuthorizationDecision
→ owning Application Service → Transaction → Audit / Outbox
```

模型和对象存储通过 Port/Adapter 隔离，领域层不依赖 OpenAI、OIDC 或 PostgreSQL SDK。详细说明和真实数据流见 [CURRENT_ARCHITECTURE.md](docs/project/CURRENT_ARCHITECTURE.md)。

## 文档入口

- [文档总入口](docs/README.md)
- [完整版本历史](docs/project/VERSION_HISTORY.md)
- [CHANGELOG](CHANGELOG.md)
- [当前能力地图](docs/project/CURRENT_CAPABILITIES.md)
- [当前架构](docs/project/CURRENT_ARCHITECTURE.md)
- [仓库结构地图](docs/project/REPOSITORY_MAP.md)
- [仓库清理计划](docs/project/REPOSITORY_CLEANUP_PLAN.md)
- [Gate 2.10B 部署就绪差距](docs/project/DEPLOYMENT_READINESS_GAPS.md)

Gate 名称不是严格时间序号：Gate 2.6A 先于 Gate 2.5B/2.5C；Gate 2.6B 没有实施。准确 Commit、PR、Merge、Tag、Migration 和阶段功能以 VERSION_HISTORY 为准。

## 当前边界与下一阶段

当前不包含真实学校数据、最终云 OIDC 配置、邮件邀请、MFA/SCIM、托管 PostgreSQL、云 ObjectStore、生产备份/监控、学生/家长端、完整考试、多模态文件理解、第二模型或多供应商、外部共享日历、多 Agent 或云部署。

建议下一阶段是 **Gate 2.10B — 云部署与小范围教师试点运维**，范围仅覆盖正式 OIDC、域名/HTTPS、Secret、托管 PostgreSQL/ObjectStore、Migration 发布、备份恢复、日志指标告警、安全加固、数据治理执行、远程 E2E 和试点运行手册；不应顺带新增业务模块。
