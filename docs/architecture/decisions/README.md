# Architecture Decision Records

本目录只存放从现在开始仍长期有效、难以逆转的架构决策。现有系统事实仍以 [当前架构](../README.md) 和 [模块边界规则](../module-boundary-rules.md) 为准。

- [Conversation 与 Working Memory 的所有权、连续性和保留](conversation-working-memory-ownership-and-retention.md)：Work/Runtime ownership、Provider continuation、内容最小化、close/expire、封存重建与 retention。
- [教师记忆应用观测的所有权、失败语义和保留](memory-application-observability.md)：Runtime pack manifest、Personalization application/outcome、best-effort 失败语义、读取文案、retention 与 feature flag。
- [Scoped TeacherPreference 与 teacherMemoryEpoch](scoped-teacher-preferences-and-memory-epoch.md)：Scope ownership、确定性覆盖、写入授权、valid time、Pack V1/V2、分阶段 Skill 迁移与回滚。
- [教师备课对话中的显式记住命令](explicit-teacher-remember-commands.md)：受控 Catalog、direct confirmation、duplicate/conflict、跨 Schema 恢复和 consent。
- [教师备课对话中的显式忘记命令](explicit-teacher-forget-commands.md)：确定性 revoke、Scope 选择、epoch、历史保留和恢复。
- [教师备课对话中的正式临时偏好覆盖](formal-temporary-preference-overrides.md)：Runtime ownership、current-conversation 生命周期、WorkingMemory V2、Pack V3、Prompt 优先级和回滚。

新增 ADR 时使用小写 kebab-case 文件名，并明确：背景、决策、备选方案、后果、生效日期和替代关系。旧架构包与阶段性设计只保存在 [`history/architecture/`](../../history/architecture/)，不得作为当前事实读取。
