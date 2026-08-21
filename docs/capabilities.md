# Edu-Agent 当前能力地图

> 状态：CURRENT
> 最新产品基线：`gate-2-10a-verified`（`bbba3428602bb148a3d73a201ad97fcb29181c1b`）
> 口径：`REAL` = 正式类型化 API + PostgreSQL 真值；`PARTIAL` = 核心链路真实但仍有明确未实现区域；`READ_ONLY` = 可查看但不可写；`DISABLED` = 明确禁用；`NOT_STARTED` = 尚未进入产品实现。

本文描述当前代码能做什么，不以页面是否存在、旧设计文档或未来计划替代可执行证据。匿名样例只负责初始化本机环境；加载后的业务操作仍通过正式 Repository/API 持久化。正式部署不执行样例 Seed。

## 1. 按普通教师端页面

| 页面 | 状态 | 当前可以完成 | 真值来源与主要 API | 所属模块 / 首次完成 Gate | 当前限制 |
|---|---|---|---|---|---|
| 概览 | REAL（教师工作投影） | 查看 Todo、日历、备课、待审计划、作业/批改、模型失败、课堂实施/反思和最近文件；创建个人 Todo；进入源业务 | PostgreSQL；`/teacher/workbench/overview`、`action-items` | Work 聚合读取；2.8，2.9 补充课堂事项 | 不在概览直接伪造源业务完成；学校宣传动态未进入产品范围 |
| 日程 | REAL | 日/周/月统一查看；创建、移动、完成或取消手工事件；将 Todo 安排为独立时间块；对源事项稍后提醒 | Work Schema；`calendar-events`、`todos/:ref/schedule`、workbench projection preference | Work；2.8 | 无共享/外部日历、复杂重复规则或自动排程；源业务日历项只读 |
| 教学 | REAL（当前范围） | 在统一 Workspace 中进入课程、课时、作业、课堂实施和反思；考试入口明确关闭 | 各子页面正式 API；页面路由由 Web 自定义 history router 解析 | Education / Work / Artifact；2.5、2.7、2.9 | 完整考试未开始 |
| 课程 | REAL | 读取 CourseRun → Unit → Lesson；查看 Journey、可解释 Lesson Brief、备课 Proposal、current approved plan、五类材料包、课堂实施、观察、反思与后续行动 | Education/Work/Runtime/Artifact PostgreSQL；lesson journey/brief/material-bundle 与既有 lesson API | Education / Work / Runtime / Artifact；2.5、2.9、Phase 8A | 当前为最小课程切片；无课程 CRUD、教材知识库、完整资源树或排课系统 |
| 作业 | REAL | 创建/修订草稿、显式发布/关闭/归档；载入匿名样例提交；逐题批改、确认/重开；查看可重算统计与学习依据；调整下一课 | Education Schema；`assignments`、`submissions`、`grading-queue`、`analytics`、`evidence`、`adjust-next-lesson` | Education / Work；2.7 | 无学生端自行提交、完整题库/考试或自动成绩发布 |
| 考试 | DISABLED | 页面明确显示暂未开放，不提供伪造结果 | 无 | 无正式状态所有者 | 无考试创建、发布、提交、批改或持久化闭环 |
| 学生 | PARTIAL | 查看当前 CourseRun 的匿名 enrollment、近期提交/确认 Evidence 和教师确认的 learner-scope classroom observation | Education PostgreSQL；`course-runs/:ref/enrollments`、`learners/:ref/evidence`、observations | Education；2.7、2.9 | 无正式学生身份、真实名单、长期画像或固定能力标签 |
| 文件 | REAL | 上传、下载、搜索、分类、排序、详情、新版本、软删除/恢复、绑定 Lesson/Task/TeachingPlan；导出 approved TeachingPlan DOCX；材料草稿逐项预览、重生成、采用与下载 | Artifact PostgreSQL + Capability LocalObjectStore；File API、DOCX export、lesson material-bundle API | Artifact / Capability；2.5B、Phase 8A-3 | 本地对象存储；PPT 当前是内容大纲 Markdown，不生成 PPTX；无分享、协作、云同步或文件内容入模 |
| Agent 一级页 | REAL（任务入口） | 读取服务器中的未完成备课任务，并从 Task、Todo、Reflection 等正式入口进入受限 Agent 流程 | 正式 deep link + lesson preparation Task API | Work / Runtime / Capability；2、2.5、2.8、2.9 | 不提供脱离 Task 的开放聊天、收藏或多 Agent 自动化平台 |
| Agent / Copilot | REAL | 封存 TaskWorkingSet/授权上下文；在同一备课 Conversation 中持久化教师请求、安全结果摘要和显式命令回执；用可重建 WorkingMemory 理解“再短一点/第二种”等延续要求；受控 Catalog 可把老师明确“记住”的低风险偏好写入 Personalization；Lesson Preparation 按 global/CourseRun 等结构化 Scope 确定性解析同 key 偏好；Proposal 与 Runs 显示本次参考、作用范围和覆盖原因；刷新或服务重启后恢复 | Work Conversation/Turn + Runtime WorkingMemorySnapshot/MemoryContextPackManifest V1/V2 + Personalization scoped Preference/application/outcome + Capability/Artifact PostgreSQL | 2.4、2.5、2.6A；记忆升级 M1 + M0-lite + PR-2A + PR-2B | “本次参考”只证明平台选入上下文，不证明模型完整采用；显式 remember 不是通用自然语言学习；不提供对话式忘记、正式仅本次、自动习惯学习或向量检索 |
| Teaching Plan | REAL | 查看 current approved、active in-review、draft、superseded/history；处置 Proposal；单独批准；显式完成备课；导出 DOCX | Artifact/Work PostgreSQL；lesson teaching-plan reads、proposal disposition、approve、export | Artifact / Work；2.4、2.5、2.5B | `published` 未实现；approved Revision immutable；正式导出只允许 current approved |
| Runs | REAL / READ_ONLY | 查看请求、安全上下文、ModelExecution、Usage、延迟、脱敏 provider request ID、Proposal、Audit 与 Outbox 状态 | Runtime/Capability/Governance/Work PostgreSQL；run/model detail API | 2.4、2.6A | 调试信息只读且不显示 Key、完整 Prompt/响应或隐藏推理 |
| 设置 | REAL（当前范围） | 查看用户、学校、角色、CourseRun access、活跃 Session；管理教师确认的 Agent 偏好，并选择“所有普通备课”或授权 CourseRun；显示“设置页明确确认/对话中明确记住”来源；撤销 Session；提交数据治理请求；管理员管理最小成员权限 | Governance / Personalization PostgreSQL；auth/session/workspace、personalization、organization/admin、governance request API | Governance / Personalization；2.10A、Phase 7A、PR-2A、PR-2B | UI 暂不暴露 subject/lesson/task 高级 Scope；无通知设置、MFA、SCIM 或完整学校后台；Scope 不是授权 |
| 管理员入口 | REAL（最小） | school admin 查看成员、安全事件，创建/激活/停用成员，分配 ordinary_teacher 和 CourseRun access | Governance PostgreSQL；`/api/v1/admin/*` | Governance；2.10A | 只在当前学校生效；不授予修改教学事实的超级权限；subject lead/homeroom 仅保留边界 |

