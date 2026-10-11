# 普通教师端功能矩阵

> 状态：HISTORICAL。本文只保留 Gate 2.10A 当时的功能矩阵，不再作为当前产品入口。
> `REAL` = 真实类型化 API + PostgreSQL；`MOCK` = 前端数组、组件状态或确定性模板；`READ_ONLY` = 只读演示；`DISABLED` = 明确不可操作；`DEAD` = 有入口但无响应或伪成功。

| 页面 / 功能 | REAL | MOCK | READ_ONLY | DISABLED | DEAD |
|---|---|---|---|---|---|
| 概览 | 今日 TeacherTodo/CalendarEvent、来源 action items、待批改、待审核计划、未完成备课、待记录实施、待反思、模型失败、最近课时/文件均来自 PostgreSQL；可创建个人 Todo | 备课组动态、学校动态仍来自前端数组 | 所有 Mock 区均明确标注只读演示 | 制作课件、协作写操作明确禁用 | — |
| 日程 | TeacherTodo CRUD/状态/偏好/资源关联、CalendarEvent CRUD/状态、Todo 安排日历、来源业务投影、日/周/月统一 API、URL view/date 恢复、source snooze/restore 全部为真实数据；已结束课程提供实施/反思入口但不自动创建事实 | 当前筛选和未保存 Modal 表单仅为视图状态 | 来源业务日历项只读，进入源页面修改 | 外部/共享日历、复杂重复日程、自动完成源事项未实现 | — |
| 教学 / 课程 | CourseRun → CurriculumUnit → Lesson、教学目标、备课状态、计划、关联 Task、课堂实施 Revision、confirmed 观察、Reflection、显式后续行动，以及关联参考文件/正式 DOCX 均为真实数据；计划、实施、观察和反思严格分区 | 页面内未写入 URL 的临时 Unit 选择与未保存课堂表单是视图状态 | confirmed 历史 Revision 只读 | 课程 CRUD、自动生成实施事实未实现 | — |
| 教学 / 作业 | Assignment 草稿/版本、显式发布/关闭/归档、12 名匿名提交、未交、逐题批改草稿/确认/重开、题目与 Objective 表现、共性错误、selected Evidence 创建下一课 Task 全部经类型化 API + PostgreSQL | 页面当前选择、筛选和未保存表单仅为视图状态 | Submission 内容是明确标记的合成演示数据 | 已发布内容原地修改、自动发布/自动评分发布被拒绝 | — |
| 教学 / 测试 | — | 测试列表、指标、知识点与题目分析 | 合成分析结果 | 测试 CRUD/发布未实现 | — |
| 学生 | CourseRunEnrollment、近期 Assignment/Submission 状态、current teacher-confirmed Assignment Evidence，以及明确 learner 范围的 confirmed classroom observations 来自 PostgreSQL | 当前 learner 选择是视图状态 | 12 名匿名 learner 与提交内容为合成演示数据 | 长期能力标签、正式学生写入、自动结论未实现 | — |
| 文件 | 原有 FileAsset/FileVersion/Binding/LocalObjectStore 能力不变；新增 Assignment 与明确 AssignmentVersion 参考/附件绑定并校验 tenant | 筛选、排序与预览滚动位置是临时视图状态 | Office 文件显示文件信息、本地提取摘要与下载，不做完整浏览器渲染 | 在线新建、分享、协作、云同步明确禁用；正式成果删除、手工替换版本和手工改绑均被拒绝 | — |
| Agent 一级页 `/agent` | 进入“创建教学任务”可转到真实 Copilot | 开放对话、关键词回复、上下文、收藏、重命名和删除 | 固定 Mock 回复 | 外部模型和长期会话未实现 | — |
| Agent / 备课 Task `/agent/tasks/:taskRef` | 读取真实 Task/context；Todo handoff 将 sourceTodoRef 和明确 resource refs 写入 TaskWorkingSet Revision；创建 durable ModelExecution；显示 queued/running/validating/retry/terminal 状态；可取消、人工 retry、刷新恢复；配置 Ark 时经服务端真实调用 | 默认 local/test 使用确定性 Mock；Ark 配置不完整时明确回退 | completed Task 可补充生成仅供拒绝/延后审阅 | 无 Lesson/approved baseline、ready/cancelled 或越权上下文 fail closed；Todo 不被 Agent 自动完成 | — |
| Agent / 课后反思 `/agent/reflections/:reflectionRef` | 显示 selected Delivery/Observation/Evidence、TaskWorkingSet、授权与 ModelExecution；生成、取消、retry、刷新恢复 Reflection draft；教师编辑后独立确认并显式创建后续行动 | 默认 local/test 使用确定性 Mock | confirmed Reflection 和历史只读 | 模型确认课堂事实、自动修改计划或自动创建后续行动均被拒绝 | — |
| Copilot / Proposal | Lesson/Task-scoped TaskRun、ModelExecution、1–3 条经校验策略、Proposal、diff、Evidence、Disposition、直接 URL 和刷新恢复 | Mock 模式下建议内容是确定性合成模板 | 已处置 Proposal 和历史 Evidence 只读 | 同一 Proposal 冲突处置、无效 Provider 输出和越权 Evidence 被拒绝 | — |
| Teaching Plan | current approved、active in-review、draft、superseded、history、继续审阅、独立批准、返回 Task/Lesson、显式完成；active in-review 不再误标历史；明确 approved Revision 导出 DOCX、查看/下载版本 | — | 历史 immutable Revision 只读 | draft/in-review 正式导出、approved 原地编辑和无 approved plan 的完成命令被拒绝 | — |
| Runs | request、Lesson、Task、TaskWorkingSet、AuthorizedContextPlan、ContextManifest、ModelExecution、Provider/展示名、PromptBundle 版本、Token、延迟、估算费用、脱敏 request ID、Proposal、Plan/Work、权限、Audit 与 Outbox；active execution 自动刷新至 terminal | — | 运行解释和安全模型摘要只读 | 不显示 Key、Base URL、完整 Prompt/响应、错误体或隐藏思维链 | — |
| 登录 / 工作空间 | Local/OIDC Provider Port、HttpOnly Session、登录/刷新/登出、Session 过期/撤销、多学校选择与恢复均为正式 API + PostgreSQL；本地 Adapter 使用合成身份 | — | 本地登录选项明确标为合成演示身份 | production 未配置 OIDC 时 fail closed；邮件邀请、MFA、SCIM 未实现 | — |
| 设置 | 真实用户/学校/角色/CourseRun scope、active Session 及撤销、数据治理请求；school admin 可管理成员状态、角色、CourseRun access 和安全事件 | 记忆、通知与偏好仍是本地视图演示 | 角色扩展说明、数据保留说明只读 | 普通教师管理学校成员、跨学校授权和直接删除历史被拒绝 | — |
| Style Guide | — | — | 字体、组件和 Design Token 展示 | — | — |

