# Scoped TeacherPreference、teacherMemoryEpoch 与 Pack V2

> 状态：Accepted for PR-2A implementation；不是 Verified Gate
> 生效日期：2026-08-20
> 决策版本：`teacher-preference-scope@1`

## 背景

Phase 7A 的 `TeacherPreference` 只有 owner、key/value 和 active/revoked 语义。M1 与 M0-lite 已分别解决同一 Task 的短期连续性和“本次参考”观测，但无法表达“这条长期偏好只适用于哪门课程、课时、任务或 Skill”，也无法在同一 canonical key 存在多条偏好时给出稳定覆盖结果。

PR-2A 只解决结构化作用域和确定性解析。它不解析“这次写详细一点”的自然语言冲突，不实现“记住 / 忘掉 / 仅本次”，也不从行为自动形成 Candidate、Episode 或 Habit。

## 决策

### 1. Scope 由 Personalization 拥有

`TeacherPreference` 是 durable、由教师确认的个性化状态，因此 canonical key、Scope、valid time、explicitness、consent 和不可变 revision 都由 Personalization Schema 持有。Runtime 只拥有本次 query 与解析结果的封存清单，不拥有或修改 Preference。

Scope 支持：

```text
task > lesson > course_run > subject_grade > subject > global
```

同一 Scope 下，带当前 unversioned Skill ID 的记录优先于 unrestricted 记录；之后依次使用 explicitness、version、updatedAt、preferenceRef 作为确定性 tie-breaker。Resolver 不使用 LLM、embedding、更新时间截断或随机排序。

### 2. Scope 不是授权

Scope 只声明“适用于哪里”，不能证明教师能访问该资源。每次写入和运行仍重新解析 Session、ActingContext、purpose、CourseRun access、Task、Lesson 归属与 requested field mask。

Personalization 不查询 Education、Work 或 Governance Schema，也不建立跨 Schema foreign key。它调用 typed `TeacherPreferenceScopeAuthorizationPort`；Composition Adapter 再通过 owning facade 校验。越权、外校、不存在或归属不匹配统一 fail closed，不返回 foreign 名称或存在状态。

### 3. class 初版使用稳定 courseRunRef

“班级”在当前平台中没有独立且稳定的长期业务标识，CourseRun 已同时绑定学校、学科、年级、学期和教学班访问范围。因此 UI 显示教师可读名称，但 canonical Scope 只保存 `courseRunRef`。禁止保存 className、可重命名中文显示文本或浏览器自报 owner ref 作为真值。

### 4. Scope kind 与 Skill constraint 分离

业务 Scope 回答“在哪个课程/课时/任务适用”，`skillIds` 回答“哪些 Skill 可使用”。二者分开可避免把版本化 `lesson-preparation@6` 固化为长期偏好。Skill 升级继续使用稳定 family ID，例如 `lesson-preparation`；数组经去重、Unicode NFC 和排序后参与 fingerprint。

### 5. canonicalKey 与覆盖

初版 `canonicalKey` 等于规范化的现有 `preferenceKey`。同一 owner + canonicalKey + scopeFingerprint 最多一条 active row；不同 Scope 可同时 active。Resolver 只在同 canonical key 内覆盖，更具体 Scope 产生 `more_specific_scope`，同 Scope 的 Skill-specific 胜出产生 `more_specific_skill_scope`。

本阶段不自动把“篇幅”“长度”“回答长短”合并，也不让模型解释语义冲突。当前 Turn 仍位于 Prompt 的最高教师指令层；结构化 Preference 只是辅助上下文。自然语言 canonicalization 属于 PR-2B，正式“仅本次”冲突状态属于 PR-2C。

### 6. valid time

硬过滤要求 `validFrom <= at`，且 `validUntil` 为 null 或 `at < validUntil`。尚未生效与已过期项只产生最小 ref/hash exclusion，不注入 value。旧 Preference 前向回填 `validFrom = confirmedAt`、`validUntil = null`、global Scope。

### 7. teacherMemoryEpoch

`personalization.teacher_memory_state` 以 tenant + teacher 为主键。Preference confirmation、value update、Scope/valid time update 和 revoke 在同一事务中使 epoch 加一；读取不递增。epoch 进入 Pack V2 hash，用于稳定解释当前选择，并为未来 cache 或 continuation 失效提供版本边界。

已封存 Run 保存运行时 epoch。后续 Preference 更新不会改写旧 Run，也不会重新计算历史 Pack。epoch 本身不是授权凭据，也不触发 Provider continuation；PR-2A 不实现 continuation。

