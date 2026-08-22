# 教师记忆应用观测的所有权、失败语义和保留

> 状态：ACCEPTED
> 生效日期：2026-08-19
> 决策范围：教师记忆应用观测 M0-lite
> 替代关系：无

## 背景

同一备课 Conversation 已能恢复当前 Turn、WorkingMemorySnapshot 和已确认 TeacherPreference，但系统此前不能稳定回答“这次究竟参考了什么、为什么排除、老师后来是否采用”。这类记录必须可审计，又不能改变现有检索、截断、Prompt 权重或模型输出，也不能把短期工作上下文误写成长期教师记忆。

## 决策

1. `runtime` 拥有 `MemoryContextPackManifest@1`。它是 Context Builder 已经选定输入后的封存清单，不是新的检索器。manifest 随 AgentRun output 保存，包含 owner、Conversation/Turn/WorkingMemory refs、版本、hash、Preference decision、reason、允许影响、Token 估算、Skill/策略版本和排除数。
2. pack hash 对 owner、Conversation、Turn、snapshot、Preference revision、Skill、policy 和原有输入顺序做规范化哈希；`createdAt` 不参与 hash。Provider retry、Worker retry 和进程重启必须复用同一 pack ref/hash，不能重新选择“最新”上下文。
3. `personalization` 只拥有 durable TeacherPreference 的 `memory_application` 与后续 `memory_application_outcome`。当前 Turn 和 WorkingMemorySnapshot 分别属于 Work/Runtime，不写入 Personalization application 表，也不被称为 durable memory。
4. Runtime/Composition 只能通过 typed `MemoryApplicationRecorder` Port 写入 Personalization。Skill/Runtime 不直接写 Personalization SQL，Personalization 也不跨 Schema 写 Work、Runtime 或 Artifact。
5. selection 在 Provider 调用前 best-effort 记录。写入失败时 Runtime 把本次状态标为 `degraded`，输出安全错误并继续既有 ModelExecution；它不得改变 Proposal、扩大授权或把正式运行标为失败。
6. outcome 消费既有 `SuggestionDisposed` Outbox 事件，按 append-only、at-least-once 方式记录。事件只追加关联所需的 owner、AgentRun、disposition 和 resulting revision ref；观测失败不回滚正式 Proposal disposition。
7. UI 和 API 使用“本次参考了”。`injected` 只表示平台把该项选入模型输入，不能证明 Provider 或模型完整遵循，因此禁止使用“模型已经应用了”。

## 保存与不保存

canonical manifest/application 只保存 refs、版本、hash、受控 decision/reason、target fields/allowed effects、Token 估算、policy、审计和幂等字段。它们不保存 Turn 原文、Preference value 副本、WorkingMemory 文本副本、完整 Prompt、完整 Provider 请求/响应、隐藏推理、Secret、完整 Evidence 或跨学校资源正文。

RunExplanation 在读取时先执行当前 owner 授权，再分别通过 Work/Runtime owning service 解析教师可见的 Turn/WorkingMemory 摘要，并通过 Preference 不可变 revision 解析当时的 key/value。Preference 后来撤销时，历史 Run 可显示“本次运行当时参考，当前已撤销”；新的 Run 只读取 active confirmed Preference。

## Retention 与 Feature Flag

- application 记录 `retention_policy_version` 和 `retention_until`；outcome 随其 application 的 owner 与保留边界读取，且不得比相关审计要求保留更少。
- `MEMORY_APPLICATION_RETENTION_DAYS` 当前默认 365 天只是可配置运行值，生产期限、学校级覆盖、Legal Hold、备份清理和治理 SLA 均为**待产品确认**。
- application 与 outcome 不允许 UPDATE 或物理 DELETE。后续治理必须走获批的 redaction/tombstone 或清理 Worker，不能破坏不可变 Audit。
- `MEMORY_APPLICATION_OBSERVABILITY_ENABLED` 只控制新的 application/outcome 采集。设为 `false` 时 recorder 不写入，但 Runtime 仍封存当前 Run 的 pack，API 仍可在当前 Session、ActingContext、owner 授权与 retention 边界内读取既有 pack/application/outcome，Web 按 API 返回的数据继续显示历史解释；开关不会删除、隐藏、重算或改写历史记录。local/test 未显式配置时启用；`APP_ENV` 或 `NODE_ENV` 任一为 production 且未显式配置时关闭，生产只能用显式 `true` 开启新数据收集。

## 备选方案

- 把 Turn/WorkingMemory 复制到 Personalization：拒绝。会混淆短期运行状态与长期已确认偏好，并扩大敏感文本副本。
- 保存完整 Prompt/响应用于解释：拒绝。平台事实只需封存 refs/hash/decision，原文由 owning service 在当前授权下解析。
- selection 写入失败即阻断模型：拒绝。观测故障不应改变正式业务结果；Runtime 的 `degraded` 状态提供可见运维信号。
- 同步修改 disposition 事务中的 application：拒绝。跨 Schema 耦合会破坏 owning service 边界，Outbox 的幂等追加更符合既有模式。

## 后果、后续与回滚

每个新 Run 增加一个有界 manifest，以及每个被考虑的 durable Preference 一条 append-only application；处置后再追加 outcome。数据库唯一约束保证同一 Run、Preference revision 和 decision 不因重试重复写入。读取增加 owner-scoped Work/Runtime/Personalization 组合查询，但不会增加模型输入或改变输出语义。

回滚应用行为时关闭 feature flag 即可停止新的 application/outcome 写入；Migration 和既有历史记录保留，不删除、不回写，授权历史解释也不随采集回滚而隐藏。M2 可以在现有 decision/reason 与 policyVersion 上增加显式 scope/override/consent，但必须另做前向 Contract/Migration，不能把当前 application 日志改造成 Preference 真值。本 ADR 不授权 Candidate 学习、Episode/Habit、全文或向量检索。
