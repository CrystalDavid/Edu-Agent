# Gate 2.4 Teacher Copilot 本地演示

## 演示边界

本演示只使用合成的八年级数学“一次函数斜率与图像关系”数据和确定性 `MockModelProvider`。它不会调用 DeepSeek 或其他外部模型，不连接云服务，也不会产生模型费用。

普通教师端七个一级页面中，只有 Teacher Copilot、Teaching Plan、Runs 及其从教学页进入的备课路径是 PostgreSQL-backed 业务切片；其他大部分页面仍是高保真 Mock。不要把视觉完整度解释为业务上线。

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
6. 启动 Gate 2.4 本地 Outbox Worker；
7. 等待 API 和 Web 通过启动检查。

打开：

```text
http://localhost:5173/
```

`corepack pnpm dev` 与 `demo:dev` 使用同一启动链。

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

1. 在“教学 → 作业”选择“调整下一课”，进入真实 Copilot；
2. 输入一条具体备课请求并提交；
3. 记录浏览器中的 Proposal 详情 URL，然后刷新；
4. 确认恢复的是同一请求、同一 Proposal、同一 Evidence，不会重新生成；
5. 选择策略，修改一个字段并“修改后接受”；
6. 进入 Teaching Plan，确认新 Revision 为 `in_review`，原 `approved` 仍是当前正式计划；
7. 单独点击“批准为当前教学计划”，确认系统创建新的 `approved` Revision；
8. 创建第二条 Proposal 并拒绝，确认当前已批准计划不变；
9. 进入 Runs，查看教师请求摘要、Evidence refs、Contract、Authorization、Audit 和 Outbox 处理状态。

Gate 2.4 不实现 `published`。接受建议、进入审核和批准是不同语义；任何操作都不表示课堂已经实施，也不会创建 `ObservedPedagogicalMove` 或 `InstructionalDecision`。

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
```

两条命令每次都使用形如 `edu-agent-e2e-<run-id>` 的独立 Compose Project 和 `edu-agent-e2e-<run-id>-postgres-data` 临时 Volume。结束时自动清理，并比较测试前后的：

- 开发 Volume identity；
- `infra/docker/.env.local` 内容；
- `.demo/uploads` 本地目录。

任一受保护状态变化或临时 Volume 未清理都会使测试失败。

## Outbox Worker

`demo:dev` 和 Playwright 测试显式设置 `COPILOT_OUTBOX_WORKER_ENABLED=true`。Worker 消费 Gate 2.4 的 Work、Runtime、Capability 与 Artifact 事件，使用现有租约、重试和 `work.outbox_consumer_effect` 去重。

业务事务中的 Task、Disposition、TeachingPlan Revision、当前指针与 Audit 同步提交；Worker 只确认异步事件消费，不负责决定业务事务是否成功。Worker 停止不会回滚业务写入，重启后会继续领取 pending/retry 或租约过期事件。本项目不声称 exactly-once。

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

## 明确未使用

- 正式登录、SSO 或真实身份数据；
- 真实模型、DeepSeek API Key；
- CloudBase、Netlify、CVM；
- 文件上传、LocalObjectStore、二进制文件；
- Todo/Calendar、完整课程树、作业/考试业务闭环；
- 学生长期模型、多 Agent、v0.4；
- 自动发布或外部承诺。
