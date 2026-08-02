# Edu Agent 教师端本地演示

> 状态：CURRENT。对应 `gate-2-10a-verified`；只描述本地合成数据演示，不代表生产部署。

## 演示边界

本演示只使用合成的“八年级 3 班数学 · 当前学期”、一次函数单元、五个课时、12 名匿名 learner、教学目标、Assignment/Submission、Evidence 和 TeachingPlan。默认使用确定性 `MockModelProvider`，不联网；只有用户在根目录 `.env.local` 显式选择 Ark 并提供完整服务端配置时，才调用火山方舟。任何模式都禁止真实学校或学生数据。

普通教师端七个一级页面中，概览工作台、日程/Todo、教学的课程/课时/作业/课堂实施与反思、学生近期 Evidence/confirmed classroom observation、文件、Task-scoped Agent、Teacher Copilot、Teaching Plan、Runs，以及身份/学校/会话设置组成 PostgreSQL-backed 业务切片；考试和开放式 Agent 对话仍主要是高保真 Mock 或明确禁用。不要把视觉完整度解释为学校生产上线。

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
5. 显式以 `APP_ENV=local`、`IDENTITY_PROVIDER_MODE=local`、`DEMO_AUTH_BYPASS=false` 启动演示 API；浏览器从登录页建立 HttpOnly Session；
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

## 本地身份与服务端会话

产品 API 默认要求有效的服务端 Session Cookie。未登录访问教师门户会显示登录页；登录成功后 API 建立随机不透明 Session，浏览器只持有 HttpOnly Cookie，数据库只保存 token hash。刷新和 API 重启后从 PostgreSQL 恢复 User、School、Membership、Role 和 CourseRun access。

本地演示提供四个不含密码的合成身份：普通教师、School Admin、多学校教师和 School B 教师。多学校身份必须选择当前工作空间；切换学校后所有产品读取重新按该 Membership 和 CourseRun access 授权。侧边栏与设置页显示真实 Session 中的姓名、当前学校和角色。

`x-demo-tenant` / `x-demo-actor` 只保留在明确的隔离测试 Adapter；普通浏览器和 production 路径不接受它们。只有同时满足以下条件才允许服务端 Demo bypass 注入合成教师身份：

- `DEMO_AUTH_BYPASS=true`；
- `APP_ENV=local` 或 `APP_ENV=demo`；
- 不是 production / `NODE_ENV=production`。

每次 bypass 注入都会写入 `DemoIdentityInjection` Audit。production 禁止 local identity、测试 Header 和 bypass，并要求完整 OIDC 配置与 Secure Cookie。

### 本地身份配置

```text
IDENTITY_PROVIDER_MODE=local
LOCAL_IDENTITY_PROVIDER_ENABLED=true
AUTH_SESSION_TTL_MINUTES=480
AUTH_SESSION_SECURE=false
WEB_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ALLOW_TEST_IDENTITY_HEADERS=false
DEMO_AUTH_BYPASS=false
```

生产 OIDC 使用 `OIDC_ISSUER_URL`、`OIDC_CLIENT_ID`、可选 `OIDC_CLIENT_SECRET`、`OIDC_REDIRECT_URI` 和 `OIDC_SCOPES`。本地文件只放空占位或本机 Secret；不要在文档、日志或命令行输出 Token。

### Gate 2.10A 身份验收

1. 未登录打开 `/overview`，确认出现登录页；选择普通教师后进入 School A，刷新仍登录；
2. 从侧边栏打开“身份与组织设置”，检查当前用户、学校、角色、CourseRun scope 和 active Session；
3. 登出后确认产品 API 返回 `401`，重新登录可恢复业务数据；
4. 选择“多学校教师”，在工作空间页分别进入 School A 和 School B，确认 CourseRun/课时数据完全切换且刷新保持；
5. 使用 School A Session 修改 URL 请求 School B CourseRun，确认返回不泄漏存在性的 `404`；
6. 以 School Admin 登录，在设置中预配置合成教师、调整角色/CourseRun access、停用并重新启用；普通教师不显示管理面板；
7. 在一个浏览器建立同一用户的第二 Session，从设置撤销它，确认第二 Session 立即失效；
8. 提交数据导出或去标识请求，确认只登记人工审核流程，不删除 TeachingPlan、Evidence、Assignment、Reflection 或 Audit 历史。

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

### Gate 2.8 日程、待办与教师工作台