`DEAD = 0` 的 Gate 2.5C 固化证据见历史 [教师门户功能矩阵](history/gates/teacher-portal-function-matrix.md)。未实现入口必须禁用，不能显示成功写入提示。

## 2. 按业务闭环

| 业务闭环 | 状态 | 当前真实能力 | 主要边界 / 限制 |
|---|---|---|---|
| 登录和工作空间 | REAL（本机） / PARTIAL（生产） | 手机号密码/一次性验证码、Local/OIDC Provider Port、HttpOnly Session、CSRF、登录/刷新/登出、多学校选择、Membership/Role/CourseRun access | 本机凭据只以摘要存在并映射林老师；provider-neutral OIDC 代码已存在，真实云 IdP、域名与生产 Secret 尚未配置 |
| 课程与课时 | REAL（最小切片） | CourseRun → CurriculumUnit → Lesson、目标、准备度、计划/任务/文件/实施汇总 | 无完整课程维护 |
| 备课 | REAL | Lesson → lesson_preparation Task → request/context → Proposal → in-review → approved → ready → explicit complete | 不包含完整课程资源树或自动完成 |
| 豆包模型生成 | REAL（可选） | 单一 `VolcengineArkProvider`、事务外 Worker、结构化校验/一次修复、预算、取消、重试、恢复、Usage | 默认离线 Provider 不联网；真实调用需合规数据授权；无多供应商/模型选择器 |
| TeachingPlan 审批 | REAL | draft → active in-review/superseded → current approved；教师处置和批准分离 | 未实现 published；approved 不可原地修改 |
| Lesson Journey 与材料包 | REAL（当前范围） | Lesson Brief 候选由教师采用；备课 Proposal 经教师批准后，按 approved Revision 生成教案、PPT 大纲、练习、板书、分层支持；单项重生成形成新 FileVersion | Projection 可重建且不写第二真值；无 approved plan 时禁止材料生成；无真实 PPTX/Office 编辑器或教材知识库 |
| 文件和 DOCX | REAL（本地） | FileAsset/FileVersion、LocalObjectStore、绑定、版本、删除保护、approved plan DOCX | 无云 ObjectStore、分享协作或 Office 完整预览 |
| 作业和提交 | REAL（教师端） | Assignment 生命周期/版本、immutable Attempt/Response、未交语义；本机可选匿名样例提交 | 无学生端、自助提交入口或完整题库 |
| 批改和 Evidence | REAL | grade draft/confirm/reopen，Evidence 来源链和可重算统计 | 自动评分只可作建议；不形成长期 learner estimate |
| 调整下一课 | REAL | 作业路径支持教师选择 Evidence 后创建 lesson prep Task；Reflection 路径支持显式生成最多三个版本化行动候选、教师修改/拒绝/接受，接受后才创建 Preparation Task、Assignment draft 或 TeacherTodo | Agent 不能读取未选择的全班提交；候选不自动执行，也不等于 Lesson/TeachingPlan 事实 |
| Todo 和 Calendar | REAL | 手工 Todo/Event、关联、安排、状态和 source-version reminder preference | 无共享/外部日历或自动工作流 |
| 课堂实施 | REAL | Delivery draft/confirmed/amended revision；planned vs implemented | 日历结束不会自动产生实施事实 |
| 课堂观察 | REAL | 教师确认的班级/Objective/活动/匿名 learner observation 与 supersedes 历史 | Agent 推断不是正式事实；不做长期能力标签 |
| 课后反思 | REAL | selected context → Agent draft → teacher confirm → `next-lesson-adjustment@1` 候选 → teacher decision → explicit follow-up | Reflection 不覆盖 TeachingPlan；确认 Reflection 或生成候选都不自动创建行动 |
| 学校成员管理 | REAL（最小） | Organization、Membership、Role、CourseRun access、suspend/reactivate、安全 Audit | 无完整组织树、人事系统或跨学校管理员 |
| 数据治理请求 | PARTIAL | 记录 export、de-identification/deletion 请求与状态基础 | 未实现导出/去标识执行 Worker、审批门户或 SLA |
| 教师偏好与个性化 | REAL（最小） | 候选 draft、教师确认/修改/拒绝/撤销、不可变 revision、valid time、global/subject/subject-grade/CourseRun/lesson/task 领域 Scope、Skill constraint 与 teacherMemoryEpoch；Lesson Preparation 按 task > lesson > course_run > subject_grade > subject > global 和 Skill-specific 优先解析；对话中明确的低风险 Catalog 项可直接确认，重复不增 epoch、冲突需老师替换/保留 | 设置页当前只暴露 global/CourseRun；显式 remember 只支持服务器 Catalog 和 global/当前 CourseRun；其他 Skill 兼容路径只读有效 global、无 Skill 限制偏好；无自由文本记忆、自动 Candidate、向量检索或未确认 Memory 入模 |
| 备课会话工作记忆 | REAL（第一轮 + 显式命令） | owner-scoped Conversation/不可变 Turn、最多六条近期教师要求、当前目标、指代、临时约束和最近安全结果引用；teacher command 与 assistant receipt 独立持久化、刷新/重启恢复且不进入 active goal/近期教师请求；确定性构建并版本化；显式 close API、到期排除与新会话隔离 | 只用于同一备课 Task 的短期连续性；只有明确、受控 remember 才可进入长期 Preference；不保存原始供应商响应、完整 Prompt 或隐藏推理；尚无关闭/遗忘 UI、正式临时 override、语义向量检索或跨任务行为学习；正式 retention 期限待产品确认 |
| 教师记忆应用观测 | REAL（M0-lite + V2） | Runtime 保留历史 `MemoryContextPackManifest@1` 并为新 scoped Lesson Preparation 封存 `@2`（query Scope、Skill、epoch、revision/hash 与 selected/overridden/excluded）；Personalization append-only 记录 durable Preference application/outcome；Provider retry 复用已封存 pack | 不复制 Turn、WorkingMemory、Preference value、完整 Prompt/响应/Evidence；“参考”不等于模型遵循；生产观测和 scoped feature flag 均 fail closed；正式 retention 待产品确认 |
| 考试 | DISABLED | 无伪造展示 | 正式领域、API、Persistence 均未开始 |
| 多模态 | NOT_STARTED（产品） | Ark capability probe 可探测 image URL | 文件/图片未进入正式模型上下文；无 OCR |
| 学生端 | NOT_STARTED | 无 | 当前只有教师查看匿名样例学习者 |
| 家长端 | NOT_STARTED | 无 | 无身份、页面或业务闭环 |
| 云部署 | NOT_STARTED（产品部署） | 本地 Docker PostgreSQL、LocalObjectStore、provider-neutral adapters | 未配置域名、HTTPS、托管 DB/ObjectStore、备份、监控或远程 E2E |

