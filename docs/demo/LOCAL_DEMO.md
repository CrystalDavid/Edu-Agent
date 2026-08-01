# Gate 2.6A 可恢复模型执行本地演示

## 演示边界

本演示只使用合成的“八年级 3 班数学 · 当前学期”、一次函数单元、五个课时、12 名匿名 learner、教学目标、Assignment/Submission、Evidence 和 TeachingPlan。默认使用确定性 `MockModelProvider`，不联网；只有用户在根目录 `.env.local` 显式选择 Ark 并提供完整服务端配置时，才调用火山方舟。任何模式都禁止真实学校或学生数据。

普通教师端七个一级页面中，概览的备课/作业区、教学的课程/课时/作业区、学生近期 Evidence、文件、Task-scoped Agent、Teacher Copilot、Teaching Plan 和 Runs 组成 PostgreSQL-backed 业务切片；日程、考试、通用 Agent 对话和设置仍主要是高保真 Mock。不要把视觉完整度解释为学校生产上线。

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
7. 使用 `.demo/uploads/objects` 作为 Git ignored 的开发 LocalObjectStore（可由 `LOCAL_OBJECT_STORE_ROOT` 覆盖）；
8. 等待 API 和 Web 通过启动检查。

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
9. 单独点击“完成备课”；确认 Task 为 `completed`、概览未完成数量减少、课时显示“已完成”；
10. 进入 Runs 查看 request、Lesson、TaskWorkingSet、AuthorizedContextPlan、ContextManifest、Provider、PromptBundle 版本、Token、延迟、估算费用、脱敏 request ID、Proposal、Plan/Work、Audit 和 Outbox；
11. 在同一已完成 Task 创建第二 Proposal；确认页面明确标注“仅允许补充审阅”，接受/修改被禁用，拒绝或延后不改变 current approved 和 completed 状态；如需接受修改，必须先显式 reopen 或新建一轮备课；
12. 执行 `corepack pnpm demo:down` 后重新 `corepack pnpm demo:dev`，确认上述状态仍存在。

### Gate 2.5B 文件与教学成果

1. 在 Teaching Plan 页选择当前明确的 approved Revision，点击“导出教案 DOCX”；
2. 确认文件页出现“斜率与图像变化 教案”，来源为“已批准 TeachingPlan 导出”；
3. 下载 DOCX，检查课程、单元、课时、目标、重点/难点、教学流程、Evidence 摘要、已知缺口、反思占位、Revision 和“AI 辅助生成、教师已批准”说明；
4. 在文件页选择一个 Lesson，上传一份不含隐私的 PDF、图片、Markdown/TXT 或 Office 参考文件；
5. 对教师上传的参考文件创建新版本，确认版本历史保留旧版本并可分别下载；正式教案文件的新版本必须由新的 approved TeachingPlan Revision 再次导出；
6. 回到 Lesson，确认参考文件和正式 DOCX 都出现在关联教学文件中；
7. 正式 DOCX 的删除、手工新版本和手工改绑入口应明确禁用；普通上传文件可软删除并恢复；
8. 停止并重启 Demo，确认文件元数据、对象内容、版本和关联仍存在。

### Gate 2.5C 教师产品稳定性

1. 在课时页分别观察 `planned`、`awaiting_plan_review`、`ready_for_use`、`completed` 与 `cancelled`，确认主按钮分别是继续备课、继续审核、查看并完成、查看已完成和重新打开，而不是统一跳入 Agent；
2. 从“斜率与图像变化”的“打开文件”进入文件页，确认 URL 包含 `lesson`，下拉仍选择该课时；点击关联文件时 URL 还应包含 `asset`，刷新后恢复同一文件；
3. active in-review 页面应显示“当前待审核版本”，不得显示“历史版本”；批准后才成为新的 current approved；
4. 模型为 queued/running/validating/retry/cancel-requested 时，“生成备课建议”必须禁用并说明原因；取消、超时和 retry 后从持久化 ModelExecution 恢复；
5. Proposal 处置请求发出时接受、编辑、拒绝、延后和策略切换不能并发操作；结构化 409 后页面重新读取最终处置；
6. 取消一个 planned/in-progress/awaiting/ready Task，确认 Proposal、计划和文件历史没有被删除；再显式 reopen，确认进入原 Task；
7. 概览中的学生、备课组和学校动态明确标注只读演示；“制作课件”和协作写操作禁用且没有假成功 toast；
8. Runs 在 active ModelExecution 时自动刷新到 terminal，并同时显示教师可读状态与审计 code。

### Gate 2.7 作业、学习 Evidence 与调整下一课

