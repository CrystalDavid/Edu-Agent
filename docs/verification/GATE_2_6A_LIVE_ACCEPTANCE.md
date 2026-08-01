# Gate 2.6A Live Acceptance

状态：**VERIFIED**

> 本记录只保存可提交的脱敏验收事实。真实火山方舟调用与输出质量已经产品所有者确认；控制台短时零值被确认属于统计延迟，Gate 2.6A 已正式固化。

## 验收边界

- Provider：Volcengine Ark / 火山方舟；
- 模型：`Doubao-Seed-2.1-turbo-260628`；
- 模型调用标识：`doubao-seed-2-1-turbo-260628`；
- API：OpenAI-compatible Chat Completions；
- 数据：仅演示租户与合成课程、课时、目标、Evidence、TeachingPlan 和教师请求；
- 严格模式：`ARK_LIVE_STRICT=true`；
- 禁止 Mock/Fake fallback；
- 图片仅做能力探测，不进入产品流程。

## 安全要求

- `.env.local` 不提交、不显示、不进入日志；
- 报告不保存 API Key、Authorization Header、完整 Prompt、完整响应、完整 Evidence 或完整 Provider Request ID；
- 可提交文档只记录能力结论、Token 汇总、延迟、脱敏 Request ID、Schema/Policy 结果；
- 逐次安全报告写入 Git ignored 的 `.demo/live-model-reports/`。

## 验收进度

- [x] 严格环境预检；
- [x] 请求确实到达真实 Ark，且没有 Mock/Fake fallback；
- [x] Probe A：真实中文文本与 JSON；
- [x] Probe B：真实结构化教学建议；
- [x] Probe C：真实图片 URL；
- [x] Probe D：JSON Object、JSON Schema 与 Function Calling；
- [x] Streaming 能力探测；
- [x] 真实 Gate 2.5 备课 Proposal 闭环；
- [x] ModelExecution 状态、Usage、延迟与脱敏 Request ID；
- [x] Proposal 刷新恢复、教师修改与 `in_review` 创建；
- [x] 普通离线测试回归；
- [x] 产品所有者确认真实调用成功、模型输出质量可接受，控制台统计延迟不再阻塞固化。

## 真实 Capability Probe

严格 Probe 于 2026-07-31 23:53:53（北京时间，15:53:53 UTC）开始，使用 `volcengine-ark`、北京 Base URL 和 `doubao-seed-2-1-turbo-260628`，无 Fake/Mock fallback。

| Probe | 真实结果 | 输入/输出 Token | 延迟 | 脱敏 Request ID |
|---|---|---:|---:|---|
| 中文文本 | supported | 73 / 52 | 2,981 ms | `0217…be2f` |
| JSON Object | supported | 62 / 37 | 3,224 ms | `0217…b944` |
| JSON Schema | supported | 208 / 29 | 2,105 ms | `0217…e595` |
| Function Calling | supported | 402 / 84 | 3,810 ms | `0217…4cde` |
| 图片 URL | supported | 1,375 / 679 | 17,910 ms | `0217…867d` |
| Streaming | supported | Probe 未聚合流式 Usage | 7,431 ms | Probe 未聚合流式 ID |
| 结构化教学建议 | succeeded；Schema/Policy 通过 | 1,388 / 4,884 | 81,338 ms | `0217…de25` |

该安全报告共记录 7 次真实请求、3,508 输入 Token、5,765 输出 Token、9,273 总 Token。逐次报告保存在 Git ignored 的 `.demo/live-model-reports/`，不含完整输入或输出。

## 真实产品备课链路

首次产品调用保留了两次 120 秒超时记录，且没有创建 Proposal 或发生 fallback。定位到当前 Seed 2.1 模型默认深度思考会使受约束的教学 JSON 超过产品调用时限后，在 `VolcengineArkProvider` 的产品执行路径显式发送 `thinking: { type: "disabled" }`；真实 Chat Completions 兼容性请求验证该参数可用。Capability Probe 保持原始能力探测方式，不受此产品策略影响。

人工重试创建 `model-execution:dd19a2b0-b24a-4a96-966a-4d9ffd7fcadd`，数据库事件时间线证明其真实经历：