## 3. 当前产品定位

> 普通教师工作台的可运行产品基线，已具备正式身份和学校组织边界；正式云基础设施和学校试点运维尚未完成。

当前最强证据是：核心状态均来自七个 PostgreSQL Schema，写入经过服务端 Session → ActingContext → Authorization → owning Application Service，刷新与服务重启可恢复；当前最大缺口不是再增加教师页面，而是完成云基础设施、安全加固、运维、数据治理执行和小规模试点验证。

Phase 7A 已将 Phase 6 的 MemoryCandidate/TeacherPreference 边界产品化：新增前向 Migration、PostgreSQL Adapter、服务端会话授权 API 和教师设置界面。Context manifest 摘要随 AgentRun 持久化，只使用当前 tenant/teacher 的 active confirmed preference；撤销即时生效，历史 revision 保留。

记忆系统第一轮把“当前正在做什么”和“老师长期习惯”正式拆开：Work Schema 保存备课 Conversation/不可变 Turn，Runtime Schema 保存可由 Turn 重建的 WorkingMemorySnapshot。`lesson-preparation@6` 在保持当前请求最高优先级的同时，调用 scoped Preference resolver 并封存 Pack V2；`@1–@5` 继续用于历史恢复或 feature flag 兼容。临时要求不会自动晋升为 TeacherPreference。