### 8. Pack V1/V2 兼容

`MemoryContextPackManifest` 是 V1/V2 discriminated union：

- V1 保持 M0-lite 的全局偏好语义，历史 Run 原样读取并显示“旧版全局偏好上下文”；
- V2 增加 query Scope hash、unversioned Skill ID、retrieval policy、teacherMemoryEpoch、每条 Preference 的 Scope fingerprint/specificity/Skill match 和计数；
- `createdAt` 不进入 hash；owner、Conversation/Turn/Snapshot、Skill、query、epoch、Preference revision、Scope 和决策进入 hash；
- Provider retry 读取 AgentRun 中已经 sealed 的 pack/hash，只解析当时 injected immutable revisions，不重新选择当前 Preference。

Manifest 不复制 Turn 原文、WorkingMemory 文本、Preference value、完整 Prompt、Provider 响应、隐藏推理或 Evidence 正文。

### 9. 分阶段 Skill 迁移

只有 `lesson-preparation@6` 使用 scoped resolver 和 Pack V2。`@1–@5` 保留用于历史恢复；feature flag 关闭时新的 Conversation 请求回到 `@5`。

Lesson Analysis、Material Generation、Classroom Reflection、Reflection Analysis 和 Next Lesson Adjustment 暂时继续调用兼容 Port，只读取当前有效的 global、`skillIds=[]`、active confirmed Preference。这样可防止 CourseRun/Lesson/Task scoped row 被无差别注入未迁移 Skill；这是有意的分阶段迁移。

### 10. application/outcome

PR-1 的 append-only application/outcome 流程继续复用。V2 application 的 `scope_hash` 使用 query Scope hash，并记录 injected、overridden 或 excluded 决策。写入仍是 best effort，失败只标记 observability degraded，不阻塞 Provider 或改变 Proposal；at-least-once 重试由既有 idempotency key 和唯一约束去重。

### 11. Feature flag 与回滚

`MEMORY_SCOPED_PREFERENCES_ENABLED` 是服务端非敏感配置：local/test 默认开启，production 未显式配置时关闭。

关闭时：

- API 拒绝新增/修改非 global 或带 Skill constraint 的 Scope，只允许 unrestricted global（`skillIds=[]`）；
- Web 隐藏 Scope 控件且不加载 CourseRun 选项；
- 新 Lesson Preparation 使用 `@5` global 兼容路径；
- 已有 scoped rows、epoch、Migration、历史 V2 Run 和 application/outcome 保留；
- Conversation、WorkingMemory 和 M0-lite 不受影响。

回滚不删除数据、不逆向 Migration、不重算历史 Run。

### 12. Retention 与隐私

Scope 元数据和 epoch 随 TeacherPreference/current revision 治理；application/outcome 继续遵守其配置化 retention。具体生产期限、学校覆盖、Legal Hold、导出与 redaction/tombstone 清理仍待产品负责人确认。撤销项不进入新 Resolver；为了新运行的解释，不重新暴露已撤销 value。

### 13. 为什么不需要全文或向量检索

当前问题是少量、显式、结构化 key 的适用范围和冲突。owner/valid time/Scope/Skill 硬过滤加 canonical key 覆盖能给出可测试、可解释、低延迟结果。全文或 embedding 会引入非确定性、额外隐私面和评测成本，且不能替代授权或 structured Scope，因此不在 PR-2A 引入。

## 后果

正向结果：同一 key 可在 global 与 CourseRun 等 Scope 并存；选择、覆盖、历史解释和 retry 都可确定性恢复；旧客户端省略 Scope 时仍创建 global；旧 Skill 不会误收 scoped row。

代价与风险：每次确认/更新增加一次 epoch upsert；Resolver 需要读取 owner 的 active Preference 并在内存分组；设置页初版只暴露 global/CourseRun；跨 Schema ref 没有数据库 FK，必须依赖 typed authorization Port 和测试。后续 PR-2B/2C 可以在不改写本决策的前提下增加 consent 来源、canonicalization 与正式 override 状态。

## 未采用方案

- 用 className 作为 Scope：不稳定、可重命名且不能承载授权。
- 让 Prompt/模型自行选择冲突偏好：不可确定、不可审计。
- 把 Current Turn 或 WorkingMemory 写成 TeacherPreference：混淆短期状态与 durable consent。
- 立即迁移全部 Skill：扩大回归面并可能误注入 scoped 内容。
- 立即引入 FTS/embedding/vector database：当前没有必要的召回问题或评测证据。