| 北京时间 | UTC | 状态 |
|---|---|---|
| 2026-08-01 00:24:08.492 | 2026-07-31 16:24:08.492 | `queued` |
| 2026-08-01 00:24:08.588 | 2026-07-31 16:24:08.588 | `running` |
| 2026-08-01 00:24:38.268 | 2026-07-31 16:24:38.268 | `validating` |
| 2026-08-01 00:24:38.276 | 2026-07-31 16:24:38.276 | `succeeded` |

产品执行安全摘要：

- Provider：`volcengine-ark`；模型展示名：`Doubao-Seed-2.1-turbo-260628`；
- attempt：1/2；输入 1,742 Token；输出 1,206 Token；总计 2,948 Token；延迟 29,670 ms；finish reason：`stop`；
- Provider Request ID：`0217…35a8`；
- PromptBundle：`prompt-bundle:lesson-preparation-ark@1`；
- ContextManifest：`context-manifest:02fdf3dd-0abb-4e65-927e-7d6f4b0bf570`；
- 唯一 Proposal：`artifact-revision:5df8722d-5575-4fa9-9d0a-c6f5fc80ed42`；
- 输出通过 JSON、Zod、Evidence 授权、CourseRun、Lesson、Objective 与 Policy 校验；
- 页面刷新后恢复同一 Proposal；教师修改后以 `accepted_with_changes` 形成 `artifact-revision:8ae2b327-a635-4d15-adb3-307a204619ec`，状态为 `in_review`；
- current approved 仍为不可变的 baseline；没有自动批准，也没有自动完成备课 Task。

真实输出与“斜率与图像变化”课时和八年级目标一致，所有 EvidenceRef 均属于封存授权集合；结果明确列出证据缺口、不适用条件与不确定性，没有把建议写成已经实施的课堂事实。

## 控制台核对窗口

模型开通后，本地客户端共发起 18 次真实 Ark 请求：16 次取得成功响应，2 次产品请求在客户端 120 秒超时。其组成是 7 次 Capability Probe、7 次 Strict Live Vitest、1 次参数兼容性请求和 3 次产品执行尝试。由于 Strict Live Vitest 和超时请求不保存完整 Usage，本地可精确归集的安全下限为 5,299 输入 Token、7,006 输出 Token、12,305 总 Token；火山控制台总量应高于该下限。

控制台核对窗口为北京时间 2026-07-31 23:53 至 2026-08-01 00:25、北京地域、在线推理、当前项目、当前模型与当前 API Key。产品所有者已确认真实调用成功，并接受控制台用量展示存在统计延迟。

## 当前结论

真实 Ark 鉴权、纯文本、结构化输出、图片、JSON Object、JSON Schema、Function Calling、Streaming 和真实备课 Proposal 均已验证；严格模式下 Mock/Fake fallback 为 0。产品所有者已确认真实调用和输出质量，控制台零值被接受为统计延迟；Gate 2.6A 已通过 PR #4 合并，并以 `gate-2-6a-verified` 固化。

## 本轮测试记录

| 检查 | 结果 |
|---|---|
| Secret Scan | 通过，302 个文件；仓库与构建产物未发现 Ark Key 或 Bearer Token |
| TypeScript | 通过，全部 workspace |
| Vitest | 通过，13 个文件 / 67 个测试 |
| Architecture | 通过，4 个文件 / 29 个测试 |
| Static Assertions | 通过，899 项 |
| HTTP E2E | 通过，5 个测试 |
| Node Smoke | 通过，5 个测试 |
| PGlite Migration | 通过，空库 30 个 Migration |
| PostgreSQL | 通过，10 个文件 / 58 个测试，独立临时 Volume 已清理 |
| 默认 Playwright | 通过，12 个测试，独立临时 Volume 已清理 |
| Fake Ark Playwright | 通过，1 个完整失败恢复测试，独立临时 Volume 已清理 |
| Production Build / Bundle Analysis / Demo Doctor | 通过 |
| Strict Live Vitest | 通过，2 个测试；已实际联网、未 skipped、无 Fake/Mock |
| Real Capability Probe | 通过，7 次真实请求；全部目标能力 supported |
| Real Product Browser Flow | 通过；刷新恢复、教师修改、`in_review` 与 Runs 安全摘要均已验证 |
| Git diff check | 通过 |

长期开发 Volume `edu-agent-dev-postgres-data` 的创建时间在测试前后均为 2026-07-30 17:44:15 UTC；所有临时 E2E Volume 已清理；`.env.local` 的修改时间保持不变；本地上传目录未被测试链清理。Web Bundle 未发现 OpenAI SDK 或 Ark Secret。
