# Edu Agent

面向学校的教育智能体平台工程仓库。当前分支完成 **Gate 2.5 — 最小可恢复备课闭环**：在普通教师端 UI v1 的视觉框架内，把真实 `CourseRun → CurriculumUnit → Lesson`、备课 Task、运行上下文、Proposal 审阅、TeachingPlan 批准和显式完成接入 PostgreSQL。

## 当前真实能力

- 七模块模块化单体与七个 PostgreSQL Schema；
- Product Composition Root 全部使用 PostgreSQL，Gate 1A 内存实现只供隔离测试；
- 默认缺失身份返回 `401`；本地演示绕过必须显式开启且会写 Audit；
- 正式 Repository/API 提供八年级 3 班数学的 CourseRun、一次函数 Unit、五个 Lesson、教学目标和当前计划；
- 复用 `work.task` 表达 `lesson_preparation`，持久化 `planned → in_progress → awaiting_plan_review → ready_for_use → completed` 状态和历史；
- TaskWorkingSet 保存教师显式选择；每个 AgentRun 重新生成 AuthorizedContextPlan 并封存 ContextManifest；
- 教师请求原文及所选课时、目标、Evidence 和 baseline plan 被保存到 TaskRun、Resolved Contract、ContextManifest 和 MockModelProvider 输入；
- Proposal 列表、详情与直接 URL 可恢复，不依赖浏览器 session state，也不会恢复时重新调用模型；
- `draft → in_review → approved` TeachingPlan 生命周期；同一 Lesson 最多一个 active in-review 和一个 current approved，旧版本保留历史；
- 接受/修改、批准和完成是三个独立命令；拒绝/稍后处理不改变 current approved；
- Task、Disposition、active review、批准和完成具备 expected version、结构化冲突与幂等语义；
- 本地应用级 Outbox Worker，使用租约、重试和幂等 Consumer Effect，不声称 exactly-once；
- 确定性 `MockModelProvider`，无外部模型调用和费用；
- PostgreSQL、HTTP、Playwright、架构与数据库生命周期测试。

普通教师端的概览备课区、教学课程/课时、Task-scoped Agent、Teaching Plan 和 Runs 已接入真实闭环；日程、作业、测试、学生、文件、通用 Agent 对话和设置仍主要是高保真 Mock。详见 [教师门户功能矩阵](docs/product/TEACHER_PORTAL_FUNCTION_MATRIX.md)。

## 本地启动

前置条件：Node.js、Corepack 与 Docker Desktop。

```powershell
cd D:\03_Edu-Agent
corepack pnpm install
corepack pnpm demo:doctor
corepack pnpm demo:dev
```

打开 `http://localhost:5173/`。本地演示使用合成学校与教师身份、合成教育数据和 Mock 模型；它不是正式登录或 SSO。完整说明见 [LOCAL_DEMO.md](docs/demo/LOCAL_DEMO.md)。

## 验证命令

```powershell
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:architecture
corepack pnpm test:e2e
corepack pnpm test:migrations
corepack pnpm test:node-smoke
corepack pnpm test:postgres
corepack pnpm test:playwright
corepack pnpm build
corepack pnpm demo:doctor
```

- `pnpm test` 不启动 Docker。
- `pnpm test:postgres` 和 `pnpm test:playwright` 每次创建独立的临时 Compose Project/Volume，结束后清理，并核验开发 Volume、`infra/docker/.env.local` 和本地上传目录未变化。
- 长期开发数据库使用 Compose Project `edu-agent-dev` 和 Volume `edu-agent-dev-postgres-data`。
- 删除长期开发 Volume 必须显式设置 `ALLOW_DESTRUCTIVE_DB_RESET=1`；未设置时命令会在调用 Docker 前拒绝执行。

## 明确边界

当前不包含真实学校数据、正式登录/SSO、DeepSeek、CloudBase、Netlify、ObjectStore、文件上传、Todo/Calendar 持久化、完整课程资源树或课程 CRUD、作业/考试闭环、学生长期模型、多 Agent 或 v0.4。

Gate 2.5 的领域裁决、状态机、API、Migration、同步/异步边界和验收流程见 [GATE_2_5_RECOVERABLE_LESSON_PREPARATION.md](docs/product/GATE_2_5_RECOVERABLE_LESSON_PREPARATION.md)。Gate 2.4 基线见 [GATE_2_4_COPILOT_CORRECTNESS.md](docs/product/GATE_2_4_COPILOT_CORRECTNESS.md)。
