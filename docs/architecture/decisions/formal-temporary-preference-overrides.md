# 教师备课对话中的正式临时偏好覆盖

> 状态：Accepted for PR-2C2 implementation；不是 Verified Gate
> 生效日期：2026-08-22
> 决策版本：`temporary-preference-override-policy@1`

## 背景

M2A 已能按 Scope 选择长期 TeacherPreference，M2B/M2C1 已提供受控的显式记住与撤销，但普通备课仍缺少一种不会改变长期习惯的结构化表达：老师可能只想让当前 Conversation 的公开课教案更详细，或暂时不使用生活化案例，并希望后续同一 Conversation 继续生效、关闭后自动消失。

PR-2C2 只为 Lesson Preparation 增加受控的 current-conversation temporary override。它不把临时要求提升为 durable Preference，不创建 Candidate，不增加 `teacherMemoryEpoch`，也不开始行为 Observation、Episode、Habit、检索或 Provider continuation。

## 决策

### 1. Runtime 拥有 Temporary Override

Temporary Override 是某次已授权运行的短期上下文状态，而不是教师长期画像。Runtime 已拥有 WorkingMemorySnapshot、Context Pack 与本次运行的 sealed context，因此由 Runtime 定义 override Contract、确定性 Interpreter、生命周期、版本与 hash；Work 仍只拥有 Conversation 和原始 teacher Turn，Personalization 仍只拥有 durable TeacherPreference。

### 2. 不写 Personalization，也不增加 epoch

临时替换、suppress 或 clear 都不创建/更新/revoke TeacherPreference，不创建 MemoryCandidate，也不复制到 Personalization application 表。`teacherMemoryEpoch` 只表示 durable Preference mutation；临时状态改变时 epoch 前后必须相等。这样可避免“这次详细”被误记成“以后都详细”，也避免无意义地使长期记忆 cache/version 失效。

### 3. 不允许 consolidation

每个 typed override 固定 `eligibleForConsolidation=false`。后续 M3 不得把 override 的存在、重复使用或模型输出当作习惯证据；若未来学习教师行为，必须使用独立、最小化、经评测和教师确认的 Observation/Candidate 流程。

### 4. 生命周期是 current_conversation

初版生命周期固定为 `current_conversation`，并绑定 owner、Conversation、Task、CourseRun、Lesson、unversioned Skill ID、来源 Turn 与 Conversation expiry。它从应用 Turn 起进入新的 WorkingMemorySnapshot；同一 Conversation 后续普通 Turn 继承。clear、close、expire、Task 进入 completed/cancelled，或新 Conversation 会使 active set 不再进入新 Context。Task 后来 reopen 也不会复活旧 Conversation 的 override；老师需要建立新的 Conversation。

新 Conversation 不继承，因为 Conversation 是明确、可见且可授权的工作边界；Task 相同不等于老师仍希望延续一次性要求。跨 Conversation 的 task-wide override 需要新的生命周期 Contract、显式创建/清除 UI、Task ownership/retention、冲突与审计设计，不能静默扩展本决策。

### 5. replace、suppress 与 clear

- `replace_value`：以 Catalog 中的安全 canonical value 临时替代同 canonical key 的 durable value；
- `suppress_preference`：本 Conversation 不向模型注入该 canonical key 的 durable value；
- `clear`：为指定 canonical key 或整个 active set 创建新的 append-only WorkingMemorySnapshot，不更新旧 Snapshot，也不修改长期 Preference。

同 key 后来的 override 确定性 supersede 先前 override。clear 后已经 sealed/queued 的 Run 保持原 Snapshot/Pack，新 Run 使用清除后的 active Snapshot。

### 6. 普通教学指令不自动成为 typed override

当前 teacher Turn 始终是最高优先级指令，但只有同时具备受控临时 marker 和 Catalog 完整匹配的低风险子句才建立 typed override。“不要安排小组讨论”等开放教学要求继续作为普通 model instruction；平台不把所有自然语言否定或风格表达伪装成已理解的偏好状态。可分离的剩余教学要求原样保留在 teacher Turn，并继续进入当前请求。

### 7. Catalog 与 Runtime Port

Runtime Interpreter 是纯确定性 Domain 函数，不导入 Personalization Repository、PostgreSQL、Provider、embedding 或网络。它只依赖 typed `TemporaryPreferenceCatalogPort`；Composition Adapter 将 Personalization-owned `teacher-preference-catalog@1` 暴露为只读、版本化、带 content hash 的安全视图。浏览器不能提交 canonical key/value、owner、Scope fingerprint 或策略真值。

### 8. WorkingMemory V1/V2

历史 `WorkingMemoryViewV1Schema` 和 `working-memory-builder@1` 不改写。feature flag 开启时，新 Snapshot 使用 V2，在原字段外保存最多 10 条 typed override；hash 包含规范化 override set，但不保存额外原始 Turn 文本、Prompt 或 Provider response。V2 写入现有 Runtime `temporary_overrides jsonb`，因此无需改表。关闭 flag 时，新 dispatch 回到 V1，历史 V2 仍可读取。