1. 打开“概览”，点击“新建待办”，创建“准备周五教研材料”，设置优先级和截止时间；确认概览和日程右侧 Todo 面板显示同一条 PostgreSQL 记录；
2. 在日程中把 Todo 安排到一个时间段，切换日/周/月视图并编辑时间；确认三个视图读取同一 CalendarEvent；
3. 完成 Todo，确认时间块仍为 `scheduled`；Calendar 完成也不会自动完成 Todo；刷新后保持；
4. 创建并发布带截止时间的 Assignment，再载入合成提交；确认日历出现只读截止项，工作台出现未交和待确认批改提醒；
5. 对待批改提醒点击“明天提醒”，确认 Assignment 的截止时间、发布状态和 GradeDecision 未改变；切换“查看已稍后提醒”可以恢复显示；
6. 从“继续备课”“审核计划”“去批改”等来源事项进入真实源页面；在源页面完成命令后回到工作台，确认投影自动更新，不使用本地通用“完成”伪造状态；
7. 创建 Todo 并关联“斜率与图像变化”，点击“在 Agent 中处理”；确认 TaskWorkingSet 显示 Todo 和明确 Lesson，输入请求后生成 Proposal，而 Todo 仍为 `active`；
8. 重启 API/Worker/Web，确认 Todo、CalendarEvent、TodoCalendarLink、提醒偏好和来源状态全部恢复。

来源业务提醒是可重建读取投影。置顶、稍后提醒和隐藏只影响当前教师、当前 source version；不会修改备课 Task、Assignment、TeachingPlan、GradeDecision、ModelExecution 或 FileAsset。

### Gate 2.9 课堂实施、反思与教学改进

1. 打开“教学 → 斜率与图像变化”，确认页面同时显示 current approved TeachingPlan 和独立的“课堂实施与课后反思”区域；
2. 创建本次课堂实施草稿，记录按计划、调整、跳过和新增环节以及实际授课时间；确认前它不是正式实施事实；
3. 点击教师确认后刷新，确认实施记录仍存在且原 approved TeachingPlan Revision 未改变；如需修改，使用“创建修订”而不是覆盖 confirmed revision；
4. 创建一个班级或 Objective 范围观察并单独确认；学生页只在选择明确匿名 learner 时显示该教师确认观察，不生成长期标签；
5. 创建 Reflection draft，选择 confirmed implementation、confirmed observations 和少量 Assignment Evidence；进入 Agent 后检查本次 TaskWorkingSet、AuthorizedContextPlan 和 ContextManifest；
6. 使用默认 Mock 或显式 Ark 生成 Reflection draft，刷新页面后恢复同一 ModelExecution 与 draft；教师编辑后单独确认；
7. 从 confirmed Reflection 显式选择创建下一课备课 Task、Assignment draft 或个人 Todo；确认未选择的行动不会自动创建；
8. 重启 API、Worker 和 Web，确认 Lesson、Reflection Agent、学生页、工作台和后续 Task 仍读取同一 PostgreSQL 真值。

日历事件结束只会提供“记录课堂实施/完成反思”入口，不会自动声称课程已经实施。Agent 不能确认 Delivery、Observation 或 Reflection，也不能修改 approved TeachingPlan。

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

`demo:dev` 和 Playwright 测试显式设置 `COPILOT_OUTBOX_WORKER_ENABLED=true`。Worker 还消费 `ModelInvocationQueued`：先用租约领取，事务外调用 Provider，再把验证后的 Proposal 通过应用服务提交。它继续消费备课、作业、TeachingPlan、模型、文件、Todo 和 Calendar 相关事件，并用幂等 upsert 重建 TeacherWorkProjection；Outbox Consumer Effect 负责去重。

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

确认通过 `demo:dev` 启动且 `IDENTITY_PROVIDER_MODE=local`、`LOCAL_IDENTITY_PROVIDER_ENABLED=true`。清除旧站点 Cookie 后重新登录；不要把测试 Header 或 `DEMO_AUTH_BYPASS` 用在 production。OIDC 模式下检查 issuer、client、callback 和 Provider 可用性，但不要输出 Token。

### 模型不可用

- Ark 配置不完整：local/demo 显示安全回退原因并继续使用 Mock；
- 401/403/模型不存在：检查服务端配置，不会自动换供应商；
- timeout/validation failure：保留旧 ModelExecution，从 UI 人工 retry；
- budget exceeded：调用尚未发出，调整服务端预算后人工 retry；
- 不要把 Provider 原始错误、Key、完整 Prompt 或响应发送到浏览器。

## 明确未使用

- 最终云身份供应商配置、MFA、SCIM、邮件邀请或真实身份数据；
- 第二模型、DeepSeek、多供应商或模型选择器；
- CloudBase、Netlify、CVM；
- 云 ObjectStore、文件分享/协作、在线 Office 编辑、上传内容进入模型；
- 外部/共享日历、复杂重复日程、自动 Agent、完整课程资源树和课程 CRUD、完整题库/考试业务闭环；
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

随后运行 `corepack pnpm model:probe:live`。严格模式不允许 Mock 或 Fake Ark fallback，也不允许把 skipped 计为通过。API Key 只放在根目录 `.env.local`，不得作为命令参数或控制台输出。脱敏逐次报告位于 `.demo/live-model-reports/`；已固化验收状态见 `docs/history/gates/GATE_2_6A_LIVE_ACCEPTANCE.md`。
