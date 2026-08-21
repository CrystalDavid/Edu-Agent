# 教师备课对话中的显式忘记命令

> 状态：Accepted for PR-2C1 implementation；不是 Verified Gate
> 生效日期：2026-08-21
> 决策版本：`explicit-forget-command-policy@1`

## 背景

PR-2B 已允许 owning teacher 用受控 Catalog 明确记住低风险 Lesson Preparation 偏好，但“忘掉案例偏好”仍只能引导到设置页。PR-2C1 增加确定性的对话式撤销，目标是让老师从命令成功返回起，后续新备课不再选取相应 TeacherPreference，同时保留治理和历史运行事实。

本决策不实现 PR-2C2 的正式 temporary override。“忘掉长期偏好”改变 durable Preference 的当前状态；“这次不要使用生活化案例”只描述某一次运行，应有独立的生命周期、Pack 和 Skill 输入。把二者合并会让临时要求意外撤销长期设置。

## 决策

### 1. Forget 是 revoke，不是 physical delete

显式 Forget 把 owner-scoped TeacherPreference 从 `active` 变为 `revoked`，创建新的 immutable Preference revision，并按现有每次 Preference mutation 的规则递增 `teacherMemoryEpoch`。它不删除 TeacherPreference、Revision、Candidate、MemoryApplication、Outcome、Conversation Turn 或 Audit。

Revision、Audit 和 Authorization 证明谁在何时撤销了哪一版偏好；历史 MemoryApplication 和 sealed Run 证明当时实际封存的上下文。删除这些记录既会破坏审计，也会把真实历史改写成“从未使用”。公开文案因此使用“后续新备课不再参考”和“历史运行仍保留当时记录”，不声称数据库已删除、Provider 已撤回输入或所有历史已清空。

### 2. “立即停止使用”的精确定义

成功回执返回前，Personalization 事务已经提交 `revoked` revision、epoch、Authorization、Audit 和 idempotency 结果。从此之后发起的 resolver 调用只选择 active Preference；新 Context Pack、新 ModelExecution 和新的 application decision 不再包含该 Preference。M0-lite 对历史 Run 仍按 immutable revision 显示当时 value/decision，并动态标注当前已撤销。

已经封存或已发送给 Provider 的运行不重写。当前平台没有 Provider continuation 或长期 Prompt cache，因此不需要 cache invalidation Worker；`teacherMemoryEpoch` 已进入 Pack V2 hash，为未来任何 cache/continuation 提供失效边界。

### 3. 纯确定性 Interpreter 与 Catalog

`explicit-forget-command-interpreter@1` 是纯 Domain 函数，不访问 Provider、Repository、PostgreSQL、embedding 或外部服务。它复用 `teacher-preference-catalog@1` 的 canonical key，只解析教案长度、详细程度、表达风格、案例偏好和建议篇幅。浏览器不提交 canonical key、Scope fingerprint、owner 或 consent 真值。

引用中的“忘掉”、negative remember、普通否定教学要求和 temporary override 不会触发 revoke。学生标签、成绩、健康、纪律、Secret、Evidence 正式事实、权限和审批等高风险目标 fail closed。原始命令只存在于 Work Conversation retention；Personalization 输入和表只使用解释后的 target、immutable Turn ref/sequence/hash 和受控元数据。

### 4. Scope 匹配与重新授权

初版只支持：

- 明确 global：匹配 `global + lesson-preparation`；
- 明确当前课程：匹配当前已授权稳定 `courseRunRef + lesson-preparation`；
- 未声明 Scope：只在 global 与当前 CourseRun 的 active matching Preferences 中确定候选；
- “全部”：仍先展示最多 10 个安全选项，必须显式确认。

它不根据 className 搜索，不支持命名 CourseRun、subject、grade、lesson、task 或其他 Skill。Scope 不是授权：每次 dispatch 和确认都重新验证 Session、ActingContext、Conversation、Task、CourseRun、Lesson、owner 和允许的 CourseRun refs；Personalization 再通过 typed Scope authorization Port 校验，不直接查询 Work/Education/Governance Schema。

### 5. unique、multiple 与多 target 原子性