Snapshot append-only：新 Turn 产生新版本，旧 active Snapshot 被 supersede；事务失败时 Turn 与 Snapshot 一起回滚。Snapshot expiry 不晚于 Conversation/Turn，close/expire 后不能作为 active context 读取。

### 9. Pack V1/V2/V3

历史 Pack V1/V2 原样解析，不后台改写。新 `MemoryContextPackManifest@3` 在 V2 的 owner、query Scope、Skill、epoch 与 durable Preference decisions 上增加：override policy、typed override set hash、最小 override decision entries、injected/suppressed 计数。Pack 不复制原始命令、WorkingMemory 文本、Prompt、Provider response 或 Evidence 正文。

当前 teacher instruction 高于 temporary override，temporary override 高于 durable Preference。Runtime 在 resolver 返回后按 canonical key 做确定性 post-process；命中的 durable Preference 记录 `overridden/current_instruction_override`。临时项只写 Runtime Pack，不伪造成 durable application row。

### 10. lesson-preparation@7

只有 `lesson-preparation@7` 使用 WorkingMemory V2、typed override 和 Pack V3；`@1–@6` 继续保留供历史恢复。Prompt 只接收服务器封存的 model-visible canonical key/effect/value，并维持“当前请求 > 临时要求 > 已确认长期偏好 > 其他辅助上下文”的顺序。其他 Skill 不读取 temporary override。

### 11. Provider retry 使用 sealed state

首次排队时，Runtime 将 WorkingMemory Snapshot ref/version/hash、Pack V3 和实际模型输入封存到 AgentRun/ModelExecution。Provider retry 与 repair 均复用这组 sealed state；repair 从原始封存请求中验证并复制 typed override，不重新解释原始 Turn，也不重新读取当前 WorkingMemory 或 durable Preference。clear 或后续 Preference 修改不会改变旧 queued Run。

### 12. Prompt injection 与敏感内容

Interpreter 对 Secret、学生能力/健康/纪律标签、成绩、正式 Evidence、跳过审批、调用工具和忽略系统提示等内容 fail closed。混合 durable/temporary marker 返回 unsupported，避免同时写 durable 与 temporary。typed override 不保存 raw teacher text；原文只按 Work Conversation retention 保存。Model output、assistant receipt 和浏览器都不能创建 override。

### 13. Feature flag 与回滚

`MEMORY_TEMPORARY_OVERRIDES_ENABLED` 是服务端非敏感 flag：local/test 默认开启，production 未显式配置时关闭。由于 Pack V3 延续 scoped resolver/Pack V2，当前实现还要求 `MEMORY_SCOPED_PREFERENCES_ENABLED=true`；任一前提关闭后新消息仍作为普通 teacher instruction 生成，不创建 typed override。只关闭 temporary flag 时新 WorkingMemory 使用 V1、新 scoped Lesson Preparation 继续使用 `@6`/Pack V2；关闭 scoped flag 时沿用其 `@5` global-only 回退。已存在 V2 Snapshot、Pack V3 和历史解释保留可读。

运行回滚只需关闭 flag；不逆向 Migration、不删除 Snapshot、不重算历史 Run，也不改变 durable Preference。历史页面仍按 sealed Pack 解释当时状态。

### 14. 不需要 Migration

Runtime Migration 0007 的 `temporary_overrides jsonb NOT NULL` 已能容纳版本化 V2 payload，现有 Snapshot row 已保存 `builder_version` 和 `content_hash`；Personalization 0003 的 decision/reason 约束已允许 `overridden/current_instruction_override`。因此 PR-2C2 不新增或修改 SQL，registry 与文件数保持 51。

## 后果

正向结果：老师可以明确设置、延续、替换、suppress 或清除当前 Conversation 的偏好，而长期 Preference、revision 和 epoch 保持不变；Proposal/Runs 能解释本次要求、持久偏好被覆盖原因和历史 sealed state；刷新、API 重启与 Provider retry 可恢复。

代价与风险：每个相关 teacher Turn 会增加一个 append-only WorkingMemory Snapshot；Pack 和模型输入增加少量结构化字段；Catalog 只覆盖已测试的低风险键值，超出范围的话语继续按普通指令处理。具体 Conversation retention 期限仍待产品确认。

## 未采用方案

- 把 override 写成 TeacherPreference/Candidate：会混淆临时状态与长期 consent，并污染 M3 学习样本。
- 让 LLM 或浏览器 canonicalize：不可确定，且可绕过 Catalog、owner 与策略边界。
- 用 latest text 在 retry 时重新解析：会让同一 ModelExecution 因清除或新 Turn 改变输入。
- 让 Task 下所有 Conversation 自动继承：缺少独立 consent、retention、冲突和清除语义。
- 修改现有 Migration 或追加空 Migration：现有 JSONB 与 decision 约束已经满足版本化写入。
