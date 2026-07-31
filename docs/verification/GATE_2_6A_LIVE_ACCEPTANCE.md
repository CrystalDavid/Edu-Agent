# Gate 2.6A Live Acceptance

状态：**PENDING**

> 本记录只保存可提交的脱敏验收事实。只有真实火山方舟调用成功，且产品所有者在火山方舟控制台确认在线推理调用次数大于 0 后，状态才可改为 `VERIFIED`。

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

## 待完成验证

- [x] 严格环境预检；
- [x] 请求确实到达真实 Ark，且没有 Mock/Fake fallback；
- [ ] Probe A：真实中文文本与 JSON；当前被 `ModelNotOpen` 阻断；
- [ ] Probe B：真实结构化教学建议；当前被 `ModelNotOpen` 阻断；
- [ ] Probe C：真实图片 URL；当前为 `not_tested`；
- [ ] Probe D：JSON Object、JSON Schema、Function Calling；当前均为 `not_tested`；
- [ ] 真实 Gate 2.5 备课闭环；
- [ ] ModelExecution 状态、Usage、延迟与脱敏 Request ID；
- [ ] 普通离线测试回归；
- [ ] 火山方舟控制台在线推理调用次数确认。

## 当前结论

2026-07-31 20:10:45（北京时间，12:10:45 UTC）执行了严格 Live Probe。7 次在线推理请求均使用 `volcengine-ark`、指定北京 Base URL 与指定模型 ID，均获得了脱敏 Provider Request ID；Mock/Fake fallback 为 0。Provider 返回 HTTP 404，安全错误码为 `ModelNotOpen`，因此 Token Usage 为 0，未产生教学 Proposal。

同一 API Key 可以鉴权访问模型目录，且指定模型 ID 在目录中可见；当前阻塞点是该模型尚未对当前项目/API Key 开通在线推理，而不是 DNS、TLS、Base URL、Mock 回退或模型字符串拼写。模型开通后必须重新运行全部 Probe 与真实备课闭环，旧的失败记录不能作为能力通过证明。

工程实现已完成，但本文件尚未记录成功的真实 Ark 推理，也尚未收到产品所有者的控制台用量确认。因此状态保持 `PENDING`，Gate 2.6A 仍不得标记为完成，不得创建验收 Tag，也不得进入下一 Gate。

## 本轮测试记录

| 检查 | 结果 |
|---|---|
| Secret Scan | 通过，302 个文件 |
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
| Strict Live Vitest | 已实际联网、未 skipped；2 个测试均因 `ModelNotOpen` 失败 |
| Git diff check | 通过 |

长期开发 Volume `edu-agent-dev-postgres-data` 的创建时间在测试前后保持不变；`.env.local` 与本地上传目录未被测试链清理。真实 Gate 2.5 产品闭环遵循“基础 Probe 成功后再执行”的验收顺序，本轮因基础 Probe 被模型开通状态阻断而未启动，未创建任何真实 Ark Proposal。
