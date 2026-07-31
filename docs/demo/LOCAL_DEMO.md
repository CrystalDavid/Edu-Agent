# Gate 2.6A 可恢复模型执行本地演示

## 演示边界

本演示只使用合成的“八年级 3 班数学 · 当前学期”、一次函数单元、五个课时、教学目标、Evidence 和 TeachingPlan。默认使用确定性 `MockModelProvider`，不联网；只有用户在根目录 `.env.local` 显式选择 Ark 并提供完整服务端配置时，才调用火山方舟。任何模式都禁止真实学校或学生数据。

普通教师端七个一级页面中，概览的备课区、教学的课程/课时区、Task-scoped Agent、Teacher Copilot、Teaching Plan 和 Runs 组成 PostgreSQL-backed 业务切片；日程、作业、测试、学生、文件、通用 Agent 对话和设置仍主要是高保真 Mock。不要把视觉完整度解释为业务上线。

## 前置条件

- Node.js 与 Corepack；
- Docker Desktop 已启动；
- 主机端口 `55432`、`3001` 和 `5173` 可用；
- 在正式项目目录 `D:\03_Edu-Agent` 中执行。

## 一条命令启动

```powershell
cd D:\03_Edu-Agent
corepack pnpm demo:doctor
corepack pnpm demo:dev
```

启动链会：

1. 保留并复用长期开发 Volume `edu-agent-dev-postgres-data`；
2. 创建被 Git 忽略的 `infra/docker/.env.local`（仅在尚不存在时）；
3. 初始化七个 Schema、数据库角色和 migrations；
4. 幂等 Seed 合成数据；
5. 显式以 `APP_ENV=local`、`DEMO_AUTH_BYPASS=true` 启动演示 API；
6. 启动共用 Outbox Worker；模型执行先提交 queued 事实，再在事务外调用 Mock 或 Ark；
7. 等待 API 和 Web 通过启动检查。

打开：

```text
http://localhost:5173/
```

`corepack pnpm dev` 与 `demo:dev` 使用同一启动链。

## 模型配置

默认无需配置：

```text
MODEL_PROVIDER_MODE=mock
ENABLE_LIVE_MODEL_TESTS=false
MODEL_DEBUG_CONTENT=false
```

要在合成本地演示中启用 Ark，请自行在被 Git 忽略的 `D:\03_Edu-Agent\.env.local` 设置：

```text
MODEL_PROVIDER_MODE=ark
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_API_KEY=
ARK_MODEL_ID=doubao-seed-2-1-turbo-260628
ARK_MODEL_DISPLAY_NAME=Doubao-Seed-2.1-turbo-260628
ARK_API_MODE=chat_completions
ENABLE_LIVE_MODEL_TESTS=false
MODEL_REQUEST_TIMEOUT_MS=120000
MODEL_MAX_OUTPUT_TOKENS=8192
MODEL_MAX_RETRIES=2
MODEL_DEBUG_CONTENT=false
```

请只在本机填写 `ARK_API_KEY`，不要粘贴到终端输出、文档、测试或聊天。Ark 配置不完整时 local/demo 会安全回退到本地演示助手；production 则启动失败。

## 演示身份：默认拒绝，显式绕过

产品 API 默认要求身份 Header：

- `x-demo-tenant: tenant:demo-school`
- `x-demo-actor: user:teacher-001`

缺失或只提供一个 Header 会返回 `401 AUTHENTICATION_REQUIRED`；错误租户或教师会返回 `403 AUTHORIZATION_DENIED`。

只有同时满足以下条件才允许服务端注入合成教师身份：

- `DEMO_AUTH_BYPASS=true`；
- `APP_ENV=local` 或 `APP_ENV=demo`；
- 不是 production / `NODE_ENV=production`。

每次服务端身份注入都会写入 `DemoIdentityInjection` Audit。生产模式禁止该开关。浏览器前端仍显式发送合成 Header，因此页面中的“本地演示教师身份”不是正式登录、Cookie Session 或 SSO。

## 推荐验收路径

1. 打开“教学”，选择“一次函数 → 斜率与图像变化”；
2. 查看教学目标、原 current approved TeachingPlan 和“当前课时没有未完成的备课任务”；
3. 点击“开始备课”，进入 `/agent/tasks/:taskRef`；
4. 检查锁定的 CourseRun、Unit、Lesson、教学目标、baseline plan、Evidence 和 TaskWorkingSet；可删除一条可选 Evidence；
5. 输入一条具体备课请求并提交；观察等待、生成、验证与完成状态，在运行中刷新；
6. 确认恢复同一 ModelExecution、请求、TaskRun、Evidence 和 sealed ContextManifest；成功后进入同一 Proposal，不重复调用；
7. 选择策略并“修改后接受”，进入 Teaching Plan；确认新 Revision 为 active `in_review`，原 current `approved` 不变；
8. 单独点击“批准为当前教学计划”；确认新 immutable `approved` 成为 current，Task 为 `ready_for_use`；
9. 单独点击“完成备课”；确认 Task 为 `completed`、概览未完成数量减少、课时显示“已准备”；
10. 进入 Runs 查看 request、Lesson、TaskWorkingSet、AuthorizedContextPlan、ContextManifest、Provider、PromptBundle 版本、Token、延迟、估算费用、脱敏 request ID、Proposal、Plan/Work、Audit 和 Outbox；
11. 在同一已完成 Task 创建第二 Proposal 并拒绝；确认 current approved 和 completed 状态不变；
12. 执行 `corepack pnpm demo:down` 后重新 `corepack pnpm demo:dev`，确认上述状态仍存在。

