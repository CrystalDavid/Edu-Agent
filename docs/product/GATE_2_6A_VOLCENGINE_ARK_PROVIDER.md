# Gate 2.6A — 火山方舟单一生产模型 Provider

## 1. 产品目标与裁决

Gate 2.6A 在不改变 Gate 2.5 备课、Proposal、TeachingPlan 和任务状态语义的前提下，引入一个可选择、可恢复、可审计的真实模型执行路径。

本 Gate 的生产 Provider 只有：

- Provider：Volcengine Ark / 火山方舟；
- Adapter：`VolcengineArkProvider`；
- 当前模型展示名：`Doubao-Seed-2.1-turbo-260628`；
- 当前模型调用标识由服务端 `ARK_MODEL_ID` 配置；
- API：OpenAI-compatible Chat Completions；
- 产品调用：非流式；
- Provider 不托管业务会话或长期上下文。

不接入第二供应商、模型选择器、自动路由或自动跨模型回退。`MockModelProvider` 继续是 local/test/CI/Playwright 的默认实现。

## 2. SDK 与依赖边界

API workspace 安装 `openai` Node/TypeScript SDK，并在服务端创建：

```ts
new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseUrl,
  timeout: config.timeoutMs,
  maxRetries: 0
});
```

产品调用固定使用：

```ts
client.chat.completions.create({
  model: config.modelId,
  messages,
  stream: false
});
```

SDK 自带 retry 被关闭，重试由本项目的 `ModelExecution` 和 Worker 控制。架构测试保证：

- `openai` 只存在于 `apps/api`；
- 只有 Capability/Integration Adapter import SDK；
- Contracts、领域 Port、Application Service 和 Web 不依赖 SDK 类型；
- React bundle 不包含 `openai`；
- API Key 和 Base URL 不进入浏览器。

当前 Probe 与 Fake Ark Contract Test 没有发现必须绕过 SDK 的火山方舟参数，因此没有增加第二条原生 `fetch` 生产路径。

## 3. 服务端配置

根目录 `.env.local` 被 Git 忽略。`.env.example` 只提供空 Secret 和无敏感默认值。

| 配置 | 含义 | 推荐值 |
|---|---|---|
| `MODEL_PROVIDER_MODE` | `mock` 或 `ark` | local 默认 `mock` |
| `ARK_BASE_URL` | OpenAI-compatible API 根地址 | `https://ark.cn-beijing.volces.com/api/v3` |
| `ARK_API_KEY` | 仅服务端 Secret | 空占位 |
| `ARK_MODEL_ID` | 模型调用标识 | `doubao-seed-2-1-turbo-260628` |
| `ARK_MODEL_DISPLAY_NAME` | 安全展示名 | `Doubao-Seed-2.1-turbo-260628` |
| `ARK_API_MODE` | 当前只接受 Chat Completions | `chat_completions` |
| `ENABLE_LIVE_MODEL_TESTS` | 显式开启真实探测/测试 | `false` |
| `MODEL_REQUEST_TIMEOUT_MS` | 单次 Provider 超时 | `120000` |
| `MODEL_MAX_OUTPUT_TOKENS` | 输出上限 | `8192` |
| `MODEL_MAX_RETRIES` | 本 Gate 的总 Provider attempt 上限 | `2` |
| `MODEL_DEBUG_CONTENT` | 合成本地内容调试 | `false` |

预算与成本配置：

- `MODEL_MAX_INPUT_TOKENS`；
- `MODEL_MAX_SINGLE_COST`；
- `MODEL_DAILY_BUDGET`；
- `MODEL_TEACHER_DAILY_BUDGET`；
- `MODEL_MAX_CONCURRENCY`；
- `MODEL_MAX_QUEUE_WAIT_MS`；
- `ARK_INPUT_PRICE_PER_MILLION`；
- `ARK_OUTPUT_PRICE_PER_MILLION`。

价格为部署配置，不进入领域对象。production 必须配置 Ark；production 禁止 Mock 和 `MODEL_DEBUG_CONTENT=true`。local/demo 请求 Ark 但配置不完整时，服务安全回退到 Mock，并向 UI 返回不含 Secret 的原因。

## 4. ModelProvider Port

领域 Port 使用统一 `ModelRequest` / `ModelResult`：

- Request 只包含 invocation/task/agent refs、版本化 PromptBundle、封存 ContextManifest ref、输出 Schema、超时、Token 上限、消息和授权 scope；
- Result 只包含安全状态、provider、model ID、脱敏所需 request ID、输出文本、usage、延迟和 finish reason；
- Failure 使用统一安全类别，不返回 SDK 对象、Header、Key、原始错误体或隐藏思维链。