Gate 2.5–2.5C 备课/文件链、Gate 2.6A 模型执行、Gate 2.7 作业/Evidence、Gate 2.8 工作台和 Gate 2.9 课堂反思继续为 `REAL`。Gate 2.10A 将这些产品路由统一置于服务端 Session、Membership、Role 与 CourseRun access 之后；默认身份和模型测试均使用本地 Fake/Adapter，不发起公网请求。考试和开放 Agent 对话仍明确为 Mock/READ_ONLY。`DEAD = 0`。

## 关键持久化边界

### 刷新、页面重开和服务重启后可恢复

- CourseRun、CurriculumUnit、Lesson、LearningObjective 和 Lesson 的计划/备课投影；
- `lesson_preparation` Task、状态版本、状态历史和 `approved_plan_ref`；
- TaskWorkingSet 当前版本及不可变 revisions；
- Teacher Task request、TaskRun 和 ResolvedLearningInteractionContract；
- 每次运行重新生成的 AuthorizedContextPlan 与 sealed ContextManifest；
- Proposal、策略、diff、Evidence 引用和 SuggestionDisposition；
- Lesson/Task-scoped draft、active in-review、superseded、current approved 和历史 Revision；
- Authorization、Idempotency、Audit、Outbox 及 Consumer Effect。
- ModelExecution lifecycle/event、ModelDataManifest、budget decision、usage/cost 和 capability snapshot。
- FileAsset、immutable FileVersion、Lesson/Task/TeachingPlan binding、文件命令幂等、Audit/Outbox；
- `.demo/uploads/objects` 中由 object key 定位的文件字节，以及 approved TeachingPlan DOCX 成果。
- CourseRunEnrollment、Assignment/immutable version/item、Submission/immutable Attempt/Response、GradeDecision 历史、EvidenceObservation 与来源/替代关系；
- Assignment 派生统计、调整下一课 TaskWorkingSet 的来源 Assignment/题目/selected Evidence，以及后续 Proposal/TeachingPlan。
- TeacherTodo、Todo 资源关联、CalendarEvent、TodoCalendarLink、不可变状态历史；
- 可重建 TeacherWorkProjection、source-version-bound TeacherWorkPreference，以及 Todo Agent handoff 的 TaskWorkingSet Revision。
- LessonDelivery 与 immutable DeliveryRevision、ClassroomObservation 与 ObservationRevision、确认/修订历史；
- LessonReflection Artifact/Revision、selected implementation/observations/Assignment Evidence、ModelExecution 与显式 follow-up relations。
- UserAccount、ExternalIdentityLink、School、Membership、RoleAssignment、CourseRunAccess、OIDC Login State、hashed Session、SecurityEvent 和 DataGovernanceRequest。

### 刷新后丢失或恢复为演示初始状态

- 日程/Todo 未保存表单、当前筛选；当前 view/date 保存在 URL，正式 Todo/Calendar/投影/偏好不丢失；
- 未写入 URL 的课程页临时 Unit/Lesson 选择（从 Lesson 深链进入时可恢复）；
- 作业页未保存表单、筛选和当前选择；正式 Assignment/Submission/Grade/Evidence 不丢失；
- 学生页当前 learner 选择；Enrollment、Submission 和 Evidence 不丢失；
- 文件筛选和预览滚动位置；从业务页携带的 Lesson/FileAsset 选择可由 URL 恢复（文件业务数据与字节不会丢失）；
- 通用 `/agent` 对话和上下文；
- 设置页尚未保存的通知/偏好表单状态；正式身份、组织、会话和治理请求不丢失。

## 身份和模型说明

- Web 不发送 tenant/actor/role；API 从 HttpOnly Session 解析 User、active Membership、角色和 CourseRun access，缺失或失效 Session 返回 `401`。
- local/demo 使用无密码的合成 Identity Adapter；仅显式 bypass 可以注入身份并写 Audit。production 禁止 local Adapter、测试 Header 和 bypass，并要求 OIDC + Secure Cookie。
- 默认 Copilot 使用 Mock；服务端显式配置后使用唯一 `VolcengineArkProvider`。普通教师端没有模型选择器。
- 所有真实 Ark 调用只允许演示 tenant 和合成数据；图片、streaming、Function Calling 仅 Probe。
- 本矩阵不代表学校生产可用性；最终云 OIDC 配置、MFA/SCIM、真实学校数据、云文件存储/协作、文件内容进入模型、学生提交端、完整题库/考试、学生长期模型、云部署和多供应商仍未实现。
