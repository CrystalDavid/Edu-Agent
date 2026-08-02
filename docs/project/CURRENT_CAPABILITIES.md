# Edu-Agent 当前能力地图

> 状态：CURRENT
> 基线：`main` @ `bbba3428602bb148a3d73a201ad97fcb29181c1b`，`gate-2-10a-verified`
> 口径：`REAL` = 正式类型化 API + PostgreSQL 真值；`PARTIAL` = 核心链路真实但仍有明确演示/未实现区域；`MOCK` = 前端或测试夹具生成；`READ_ONLY` = 可查看但不可写；`DISABLED` = 明确禁用；`NOT_STARTED` = 尚未进入产品实现。

本文描述当前代码能做什么，不以页面是否存在、旧设计文档或未来计划替代可执行证据。合成演示数据可以经过真实 Repository/API 持久化，因此“数据是合成的”和“实现是 REAL”并不矛盾。

## 1. 按普通教师端页面

| 页面 | 状态 | 当前可以完成 | 真值来源与主要 API | 所属模块 / 首次完成 Gate | 当前限制 |
|---|---|---|---|---|---|
| 概览 | PARTIAL | 查看 Todo、日历、备课、待审计划、作业/批改、模型失败、课堂实施/反思和最近文件；创建个人 Todo；进入源业务 | PostgreSQL；`/teacher/workbench/overview`、`action-items` | Work 聚合读取；2.8，2.9 补充课堂事项 | 学校动态、备课组动态仍是明确标记的 READ_ONLY 演示；不在概览直接伪造源业务完成 |
| 日程 | REAL | 日/周/月统一查看；创建、移动、完成或取消手工事件；将 Todo 安排为独立时间块；对源事项稍后提醒 | Work Schema；`calendar-events`、`todos/:ref/schedule`、workbench projection preference | Work；2.8 | 无共享/外部日历、复杂重复规则或自动排程；源业务日历项只读 |
| 教学 | PARTIAL | 在统一 Workspace 中进入真实课程、作业和考试演示区域 | 各子页面正式 API；页面路由由 Web 自定义 history router 解析 | Education / Work / Artifact；2.5、2.7 | 课程与作业为真实链路；考试区仍为 MOCK/READ_ONLY |
| 课程 | REAL | 读取 CourseRun → Unit → Lesson；查看目标、备课、计划、文件、课堂实施、观察、反思与后续行动 | Education/Work/Artifact PostgreSQL；`course-runs`、`units`、`lessons`、`implementation-summary` | Education 等；2.5，2.9 扩展 | 仅合成的一次函数课程切片；无课程 CRUD、完整资源树或排课系统 |
| 作业 | REAL | 创建/修订草稿、显式发布/关闭/归档；载入合成提交；逐题批改、确认/重开；查看可重算统计与 Evidence；调整下一课 | Education Schema；`assignments`、`submissions`、`grading-queue`、`analytics`、`evidence`、`adjust-next-lesson` | Education / Work；2.7 | 无学生端自行提交、完整题库/考试或自动成绩发布；演示 learner 与作答为合成数据 |
| 考试 | MOCK / READ_ONLY | 查看合成测试列表和分析界面 | `teacher-portal-data.ts` / Web 组件状态 | 无正式状态所有者 | 无考试创建、发布、提交、批改或持久化闭环 |
| 学生 | PARTIAL | 查看当前 CourseRun 的匿名 enrollment、近期提交/确认 Evidence 和教师确认的 learner-scope classroom observation | Education PostgreSQL；`course-runs/:ref/enrollments`、`learners/:ref/evidence`、observations | Education；2.7、2.9 | 无正式学生身份、真实名单、长期画像或固定能力标签 |
| 文件 | REAL | 上传、下载、搜索、分类、排序、详情、新版本、软删除/恢复、绑定 Lesson/Task/TeachingPlan；导出 approved TeachingPlan DOCX | Artifact PostgreSQL + Capability LocalObjectStore；`files`、`versions`、`content`、`bindings`、`teaching-plans/:revision/export-docx` | Artifact / Capability；2.5B | 本地对象存储；Office 只提取摘要/下载；无分享、协作、云同步或文件内容入模 |
| Agent 一级页 | PARTIAL | 从 Task、Todo、Reflection 等正式入口进入受限 Agent 流程 | 正式 deep link + Task API；一级页的开放对话仍来自前端演示状态 | Work / Runtime / Capability；2、2.5、2.8、2.9 | 通用开放对话、收藏和会话管理仍是 MOCK；无多 Agent 或自动化平台 |
| Agent / Copilot | REAL | 封存 TaskWorkingSet/授权上下文；创建可恢复 ModelExecution；Mock 或 Ark 生成 Proposal；取消、重试、恢复；教师处置 | Work/Runtime/Capability/Artifact PostgreSQL；task context、model invocation、proposal API | 2.4、2.5、2.6A | Ark 需服务端配置；默认本地/测试为 Mock；不能自动批准、完成任务或扩大上下文 |
| Teaching Plan | REAL | 查看 current approved、active in-review、draft、superseded/history；处置 Proposal；单独批准；显式完成备课；导出 DOCX | Artifact/Work PostgreSQL；lesson teaching-plan reads、proposal disposition、approve、export | Artifact / Work；2.4、2.5、2.5B | `published` 未实现；approved Revision immutable；正式导出只允许 current approved |
| Runs | REAL / READ_ONLY | 查看请求、安全上下文、ModelExecution、Usage、延迟、脱敏 provider request ID、Proposal、Audit 与 Outbox 状态 | Runtime/Capability/Governance/Work PostgreSQL；run/model detail API | 2.4、2.6A | 调试信息只读且不显示 Key、完整 Prompt/响应或隐藏推理 |
| 设置 | PARTIAL | 查看真实用户、学校、角色、CourseRun scope、活跃 Session；撤销 Session；提交数据治理请求；管理员管理最小成员权限 | Governance PostgreSQL；auth/session/workspace、organization/admin、governance request API | Governance；2.10A | 偏好/通知部分仍是演示；无邮件邀请、MFA、SCIM 或完整学校后台 |
| 管理员入口 | REAL（最小） | school admin 查看成员、安全事件，创建/激活/停用成员，分配 ordinary_teacher 和 CourseRun access | Governance PostgreSQL；`/api/v1/admin/*` | Governance；2.10A | 只在当前学校生效；不授予修改教学事实的超级权限；subject lead/homeroom 仅保留边界 |

