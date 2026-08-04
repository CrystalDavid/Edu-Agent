# Phase 7A Memory Persistence Audit

> 状态：实施前审计
>
> 基线：`codex/phase6-context-memory` / `2441b4bcbc4654774482d161353bb7b6605c130d`

## 1. 当前对象与生命周期

Phase 6 已在 `personalization-memory-analytics` 中建立纯领域和 Application 边界：

- `MemoryCandidate` 只允许 `preference` 与 `episodic`；owner 必须是 tenant 内的教师，禁止 learner/student owner；
- Candidate 由 `draft` 开始，可由 owning teacher 显式 `confirmed` 或 `rejected`，到期后进入 `expired`；
- Preference Candidate 被确认时创建 `TeacherPreference`；Preference 可从 `active` 进入 `revoked`；
- Candidate 与 Preference 都保存来源、版本、content hash，并通过 expected version fail closed；
- `MemoryCandidateService` 只依赖 `MemoryCandidateRepository` Port；
- 当前唯一 Adapter 是测试使用的 `InMemoryMemoryCandidateRepository`，Product Composition Root 未装配；
- Context Builder 当前只消费授权的 Platform snapshot，没有读取 Memory 或 Preference。

因此 Phase 6 的生命周期只能在单进程测试中运行，API 重启后不会恢复，也没有教师查看和治理入口。

## 2. 需要持久化的对象

### MemoryCandidate current + revision

需要持久化：

- candidate ref、tenant ref、teacher ref；
- type、结构化 content、sources、confidence、proposed by；
- status 与确认/拒绝/过期时间；
- current version、content hash；
- created by、created/updated/expires time；
- 每个不可变 revision，保证确认、拒绝和过期历史可追溯。

### TeacherPreference current + revision

需要持久化：

- preference ref、tenant ref、teacher ref；
- preference key/value；
- source candidate ref/hash；
- active/revoked status；
- current version、content hash；
- confirmed by、created/updated/revoked time；
- 每个不可变 revision，支持修改和撤销且不覆盖历史。

current 表用于受租户/教师约束的读取，revision 表用于审计和并发历史。正式删除不作为产品命令；教师界面的“删除”采用可审计撤销。

## 3. 不应持久化为 Personalization 事实的内容

- Course、Lesson、TeachingPlan、Evidence、GradeDecision 等 Platform 事实；
- Working Memory：仍属于 Runtime checkpoint/output；
- Task Memory：仍属于 Work Task/TaskWorkingSet 生命周期；
- 完整 Prompt、完整模型响应、隐藏推理或未授权 Evidence；
- 未确认的 Candidate 作为模型个性化输入；
- learner/student 长期画像、能力标签或跨学校聚合；
- Context snapshot 的第二份业务事实副本。

## 4. 数据库设计建议

在现有 `personalization` Schema 追加第 44 个前向 Migration：

| 表 | 用途 | 关键约束 |
|---|---|---|
| `memory_candidate` | Candidate current projection | tenant + teacher、status/type check、version/hash、无物理删除命令 |
| `memory_candidate_revision` | Candidate immutable history | `(candidate_ref, version)` 唯一，revision 内容不可更新/删除 |
| `teacher_preference` | Preference current projection | tenant + teacher、key、active/revoked、source candidate、version/hash |
| `teacher_preference_revision` | Preference immutable history | `(preference_ref, version)` 唯一，revision 内容不可更新/删除 |

Repository 使用 owning `edu_app` 权限，Runtime 只获得 active Preference 的只读结果。所有产品查询必须同时带 `tenant_ref` 与 `teacher_ref`；错误统一按当前工作空间返回 not found，避免泄漏跨学校存在性。

Migration 只向前：不修改、重排或重命名现有 43 个 SQL。回滚策略是发布前在隔离库验证；发布后采用修复型前向 Migration，不删除已写入的 Candidate/Preference 历史。

## 5. Context 与 Skill 版本结论

`lesson-preparation@1` 和 `@2` 已发布，必须保留。Phase 7A 不在原版本中新增字段，而是注册新的 `lesson-preparation@3`：

1. Model invocation service 根据 execution 的 tenant/actor 从 Personalization Port 读取 active confirmed Preference；
2. Context Builder 接收已经按 owner/tenant 过滤的 Preference snapshot；
3. manifest 记录 preference ref/version/hash、使用/排除原因和 token 估算；
4. prompt 只在 v3 中加入最小 preference key/value；
5. draft、rejected、expired、revoked 或其他学校的 Preference 不进入 Context；
6. 历史 v1/v2 Run 继续由原 Skill 解释和恢复。

## 6. 产品入口与权限

最小教师入口放入现有设置页，不新增一级导航：

- 查看待确认 Candidate 与 active/revoked Preference；
- 教师可提出自己的 Preference Candidate；
- owning teacher 可确认、拒绝、修改 active Preference、撤销；
- expected version 冲突返回结构化 `409`；
- Session/ActingContext 决定 tenant 与 teacher，浏览器不能提交或覆盖 owner；
- 所有写操作保留来源、生命周期与 Audit 所需 metadata，不提供物理删除。

## 7. 主要风险与验证点

- 原子确认必须同时保存 Candidate revision 与新 Preference revision；
- Preference 修改与撤销必须锁 current row 并校验 expected version；
- active key 的选择必须确定性，不能因重复候选造成不稳定 Prompt；
- Runtime 不得获得 Personalization 写端口；
- Product Container 只能装配 owning Application Service/Repository；
- PostgreSQL 测试必须覆盖跨重启恢复、跨校隔离、撤销后 Context 排除和并发冲突；
- Playwright 必须验证教师查看、确认、修改、撤销后刷新恢复。
