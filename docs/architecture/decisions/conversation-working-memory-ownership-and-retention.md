# Conversation 与 Working Memory 的所有权、连续性和保留

> 状态：ACCEPTED
> 生效日期：2026-08-19
> 决策范围：教师备课会话记忆 M1
> 替代关系：无

## 背景

备课 Copilot 需要在同一 Task 中理解“再短一点”“按第二种继续”等延续要求，并在页面刷新、API 重启和 Provider 重试后恢复。这个连续性既不是长期教师偏好，也不能依赖某个 Provider 的历史消息；同时，对话文本会扩大隐私与保留面，必须限定所有权、内容和生命周期。

## 决策

1. `work` 拥有 `ConversationThread` 和不可变 `ConversationTurn`。Conversation 必须绑定 tenant、teacher、lesson-preparation Task、CourseRun 和 Lesson；任何 owner、Task、Turn 或 optimistic version 不匹配都 fail closed。
2. `runtime` 拥有版本化 `WorkingMemorySnapshot`。它是由已授权 Turn 确定性构建的派生运行状态，不是业务真值；任一时刻最多一个 active revision，旧 revision 只允许变为 superseded、invalidated 或 expired。
3. Provider continuation 不是平台真值。创建与重试 ModelExecution 都从 Work Turn 和封存的 Runtime snapshot 重建输入；Provider 切换、Provider state 丢失或 API 重启不得改变 Conversation 真值。
4. 封存执行必须用 `snapshotRef + tenant + teacher + conversationRef + sourceTurnSequence + contentHash` 精确恢复。引用、owner、来源序号、hash 或保留期任一不一致时 fail closed，禁止静默换用“最新”快照。非封存的显示或运维重建只能从 immutable Turn 运行指定 builder version，产生新 snapshot revision，不能覆盖旧 revision。
5. 当前教师请求优先级最高；历史 Turn 只帮助解析目标、指代、已选项和临时约束。Working Memory 或一句临时要求不得自动晋升为 TeacherPreference。

## 内容最小化

Conversation 只允许保存：

- 教师原话，单 Turn 最多 2,000 字符；
- 应用可见的安全结果摘要，最多 1,000 字符；
- TaskRun、AgentRun、ModelExecution 和 Proposal 的引用；
- 从上述内容确定性派生、带 source refs/hash 的有界 Working Memory。

Conversation、Turn 和 Working Memory 禁止保存完整 Prompt、完整 Provider 请求/响应、隐藏推理、Secret、完整 Evidence 或未授权业务对象副本。结构化 Proposal 仍由 Artifact 拥有，Evidence 仍由 Education 拥有。

## Retention、关闭与过期

- 新 Conversation 的 `retentionUntil` 由 `CONVERSATION_RETENTION_DAYS` 配置；未配置时暂用 30 天运行默认值。正式期限、学校级覆盖与法务口径均为**待产品确认**。
- Turn 继承所属 Conversation 的保留边界。每个 WorkingMemorySnapshot 的 `expiresAt` 必须小于或等于来源 Turn/Conversation 的 `retentionUntil`。
- `POST /teacher/conversations/:ref/close` 以 owner、version 和幂等键关闭线程；关闭后拒绝新 Turn/新调用，并将 active snapshot 标记为 invalidated。保留窗口内仍可读取最小化 Turn 历史。
- 到达 `retentionUntil` 后，API 将线程视为 expired，不再返回 Turn 内容，不再允许追加或进入新模型调用；Runtime 查询同时排除到期 snapshot。
- 已排队执行在显式关闭后仍可使用其未到期的封存 snapshot 完成或重试，但关闭后不再向线程追加新的 surface summary。到期后即使已有 ref/hash 也拒绝恢复。
- 当前 Migration 通过不可变历史和逻辑过期保证可审计、可回滚。到期数据的物理删除、去标识、Legal Hold、学校级期限、导出/删除 SLA 和备份清理为**待产品确认**；在决策前不得绕过不可变触发器实施临时删除。

## 备选方案

- 把 Conversation 放入 Personalization：拒绝。短期工作线程会与长期偏好、确认和撤销语义混淆。
- 只使用 Provider 历史消息：拒绝。无法保证 owner、授权、版本、切换 Provider 和重启恢复。
- 保存完整 Prompt/响应以便恢复：拒绝。增加不必要的敏感面，且平台可以从拥有者真值与封存引用重建。
- hash 失败时自动使用最新 snapshot：拒绝。会让重试使用不同上下文，破坏可审计性和确定性。

## 后果与回滚

M1 增加两个只向前 Migration、一次 Conversation 查询与有界 snapshot 构建成本；换来同 Task 连续性和可验证恢复。若需要回滚应用行为，Web/API 可继续使用兼容的 `requestVersion: 1` 单次请求路径并停止创建新 Conversation；已写入表和历史 Migration 不删除、不回写，待保留策略处理。