M0-lite 在不扩大 Context 的前提下补上应用观测：Runtime 保存确定性的 pack manifest，Personalization 只记录 durable Preference application/outcome，读取端在当前授权下解析教师可见摘要。界面固定说明“参考不等于模型一定采用”。

PR-2B 为 Lesson Preparation Conversation 增加 `teacher-preference-catalog@1` 与纯确定性 `explicit-memory-command-interpreter@1`。只有 owning teacher 的明确 durable marker、完整白名单解析、低风险 canonical value、获权 global/当前 CourseRun Scope 和开启的服务端 flag 才能直接创建 Candidate + confirmed Preference；重复命令不增加 epoch，同 key/Scope 冲突只创建 draft Candidate，必须由老师选择替换或保留。command/receipt Turn 不创建 ModelExecution/Proposal，也不改变 WorkingMemory active goal。对话式忘记、正式“仅本次”、普通行为自动学习和 M3–M5 仍未实现。

PR-2A 增加的是结构化长期偏好作用范围，而不是自然语言记忆学习：同一 canonical key 可在 global 与不同 CourseRun 等 Scope 中同时 active，Resolver 使用确定性优先级选择最具体项，`teacherMemoryEpoch` 在确认、值/Scope/valid time 更新和撤销时递增。Scope 只描述适用性，每次运行和写入仍重新执行 Session、ActingContext、purpose、CourseRun/Task 与 field-mask 授权。自然语言“记住/忘掉/仅本次”、行为 Observation、Candidate 自动提炼、Episode/Habit、全文或向量检索仍未实现。

相关文档：[完整版本历史](version-history.md) · [当前架构](architecture/README.md) · [部署就绪差距](operations/deployment-readiness-gaps.md)