`MockModelProvider` 与 `VolcengineArkProvider` 通过同一核心 Contract Test 和本地输出校验。

## 5. 事务边界

```text
HTTP Command
  → ActingContext / ActionIntent / AuthorizationDecision
  → TaskRun + AgentRun + TaskWorkingSet revision
  → AuthorizedContextPlan + sealed ContextManifest
  → ModelDataManifest + ModelExecution(queued) + Outbox
  → COMMIT

Local Worker claims Outbox with lease
  → ModelExecution(running)
  → budget check
  → Provider call outside every database transaction
  → validating
  → JSON / Zod / Evidence / scope / policy checks
  → Proposal application service
  → ModelExecution(succeeded)
```

网络调用绝不发生在持有业务事务期间。Worker 停止不会回滚已提交的 TaskRun、Context 或 queued ModelExecution；服务重启后 pending、租约过期和异常 running 记录可重新领取。

Worker 使用 at-least-once processing、租约和 Consumer Effect 幂等，不声称 exactly-once。Provider 调用携带执行级幂等 Header，但崩溃窗口仍可能让上游重新计算或计费，因此本系统只保证业务 Proposal 不重复创建。

## 6. ModelExecution 生命周期

正常状态：

```text
queued → running → validating → succeeded
```

失败/终止状态：

```text
timed_out
retryable_failed
permanently_failed
validation_failed
budget_exceeded
cancel_requested
cancelled
```

持久化安全元数据包括：

- provider、model ID、展示名；
- TaskRun、AgentRun、PromptBundle、ContextManifest、AuthorizedContextPlan；
- request hash、idempotency key、attempt/max attempts；
- timeout、输出 Token 上限；
- 累计 input/output/total Token、累计延迟、配置化估算费用；
- Provider request ID、finish reason、安全错误类别；
- queued/started/completed/cancelled 时间；
- validated output hash 和 Proposal ref。

默认不保存完整系统 Prompt、完整教师输入副本、完整原始响应、完整错误体、Header 或 Key。验证通过的结构化建议作为 Proposal 候选保存；教师原始请求仍由 TaskRun 和 ContextManifest 拥有。

## 7. PromptBundle

`prompt-bundle:lesson-preparation-ark@1` 固定：

- use case；
- 输入字段清单；
- 系统指令；
- 输出 Schema 版本；
- 安全策略版本；
- 创建时间；
- 内容 hash。

输入包含教师 request text、CourseRun、Unit、Lesson、LearningObjectives、current approved plan、授权 Evidence、Evidence gaps、Interaction Contract、TaskWorkingSet 和 sealed ContextManifest ref。

系统指令要求：

- 不虚构 Evidence、学生、姓名、分数、作业、资源或实施效果；
- 不把估计或建议写成正式事实；
- 明确未知项；
- 只引用授权 EvidenceRef；
- 保持 CourseRun/Lesson/Objective 对齐；
- 只生成 Proposal，不批准 TeachingPlan；
- 不调用工具、写数据库、扩大权限或输出隐藏思维链；
- 只输出无 Markdown 污染的结构化 JSON。

## 8. 输出 Schema、校验与修复

`teacher-copilot-suggestions@1` 每次允许 1–3 条建议，字段包括：

- strategyId、title、summary、rationale；
- evidenceRefs、knownGaps；
- applicability、unsuitableConditions；
- teachingMoves、proposedPlanChanges；
- followUpEvidence、uncertaintyNote；
- CourseRun、Lesson、LearningObjective refs。

校验顺序：

1. 内容存在；
2. 根节点是单一 JSON Object，无 Markdown 前后缀；
3. Zod；
4. EvidenceRef 存在且获授权；
5. CourseRun、Lesson、LearningObjective 对齐；
6. 不虚构个人、分数或实施事实；
7. 不直接批准或发布；
8. 教学与答案释放边界。

无论 Provider 宣称 JSON Object 或严格 JSON Schema，都执行本地校验。Capability snapshot 决定优先顺序：

```text
JSON Schema → JSON Object → prompt-only JSON
```

首次验证失败最多进行一次受控修复。修复只带必要的无效输出、校验错误和原授权 scope，不增加 Evidence、权限或模型。第二次失败进入 `validation_failed`，不创建 Proposal。

## 9. 重试、超时、取消与恢复

自动重试：

- 临时网络/连接故障；
- 429，并优先遵守 `Retry-After`；
- 可重试 5xx；
- Provider 临时不可用。

使用指数退避、抖动和 30 秒退避上限。401/403、模型不存在、400/422、Policy、预算、取消和连续 Schema 失败不自动重试。