1. 打开“教学 → 作业”，选择“斜率与图像变化”，创建包含单选、数值和简答的作业草稿；编辑题目后保存会创建不可变内容版本；
2. 显式发布作业并刷新，确认状态仍为 `published`；发布后不能原地覆盖内容；
3. 点击“载入匿名合成提交”，确认 12 名 learner 中 10 名已交、2 名显示“未交”，未交分数为 `—` 而不是 0；
4. 选择一份提交，先“保存批改草稿”，确认尚无正式 Evidence；再点击“教师确认批改”，确认出现逐题、Objective 和共性错误分析；
5. 在“学生”页查看同一匿名 learner 的近期 Submission 与已确认 Evidence；页面只给出动态、中性事项，不显示长期能力标签；
6. 回到作业页选择一组共性错误，点击“调整下一课”；确认进入下一课 `lesson_preparation` Task，TaskWorkingSet 显示来源 Assignment/题目和本次 selected Evidence；
7. 输入调整要求并生成 Proposal；刷新后恢复同一 Proposal，不重复生成；修改后接受形成 `in_review`，再由教师单独批准为下一课 current approved TeachingPlan；
8. 执行 `demo:down` 后重新 `demo:dev`，确认 Assignment、Attempt、GradeDecision、Evidence、TaskWorkingSet、Proposal 和 TeachingPlan 仍可读取；
9. 文件页可把教师上传参考资料关联到 Assignment 或明确 AssignmentVersion；模型不会自动读取这些附件。

本地文件设置（均为非敏感服务端配置）：

```text
LOCAL_OBJECT_STORE_ROOT=.demo/uploads/objects
FILE_MAX_UPLOAD_BYTES=26214400
```

物理路径不使用用户文件名。默认上限为 25 MiB；允许 PDF、PNG/JPEG/GIF/WebP、Markdown、TXT、DOCX、PPTX 和 XLSX。HTML、脚本与可执行文件会 fail closed。

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

Playwright 的文件字节写入独立的 `.demo/e2e/<run-id>/uploads`，测试结束后只清理该精确目录；临时目录残留或开发上传目录变化都会使测试失败。

任一受保护状态变化或临时 Volume 未清理都会使测试失败。

## Outbox Worker

`demo:dev` 和 Playwright 测试显式设置 `COPILOT_OUTBOX_WORKER_ENABLED=true`。Worker 还消费 `ModelInvocationQueued`：先用租约领取，事务外调用 Provider，再把验证后的 Proposal 通过应用服务提交。它继续消费 Gate 2.5 Work 事件，并使用 Outbox Consumer Effect 去重。

业务事务中的 Task、状态历史、Working Set、AuthorizedContextPlan、ContextManifest、Disposition、TeachingPlan Revision、current 指针、Lesson 投影与 Audit 同步提交；Worker 记录可恢复的异步消费效果，不负责决定业务事务是否成功。Worker 停止不会回滚业务写入，重启后会继续领取 pending/retry 或租约过期事件。本项目不声称 exactly-once。

## Fake 与 Live 验证

离线 Fake Ark：

```powershell
corepack pnpm test:playwright:ark-fake
```

真实测试默认跳过。只有明确接受一次合成真实调用时，才临时设置 `ENABLE_LIVE_MODEL_TESTS=true`、`MODEL_PROVIDER_MODE=ark` 和 `ARK_LIVE_STRICT=true`，运行：

```powershell
corepack pnpm model:probe:live
corepack pnpm test:model:live
```

完成后恢复 `ENABLE_LIVE_MODEL_TESTS=false` 与 `ARK_LIVE_STRICT=false`。Live 失败可能来自账户、模型开通状态、余额、配额、网络或服务状态，不得通过 Mock fallback 或降低 Schema/Evidence/Policy 校验来规避。

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
- 云 ObjectStore、文件分享/协作、在线 Office 编辑、上传内容进入模型；
- Todo/Calendar、完整课程资源树和课程 CRUD、完整题库/考试业务闭环；
- 学生长期模型、多 Agent、v0.4；
- 自动发布或外部承诺。
- 图片产品流程、streaming 产品化、Function Calling、OCR 或 Provider 托管会话。

## 严格 Ark 实机验收

普通本地演示仍默认使用 Mock。只有执行 Gate 2.6A 实机验收时，才在当前进程显式设置：

```text
MODEL_PROVIDER_MODE=ark
ENABLE_LIVE_MODEL_TESTS=true
ARK_LIVE_STRICT=true
MODEL_DEBUG_CONTENT=false
```

随后运行 `corepack pnpm model:probe:live`。严格模式不允许 Mock 或 Fake Ark fallback，也不允许把 skipped 计为通过。API Key 只放在根目录 `.env.local`，不得作为命令参数或控制台输出。脱敏逐次报告位于 `.demo/live-model-reports/`；可提交状态见 `docs/verification/GATE_2_6A_LIVE_ACCEPTANCE.md`。