每个 target 都唯一匹配一条 active Preference 时可以直接 revoke，因为命令、Catalog key 和 Scope 已确定，且只有 owning teacher 的一条候选。任一 target 出现多个匹配时，整条命令返回 `selection_required`，不修改 Preference、不增加 epoch；选项 refs 封存在 immutable assistant receipt Turn 中，确认 API 只接受这些 refs 的子集与 expected versions。

多 target 采用 destructive-safe 原子规则：全部唯一才在一个事务中全部 revoke；任一 target 无匹配、无法完整解析或需要选择时都不做部分撤销。一次确认选择两条 Preference 时沿用真实 mutation 规则，epoch 增加 2，而不是人为合并为一次。

### 6. Conversation / Personalization saga 与恢复

Composition 复用 PR-2B 的边界：

1. Work 幂等写 `teacher + command` immutable Turn；
2. 用 command Turn ref/content hash 派生稳定 Personalization idempotency；
3. Personalization 在单事务内匹配并 revoke，或返回只读 selection；
4. Work 幂等写 `assistant_surface + command` 安全回执；
5. 多匹配确认后追加 follow-up receipt，不更新旧 Turn。

Work 只保存最多 10 个 `teacher_preference_refs`，不复制 value/Scope 正文，也不直接写 Personalization。Personalization 不直接写 Work。刷新或 API 重启时，服务端以 receipt refs 通过 owner-scoped typed read Port 解析当前安全 view；浏览器 parser 不是恢复真值。

command Turn 已写但 Personalization 失败时，重试复用同一 Turn。Personalization 已提交但 Work receipt 失败时，重试 replay 同一结果并补 receipt，不再次 revoke 或递增 epoch。selection receipt 已写后，确认候选集合不重新模糊匹配；状态或 expected version 已变化则整次确认 fail closed。这里是 at-least-once + stable idempotency + immutable Turn + recoverable receipt，不声称跨 Schema exactly-once。

### 7. WorkingMemory 和模型边界

Forget 使用现有 `teacher + command` 与 `assistant_surface + command` 组合。两者可以推进 Conversation sequence，但不替换 activeGoal，不进入 recentTeacherRequests、pending teaching intent、temporaryOverrides 或 Prompt，也不创建 ModelExecution/Proposal。首条 Turn 就是 Forget 时 WorkingMemory 保持 null，含义是尚无教学生成目标。

Model output、Prompt 或 assistant Turn 均不能调用 Forget service；公开确认入口仍要求当前教师 Session 和持久化 receipt refs。

### 8. Feature flag、Migration 与回滚

`MEMORY_EXPLICIT_FORGET_ENABLED` 是独立的服务端非敏感 flag：local/test 默认开启，production 未显式配置时关闭。它不依赖 Explicit Remember 或 scoped Preferences，因为暂停新增记忆时老师仍应能够撤销既有记录。关闭后只停止新的对话式 Forget，返回设置页导航；设置页既有 revoke、普通 Conversation、Remember、WorkingMemory 和模型生成不受影响。

PR-2C1 不需要 Migration。Work 0013 已提供有界 Preference refs，现有 Preference revision、epoch、Audit 和 idempotency 已完整表达撤销与恢复；51 个既有 Migration 保持 byte-for-byte 不变。

运行回滚是把 flag 设为 false；不逆向 Migration、不删除历史 receipt，也绝不重新激活已经撤销的 Preference。未来若提供恢复偏好，必须是新的显式、受治理操作。PR-2C2 可以在不推翻本决策的前提下增加 run-scoped typed override、独立生命周期和 Pack 输入，但不能复用 durable revoke 状态。

## 未采用方案

- 让 LLM、embedding 或浏览器决定删除目标：不可确定并可绕过授权。
- 未声明 Scope 时默认删 global 或全部 Scope：会产生破坏性歧义。
- 物理删除 Preference 和历史 Run：破坏 immutable history 与审计。
- 更新 selection receipt：Turn 是 immutable，只能追加 follow-up。
- 把 temporary override 当 Forget：会把单轮指令错误提升为长期撤销。
- 新增 0014 或自由格式结果 JSON：现有 0013 refs 与 typed read 已足够恢复。