统一类别：

- `AUTHENTICATION_FAILED`；
- `AUTHORIZATION_FAILED`；
- `MODEL_NOT_FOUND`；
- `RATE_LIMITED`；
- `PROVIDER_UNAVAILABLE`；
- `REQUEST_TIMED_OUT`；
- `REQUEST_CANCELLED`；
- `INVALID_PROVIDER_RESPONSE`；
- `OUTPUT_VALIDATION_FAILED`；
- `POLICY_BLOCKED`；
- `BUDGET_EXCEEDED`；
- `CONFIGURATION_ERROR`；
- `UNKNOWN_PROVIDER_ERROR`。

queued 可直接取消；running 先进入 `cancel_requested`，再通过 `AbortController` 尽力中断 SDK 请求。页面关闭不取消；刷新从 URL 中的 ModelExecution ref 恢复。timeout、validation failure、permanent failure、budget block 或 cancelled 可人工 retry，旧执行记录保持不可变关联。

## 10. 幂等和结果复用

请求指纹包含：

- TaskRun；
- request text hash；
- PromptBundle version；
- ContextManifest hash；
- provider / model ID；
- 输出 Schema；
- 生成设置。

相同幂等键和相同 payload 返回原 ModelExecution；相同键不同 payload 返回结构化 `409 IDEMPOTENCY_CONFLICT`。Worker 重放已 succeeded/validating 的执行不会重复创建 Proposal。人工 retry 创建关联的新 ModelExecution，不覆盖旧错误。

## 11. 预算和成本

Provider 调用前执行 `ModelBudgetPolicy`：

- model allowlist；
- 输入/输出 Token 上限；
- 单次估算费用；
- 全局与教师日预算；
- 并发；
- 最大排队时间。

失败时先写 `budget_exceeded`，不调用 Provider。每个有响应的 attempt 的 Token、延迟和费用都累计到同一 ModelExecution，包含受控修复的第一次无效响应。价格为配置值；默认 0 仅表示尚未配置价格，不表示 Provider 免费。

## 12. ModelDataManifest

每次排队前生成 immutable `governance.model_data_manifest`：

- purpose、tenant、actor；
- TaskRun / ContextManifest；
- provider、model ID hash；
- data categories、resource refs、field names；
- synthetic assertion；
- authorization decision；
- retention policy、created_at。

本 Gate 只允许 `tenant:demo-school`、演示教师和明确标记的合成数据。排队前拒绝疑似：

- Provider Secret 或认证值；
- 数据库连接信息；
- `.env.local` / 本地 Secret 引用；
- 手机号、证件号、邮箱或明显姓名字段；
- 非演示 tenant/actor；
- 受限 Audit、学校文件或学生资源 ref。

拒绝只返回安全类别，不回显内容。

## 13. 日志和本地调试

普通日志只允许 refs、hash、provider、model ID、状态、attempt、Token、延迟、finish reason、安全错误类别和 Schema 版本。

`MODEL_DEBUG_CONTENT=true` 只有 local/demo 可用，只接受 synthetic assertion，写入 Git ignored `.demo/model-debug`，每次写入清理过期文件。它不写 Audit、不上传、不进入快照；production 配置会启动失败。

Secret scan 检查 tracked/unignored 文件中的：

- `ark-` 前缀疑似长密钥；
- 带值的 Bearer 认证 Header；
- 非占位 `ARK_API_KEY` 赋值。

## 14. Capability Probe

手动命令：

```powershell
corepack pnpm model:probe:live
```

只有 `ENABLE_LIVE_MODEL_TESTS=true` 且 `MODEL_PROVIDER_MODE=ark` 才执行。Probe 不写业务表，只保存安全 capability snapshot 与 Governance Audit。

摘要字段：

- provider；
- model ID hash；
- text；
- image URL；
- JSON Object；
- JSON Schema；
- Function Calling；
- streaming；
- usage；
- request ID；
- 模型名匹配；
- checkedAt。

图片只使用公开测试 URL；响应必须通过专用 Zod Schema 后才记录 `supportsImageUrl=true`，且不进入 Evidence、文件、OCR 或教师产品流程。Capability snapshot 只在其 `modelIdHash` 与当前服务端模型配置一致时复用，切换模型 ID 后默认回到未知能力。

Fake Ark 的离线 Probe 已验证上述协议面均可被 Adapter 处理。真实模型 Probe 默认未运行；其每个布尔结果必须以用户本地 live summary 为准，不能由 Fake 结果推断。

## 15. Fake Ark Server 与固定评测集

