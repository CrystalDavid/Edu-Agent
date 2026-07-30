# Edu Agent

面向学校的教育智能体平台工程仓库。当前分支完成 **Gate 2.4 — Teacher Copilot 正确性与可恢复性**：在普通教师端 UI v1 的视觉框架内，把一条“教师请求 → Proposal → 人工处置 → TeachingPlan 审核 → 单独批准 → Run/Audit/Outbox”链路接入真实 PostgreSQL。

## 当前真实能力

- 七模块模块化单体与七个 PostgreSQL Schema；
- Product Composition Root 全部使用 PostgreSQL，Gate 1A 内存实现只供隔离测试；
- 默认缺失身份返回 `401`；本地演示绕过必须显式开启且会写 Audit；
- 教师请求原文及所选目标、Evidence 被保存到 Task、Resolved Contract 和 ContextManifest；
- Proposal 列表、详情与直接 URL 恢复，不依赖浏览器 session state，也不会恢复时重新调用模型；
- `draft → in_review → approved` TeachingPlan 生命周期；Gate 2.4 不创建 `published`；
- Proposal 处置和批准的并发、版本冲突与幂等语义；
- 本地应用级 Outbox Worker，使用租约、重试和幂等 Consumer Effect，不声称 exactly-once；
- 确定性 `MockModelProvider`，无外部模型调用和费用；
- PostgreSQL、HTTP、Playwright、架构与数据库生命周期测试。

普通教师端的概览、日程、课程树、作业、测试、学生、文件、通用 Agent 对话和设置仍主要是高保真 Mock。详见 [教师门户功能矩阵](docs/product/TEACHER_PORTAL_FUNCTION_MATRIX.md)。

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
corepack pnpm test:migrations
corepack pnpm test:node-smoke
corepack pnpm test:postgres
corepack pnpm test:playwright
corepack pnpm build
```

- `pnpm test` 不启动 Docker。
- `pnpm test:postgres` 和 `pnpm test:playwright` 每次创建独立的临时 Compose Project/Volume，结束后清理，并核验开发 Volume、`infra/docker/.env.local` 和本地上传目录未变化。
- 长期开发数据库使用 Compose Project `edu-agent-dev` 和 Volume `edu-agent-dev-postgres-data`。
- 删除长期开发 Volume 必须显式设置 `ALLOW_DESTRUCTIVE_DB_RESET=1`；未设置时命令会在调用 Docker 前拒绝执行。

## 明确边界

当前不包含真实学校数据、正式登录/SSO、DeepSeek、CloudBase、Netlify、ObjectStore、文件上传、Todo/Calendar 持久化、完整课程树、作业/考试闭环、学生长期模型、多 Agent 或 v0.4。

Gate 2.4 的设计、API、同步/异步边界和验收证据见 [GATE_2_4_COPILOT_CORRECTNESS.md](docs/product/GATE_2_4_COPILOT_CORRECTNESS.md)。