`DEAD = 0` 的依据见 [教师门户功能矩阵](../product/TEACHER_PORTAL_FUNCTION_MATRIX.md)。当前仍为 Mock 的入口必须显式标注，不能显示成功写入提示。

## 2. 按业务闭环

| 业务闭环 | 状态 | 当前真实能力 | 主要边界 / 限制 |
|---|---|---|---|
| 登录和工作空间 | REAL（本地） / PARTIAL（生产） | Local/OIDC Provider Port、HttpOnly Session、CSRF、登录/刷新/登出、多学校选择、Membership/Role/CourseRun access | provider-neutral OIDC 代码已存在；真实云 IdP、域名与生产 Secret 尚未配置 |
| 课程与课时 | REAL（最小切片） | CourseRun → CurriculumUnit → Lesson、目标、计划/任务/文件/实施汇总 | 只有合成的一次函数数据；无完整课程维护 |
| 备课 | REAL | Lesson → lesson_preparation Task → request/context → Proposal → in-review → approved → ready → explicit complete | 不包含完整课程资源树或自动完成 |
| 豆包模型生成 | REAL（可选） | 单一 `VolcengineArkProvider`、事务外 Worker、结构化校验/一次修复、预算、取消、重试、恢复、Usage | 默认 Mock 不联网；仅合成数据获准 live；无多供应商/模型选择器 |
| TeachingPlan 审批 | REAL | draft → active in-review/superseded → current approved；教师处置和批准分离 | 未实现 published；approved 不可原地修改 |
| 文件和 DOCX | REAL（本地） | FileAsset/FileVersion、LocalObjectStore、绑定、版本、删除保护、approved plan DOCX | 无云 ObjectStore、分享协作或 Office 完整预览 |
| 作业和提交 | REAL（教师端 + 合成提交） | Assignment 生命周期/版本、immutable Attempt/Response、未交语义 | 无学生端、真实提交入口或完整题库 |
| 批改和 Evidence | REAL | grade draft/confirm/reopen，Evidence 来源链和可重算统计 | 自动评分只可作建议；不形成长期 learner estimate |
| 调整下一课 | REAL | 教师选择 Evidence → 新 lesson prep Task → 每次重新授权 → Copilot/plan 审批 | Agent 不能读取未选择的全班提交 |
| Todo 和 Calendar | REAL | 手工 Todo/Event、关联、安排、状态和 source-version reminder preference | 无共享/外部日历或自动工作流 |
| 课堂实施 | REAL | Delivery draft/confirmed/amended revision；planned vs implemented | 日历结束不会自动产生实施事实 |
| 课堂观察 | REAL | 教师确认的班级/Objective/活动/匿名 learner observation 与 supersedes 历史 | Agent 推断不是正式事实；不做长期能力标签 |
| 课后反思 | REAL | selected context → Agent draft → teacher confirm → explicit follow-up | Reflection 不覆盖 TeachingPlan，也不自动创建行动 |
| 学校成员管理 | REAL（最小） | Organization、Membership、Role、CourseRun access、suspend/reactivate、安全 Audit | 无完整组织树、人事系统或跨学校管理员 |
| 数据治理请求 | PARTIAL | 记录 export、de-identification/deletion 请求与状态基础 | 未实现导出/去标识执行 Worker、审批门户或 SLA |
| 考试 | MOCK / READ_ONLY | 仅合成展示 | 正式领域、API、Persistence 均未开始 |
| 多模态 | NOT_STARTED（产品） | Ark capability probe 可探测 image URL | 文件/图片未进入正式模型上下文；无 OCR |
| 学生端 | NOT_STARTED | 无 | 当前只有教师查看匿名合成 learner |
| 家长端 | NOT_STARTED | 无 | 无身份、页面或业务闭环 |
| 云部署 | NOT_STARTED（产品部署） | 本地 Docker PostgreSQL、LocalObjectStore、provider-neutral adapters | 未配置域名、HTTPS、托管 DB/ObjectStore、备份、监控或远程 E2E |

## 3. 当前产品定位

> 普通教师端本地功能型 MVP，已具备正式身份和学校组织基线，尚未达到云端学校试点生产条件。

当前最强证据是：核心状态均来自七个 PostgreSQL Schema，写入经过服务端 Session → ActingContext → Authorization → owning Application Service，刷新与服务重启可恢复；当前最大缺口不是再增加教师页面，而是完成云基础设施、安全加固、运维、数据治理执行和小规模试点验证。

相关文档：[完整版本历史](VERSION_HISTORY.md) · [当前架构](CURRENT_ARCHITECTURE.md) · [部署就绪差距](DEPLOYMENT_READINESS_GAPS.md)