Fake Ark Server 只监听本机，覆盖：

- 成功、Usage、request ID；
- 图片、JSON Object/Schema、Function Calling、streaming；
- 429 / Retry-After、500、timeout、disconnect、non-JSON；
- 首次 Schema 失败后修复成功；
- 修复仍失败；
- 运行中取消。

```powershell
corepack pnpm test:playwright:ark-fake
```

该命令仍创建独立 E2E PostgreSQL Volume，不访问外网。

固定评测集有 32 个合成用例，覆盖正常/简短/模糊请求、Evidence 冲突/缺失/过期、虚构数据、跨班级、Prompt Injection、绕过审批、直接数据库写入、结构/引用/对齐错误、超长/截断、429/5xx/timeout/cancel/budget、过度确定、年级错配、隐藏证据缺口、实施事实和一次修复边界。

评价维度为 Schema、Evidence 可追溯、不虚构、目标对齐、可操作性、未知项、教师审批、fail closed、延迟、Token 和成本。

## 16. Live Integration

默认命令会跳过：

```powershell
corepack pnpm test:model:live
```

只有同时显式设置：

```text
ENABLE_LIVE_MODEL_TESTS=true
MODEL_PROVIDER_MODE=ark
```

并具有完整服务端配置时才真实调用。Live Test：

- 只用合成数据；
- 不写生产业务对象；
- 不打印 Key、完整请求或完整响应；
- 验证中文文本、结构化备课建议、usage、request ID、模型匹配和公开图片；
- 仍执行本地 Zod/Evidence/scope/policy 校验；
- 只生成 Proposal candidate，教师批准仍是独立动作。

Live 失败与普通实现测试分开：账户、余额、配额、网络或 Provider 状态失败不会促使代码降低安全校验。

## 17. API

所有 DTO 与路径在 `packages/contracts` 并使用 Zod：

- provider availability；
- provider capability summary；
- model usage summary；
- create invocation；
- invocation detail/status；
- cancel；
- retry。

Web 只使用共享 `apiRoutes`，不散落手写产品 URL。

## 18. Migration 与 Schema Ownership

Gate 2.6A 后总 Migration 数为 29：

- Capability `0004`：扩展原 `model_execution`；增加 execution event、budget decision、provider capability snapshot；
- Governance `0003`：immutable `model_data_manifest`；
- Work `0006`：TaskRun lifecycle 时间；
- Runtime `0006`：AgentRun lifecycle 时间。

不创建万能 model-run 表，不保存 API Key，不改写既有 migration。空 Volume、Gate 2.5 前向升级、checksum、owner role、PGlite 和真实 PostgreSQL 均受测试。

## 19. UI

不增加模型选择器或视觉重构。教师可看到：

- 等待、生成、验证、重试、完成；
- 取消、超时、验证失败、暂时不可用、预算超限；
- 安全失败原因和人工 retry；
- 刷新后的同一执行状态；
- Ark 未配置时的 Mock 回退说明。

Runs 的技术折叠区显示 Provider、展示名、执行状态、PromptBundle 版本、ContextManifest、Token、累计延迟、估算费用、attempt、安全错误和脱敏 request ID。普通页面不显示 Key、Base URL、完整 Prompt、响应正文或隐藏思维链。

## 20. 已知限制与非目标

- 真实 capability/live 结果依赖用户账户和网络，仓库不能预先宣称；
- Chat Completions 不保存业务会话；
- 产品调用不使用 streaming、Function Calling 或图片；
- 本地 Worker 不具备学校生产的多实例调度、dead-letter 管理和告警；
- 成本只在配置价格后有实际参考意义；
- 不实现文件/ObjectStore、日程、作业考试、学生长期模型、云部署、多角色、多 Agent、第二模型或 v0.4。

## 21. 本地验收

1. 先保持 `MODEL_PROVIDER_MODE=mock`，运行完整 Gate 2.5 闭环；
2. 运行 `test:secrets`、普通测试、PostgreSQL、默认 Playwright 和 Fake Ark Playwright；
3. 在 `.env.local` 配置 Ark，但先保持 live tests 关闭；
4. 启动 demo，确认 availability 为 Ark 且 UI 不显示配置；
5. 创建合成备课请求，观察 queued/running/validating/succeeded 和刷新恢复；
6. 在 Runs 查看安全 usage/latency/cost/request ID；
7. 验证接受、批准、完成仍为三个教师动作；
8. 如需真实探测，显式开启 live flags，分别运行 capability probe 与 live test；
9. 关闭 live flags；
10. 确认开发 Volume、`.env.local` 和本地上传目录未被测试改变。
