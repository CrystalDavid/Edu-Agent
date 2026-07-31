# Edu Agent

面向学校的教育智能体平台工程仓库。当前分支建设 **Gate 2.5B — 文件与教学成果闭环**：在已验证的 Gate 2.6A Provider 和 Gate 2.5 可恢复备课闭环上，增加真实文件版本、Lesson/Task/TeachingPlan 关联与 approved TeachingPlan DOCX 导出。

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
- `VolcengineArkProvider` 使用 API workspace 内的 OpenAI-compatible Node SDK；模型 ID 只来自服务端配置，Web bundle 无 SDK/Key；
- `ModelExecution` 持久化 queued/running/validating/succeeded、失败、超时、取消、Token、延迟、估算费用和安全 Provider 关联；
- 模型调用在数据库事务外由租约 Worker 执行；预算、ModelDataManifest、幂等、有限重试和一次受控修复均 fail closed；
- 默认 `MockModelProvider` 不联网；Fake Ark、32 项合成评测集和默认关闭的 Live Integration 分离验证；
- Artifact-owned `FileAsset`、不可变 `FileVersion` 和文件关联持久化到 PostgreSQL；Capability-owned `LocalObjectStore` 使用服务端生成 object key、流式 SHA-256、大小/MIME/签名校验和失败补偿；
- 文件页提供真实上传、搜索、分类、排序、下载、版本历史、软删除/恢复和 Lesson 关联；被正式 TeachingPlan Revision 引用的成果禁止删除；
- 明确的 current approved TeachingPlan Revision 可导出 DOCX，并作为正式 FileAsset 绑定 Lesson、备课 Task 与 TeachingPlan；新 approved Revision 导出形成同一文件的新版本；
- PostgreSQL、HTTP、Playwright、架构与数据库生命周期测试。

普通教师端的概览备课区、教学课程/课时、Task-scoped Agent、Teaching Plan、Runs，以及文件/教学成果链路已接入真实闭环；日程、作业、测试、学生、通用 Agent 对话和设置仍主要是高保真 Mock。详见 [教师门户功能矩阵](docs/product/TEACHER_PORTAL_FUNCTION_MATRIX.md)。

## 本地启动

前置条件：Node.js、Corepack 与 Docker Desktop。

```powershell
cd D:\03_Edu-Agent
corepack pnpm install
corepack pnpm demo:doctor
corepack pnpm demo:dev
```

打开 `http://localhost:5173/`。本地演示只使用合成身份和教育数据；默认 Mock，不联网。用户可在被忽略的 `.env.local` 中显式选择 Ark，配置仍只存在于服务端。它不是正式登录或 SSO。完整说明见 [LOCAL_DEMO.md](docs/demo/LOCAL_DEMO.md)。

## 验证命令

```powershell
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:architecture
corepack pnpm test:e2e
corepack pnpm test:migrations
corepack pnpm test:secrets
corepack pnpm test:node-smoke
corepack pnpm test:postgres
corepack pnpm test:playwright
corepack pnpm test:playwright:ark-fake
corepack pnpm build
corepack pnpm demo:doctor
```

- `pnpm test` 不启动 Docker。
- 普通测试和两条 Playwright 链都显式禁用 live model；Fake Ark 只监听本机。
- `pnpm test:model:live` 与 `pnpm model:probe:live` 默认关闭，只有显式 strict live flags 和完整 Ark 配置时才联网；严格模式禁止 Mock/Fake fallback。
- `pnpm test:postgres` 和 `pnpm test:playwright` 每次创建独立的临时 Compose Project/Volume，结束后清理，并核验开发 Volume、`infra/docker/.env.local` 和本地上传目录未变化。
- Playwright 还使用 `.demo/e2e/<run-id>/uploads` 临时 ObjectStore；结束后只删除该已核验目录，不触碰 `.demo/uploads/objects` 开发文件。
- 长期开发数据库使用 Compose Project `edu-agent-dev` 和 Volume `edu-agent-dev-postgres-data`。
- 删除长期开发 Volume 必须显式设置 `ALLOW_DESTRUCTIVE_DB_RESET=1`；未设置时命令会在调用 Docker 前拒绝执行。

## 明确边界

当前不包含真实学校数据、正式登录/SSO、第二模型或多供应商路由、DeepSeek、CloudBase、Netlify、云 ObjectStore、文件分享/协作、上传内容进入模型、Todo/Calendar 持久化、完整课程资源树或课程 CRUD、作业/考试闭环、学生长期模型、多 Agent 或 v0.4。图片、streaming 和 Function Calling 只做 capability probe，不进入产品。

Gate 2.6A 的 Provider、事务边界、生命周期、安全与验收见 [GATE_2_6A_VOLCENGINE_ARK_PROVIDER.md](docs/product/GATE_2_6A_VOLCENGINE_ARK_PROVIDER.md)。Gate 2.5 业务语义见 [GATE_2_5_RECOVERABLE_LESSON_PREPARATION.md](docs/product/GATE_2_5_RECOVERABLE_LESSON_PREPARATION.md)。
Gate 2.5B 的文件所有权、补偿、DOCX 与验收见 [GATE_2_5B_FILE_AND_TEACHING_ARTIFACTS.md](docs/product/GATE_2_5B_FILE_AND_TEACHING_ARTIFACTS.md)。