Gate 2.5 不实现 `published`。接受建议、进入审核、批准计划和完成备课是不同语义；任何操作都不表示课堂已经实施，也不会创建 `ObservedPedagogicalMove` 或 `InstructionalDecision`。已完成 Task 若要形成新的 in-review 计划，必须先由教师显式 reopen。

## 数据库生命周期

长期开发数据库：

- Compose Project：`edu-agent-dev`
- Volume：`edu-agent-dev-postgres-data`

停止服务但保留数据：

```powershell
corepack pnpm demo:down
```

删除并重建长期开发数据库是破坏性操作，必须显式授权：

```powershell
$env:ALLOW_DESTRUCTIVE_DB_RESET = "1"
corepack pnpm demo:reset
Remove-Item Env:ALLOW_DESTRUCTIVE_DB_RESET
```

未设置变量时，`db:clean` / `demo:reset` 会在调用 Docker 前 fail closed。该操作只针对已核验的长期开发 Compose Project/Volume；不会删除 Git ignored secret、其他 Docker Volume 或仓库文件。

## 测试数据库不会触碰开发数据

```powershell
corepack pnpm test:postgres
corepack pnpm test:playwright
corepack pnpm test:playwright:ark-fake
```

这些命令每次都使用形如 `edu-agent-e2e-<run-id>` 的独立 Compose Project 和 `edu-agent-e2e-<run-id>-postgres-data` 临时 Volume。默认 Playwright 固定 Mock；Ark Playwright 只连接本机 Fake Ark。结束时自动清理，并比较测试前后的：

- 开发 Volume identity；
- `infra/docker/.env.local` 内容；
- `.demo/uploads` 本地目录。

任一受保护状态变化或临时 Volume 未清理都会使测试失败。

## Outbox Worker

`demo:dev` 和 Playwright 测试显式设置 `COPILOT_OUTBOX_WORKER_ENABLED=true`。Worker 还消费 `ModelInvocationQueued`：先用租约领取，事务外调用 Provider，再把验证后的 Proposal 通过应用服务提交。它继续消费 Gate 2.5 Work 事件，并使用 Outbox Consumer Effect 去重。

业务事务中的 Task、状态历史、Working Set、AuthorizedContextPlan、ContextManifest、Disposition、TeachingPlan Revision、current 指针、Lesson 投影与 Audit 同步提交；Worker 记录可恢复的异步消费效果，不负责决定业务事务是否成功。Worker 停止不会回滚业务写入，重启后会继续领取 pending/retry 或租约过期事件。本项目不声称 exactly-once。

## Fake 与 Live 验证

离线 Fake Ark：

```powershell
corepack pnpm test:playwright:ark-fake
```

真实测试默认跳过。只有明确接受一次合成真实调用时，临时将 `ENABLE_LIVE_MODEL_TESTS=true`，运行：

```powershell
corepack pnpm model:probe:live
corepack pnpm test:model:live
```

完成后恢复 `ENABLE_LIVE_MODEL_TESTS=false`。Live 失败可能来自账户、余额、配额、网络或服务状态，不得通过降低 Schema/Evidence/Policy 校验来规避。

## 常见故障

### Docker 或端口不可用

运行：

```powershell
docker version
corepack pnpm demo:doctor
```

检查 PostgreSQL `55432`、API `3001`、Web `5173`。

### 页面启动失败

检查：

- Web：`http://localhost:5173/`
- API Health：`http://localhost:3001/api/health`

未知 `/api/*` 返回结构化 `API_ROUTE_NOT_FOUND`。不要粘贴 `.env.local`、连接串或本地凭据。

### 身份错误

确认是通过 `demo:dev` 启动，或在直接启动 API 时显式提供两个 Header。不要为了绕过错误把 `DEMO_AUTH_BYPASS` 用在 production。

### 模型不可用

- Ark 配置不完整：local/demo 显示安全回退原因并继续使用 Mock；
- 401/403/模型不存在：检查服务端配置，不会自动换供应商；
- timeout/validation failure：保留旧 ModelExecution，从 UI 人工 retry；
- budget exceeded：调用尚未发出，调整服务端预算后人工 retry；
- 不要把 Provider 原始错误、Key、完整 Prompt 或响应发送到浏览器。

## 明确未使用

- 正式登录、SSO 或真实身份数据；
- 第二模型、DeepSeek、多供应商或模型选择器；
- CloudBase、Netlify、CVM；
- 文件上传、LocalObjectStore、二进制文件；
- Todo/Calendar、完整课程资源树和课程 CRUD、作业/考试业务闭环；
- 学生长期模型、多 Agent、v0.4；
- 自动发布或外部承诺。
- 图片产品流程、streaming 产品化、Function Calling、OCR 或 Provider 托管会话。
