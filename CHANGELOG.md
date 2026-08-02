# Changelog

本文件面向开发者和产品负责人，按仓库的 verified stages 摘要主要变化。完整 Commit、PR、Migration、状态所有者和时间顺序见 [版本历史](docs/version-history.md)。

## Current

当前最新 Verified Gate：**Gate 2.10A**（`gate-2-10a-verified`）。

> 普通教师端本地功能型 MVP，已具备正式身份和学校组织基线，尚未达到云端学校试点生产条件。

Gate 2.10A 之后的仓库治理提交不改变产品状态语义。下一产品阶段候选是 Gate 2.10B 云部署与试点运维，仍需先完成并审查 [部署就绪差距](docs/operations/deployment-readiness-gaps.md)。

## Unreleased — repository cleanup and reorganization

- **Login**：修复 React StrictMode 下身份启动 Promise 被首轮 effect 清理后永久复用、导致页面停在“正在检查身份供应商”的问题；本地教师登录改为手机号密码或一次性验证码，固定演示账号进入林老师工作空间。
- **Security**：演示手机号与密码仅以 SHA-256 / `scrypt` 摘要进入服务端配置；登录失败返回统一安全提示，验证码限时、限次且一次性使用；production 仍禁止 local identity。
- **UI**：登录页改为双栏教师产品入口，移除面向教师无意义的 HttpOnly Cookie、Token、tenant 和角色技术说明。
- **Docs**：根 README 成为唯一入口；当前能力、架构、版本、Roadmap、开发、验证和运维各有单一职责；Gate/UI/研究资料归档但未删除。
- **Agent DX**：增加 `AGENTS.md`、局部 README、稳定测试/验证命令和 Claude Code 仓库经验记录。
- **Cleanup**：删除已证明零引用的八个旧 Page、两个旧组件、旧 demo read model 和失效脚本，共 1,743 行；现行路由和业务语义不变。
- **Fixtures**：运行时 synthetic Demo 移入 `@edu-agent/demo-fixtures`；产品不再依赖 test-only package。
- **Repository safety**：增加 Markdown link 和 Git sync verifier；Playwright 不再覆写已跟踪历史 UI 图片。
- **Database**：未新增、修改、合并或重排 Migration；最新产品基线仍为 43 个 Migration。

## Gate 2.10A — Identity & organization foundation

- **Added**：User、ExternalIdentity、Organization、Membership、Role、CourseRun access、Session、OIDC state、安全事件和数据治理请求；Local/OIDC Identity Provider。
- **Changed**：所有产品 ActingContext 从服务端 Session 解析；固定 demo tenant/teacher 前向映射到正式学校与成员关系。
- **Fixed**：浏览器不能再用 tenant/actor/role Header 伪造产品身份；Membership 停用立即阻断既有 Session。
- **Security**：opaque HttpOnly Session（库内只存 hash）、SameSite/production Secure、Origin+CSRF、OIDC PKCE/state、跨学校不泄漏资源、Demo bypass 默认关闭。
- **Database**：Governance `0005`、`0006`；当前总计 43 个 Migration。
- **UI**：登录、工作空间选择、真实侧边栏身份、Session/组织设置、最小 school-admin 成员管理。
- **Known limitations**：尚未配置真实云 IdP、邮件、MFA/SCIM、托管数据库/ObjectStore、监控备份或生产部署。

## Gate 2.9 — Classroom implementation & reflection

- **Added**：LessonDelivery/Revision、ClassroomObservation/Revision、ObservedPedagogicalMove、InstructionalDecision、LessonReflection/Revision 和显式 follow-up。
- **Changed**：approved TeachingPlan、真实实施、课堂观察和 Reflection 成为四类独立事实；Reflection Agent 只使用所选上下文。
- **Fixed**：接受建议或日历结束不再可能被解释为“已实施”；confirmed 事实修订保留 supersedes 历史。
- **Security**：learner-scope observation 和 Evidence 每次重授权；Agent 不能确认事实或自动创建行动。
- **Database**：Education `0006`、Artifact `0009`、Work `0009`、Capability `0006`、Governance `0004`。
- **UI**：Lesson、概览、日程、学生、Agent 和工作台接入实施—观察—反思—后续行动。
- **Known limitations**：无实时课堂、音视频、自动观察、考勤、多模态或长期 learner 画像。

## Gate 2.8 — Teacher workbench

- **Added**：TeacherTodo、CalendarEvent、TodoCalendarLink、TeacherWorkProjection 和 source-version reminder preference。
- **Changed**：概览和日/周/月日程读取同一 PostgreSQL 真值；业务提醒作为可重建投影而非第二套 Todo。
- **Fixed**：来源事项不能在工作台伪造完成；snooze/pin/hide 不修改 Assignment、Task、Plan 或 Grade。
- **Security**：个人待办/日程按 teacher/tenant 隔离；投影保留 source ref/version 并幂等重建。
- **Database**：Work `0008_gate2_8_teacher_workbench`。
- **UI**：真实概览、日历、右侧 Todo 面板、deep link 和 Todo → Agent handoff。
- **Known limitations**：无共享/外部日历、复杂重复规则、自动排程或定时 Agent。

## Gate 2.7 — Assignment, learning evidence & adjustment

- **Added**：CourseRunEnrollment、Assignment/version/items/objective links、Submission/immutable attempt/responses、TeacherGradeDecision 和 Evidence source chain。
- **Changed**：学生/作业/教学/概览从同一 PostgreSQL 事实读取；统计改为可重算 read model。
- **Fixed**：“未交”与 0 分分离；批改修订不覆盖历史；发布后的作业不可原地修改。
- **Security**：教师只可选择并授权少量 Evidence 进入下一课 Agent context；跨 CourseRun/tenant 拒绝。
- **Database**：Education `0005`、Artifact `0008`、Work `0007`。
- **UI**：作业生命周期、提交/批改、匿名 learner 近期 Evidence、共性错误和“调整下一课”。
- **Known limitations**：无学生端、真实名单、完整题库/考试、自动成绩发布或长期 learner estimate。

## Gate 2.5C — Teacher product stabilization

- **Added**：产品稳定性问题矩阵和跨页回归证据。
- **Changed**：按钮、文案、deep link 和状态显示严格跟随后端 Task/Plan/Model/File 真值。
- **Fixed**：1 个 P0、8 个 P1 和 8 个高价值 P2；消除假成功、重复提交、错误上下文和文件/计划状态不一致。
- **Security**：正式导出和绑定写入进一步收紧；冲突后重读服务器状态。
- **Database**：无新 Migration。
- **UI**：ready/completed、active/history、加载/冲突/错误反馈和跨页恢复一致化。
- **Known limitations**：3 个纯视觉 P3 只记录；考试和通用 Agent 仍明确为 Mock/READ_ONLY。

## Gate 2.5B — Files & teaching artifacts

- **Added**：FileAsset、immutable FileVersion、bindings、ObjectStore Port/LocalObjectStore、approved TeachingPlan DOCX 导出。
- **Changed**：文件页、Lesson、TeachingPlan 与概览使用同一文件/绑定真值；新 approved Revision 形成新导出版本。
- **Fixed**：路径穿越、MIME/扩展/OOXML、大小、重复内容、写入补偿、orphan 和 referenced deletion 语义。
- **Security**：服务端 object key、下载授权、内容/元数据同权；正式成果禁止通用替换或物理删除。
- **Database**：Artifact `0006`、`0007`。
- **UI**：上传、下载、搜索、分类、版本、软删/恢复、关联和 DOCX 导出。
- **Known limitations**：LocalObjectStore only；无云存储、分享协作、完整 Office 预览或文件内容入模。

## Gate 2.6A — Volcengine Ark provider

- **Added**：`VolcengineArkProvider`、PromptBundle、ModelExecution lifecycle、Budget/DataManifest、capability probe、Fake Ark、32 项合成评测和 live acceptance。
- **Changed**：模型调用从同步 Mock 扩展为事务外租约 Worker，可配置选择 Mock/Ark；Gate 2.5 状态语义不变。
- **Fixed**：超时、取消、有限重试、输出校验/一次修复、幂等复用和 Worker 重启恢复。
- **Security**：Key 仅服务端；禁止完整 Prompt/response/error logging；只允许授权的合成数据 live；严格 live 禁止 fallback。
- **Database**：Runtime `0006`、Capability `0004/0005`、Governance `0003`、Work `0006`。
- **UI**：生成/验证/重试/取消/失败状态和 Runs 中安全 Provider/Usage/latency 摘要。
- **Known limitations**：单一 Chat Completions Provider；图片/function/streaming 仅 probe；无多模型路由或文件多模态。

## Gate 2.5 — Recoverable lesson preparation

- **Added**：CurriculumUnit、Lesson、typed lesson-preparation Task details、TaskWorkingSet revisions、plan/lesson/task bindings。
- **Changed**：教师从真实 Lesson 建 Task，显式选择 context；approve plan 和 complete preparation 分离。
- **Fixed**：刷新/重启恢复 Proposal、active in-review/current approved 唯一性、superseded 历史和 Task 状态同步。
- **Security**：每个 AgentRun 重新授权 ContextManifest；重复/并发命令 expected version + idempotency。
- **Database**：Education/Work/Runtime/Artifact Gate2.5 migrations。
- **UI**：课程—课时—Agent—审阅—批准—显式完成—概览闭环。
- **Known limitations**：单一合成课程切片；当时仍使用 Mock Model；无文件、作业或日历。

## Gate 2.4 — Copilot correctness & recovery

- **Added**：真实 Teacher request 保存、Proposal list/detail/recovery、Plan current/in-review/history API、本地 Outbox worker。
- **Changed**：教师产品路由统一 Product Composition Root；Gate1A 内存路径仅用于隔离测试。
- **Fixed**：E2E 数据库与开发 Volume 隔离；Demo identity 默认 401；Disposition concurrency/idempotency；TeachingPlan draft/in-review/approved 语义。
- **Security**：长期数据库 reset 必须显式 destructive flag；demo bypass 仅 local/demo 并 Audit。
- **Database**：Runtime/Artifact/Work `0004`。
- **UI**：真实 request、可恢复 Proposal、四种处置、单独批准和 Runs 解释。
- **Known limitations**：课程/课时与 preparation Task 尚未形成完整闭环；正式登录未实现。

## Gate 1B — PostgreSQL & Education skeleton

- **Added**：真实 PostgreSQL repositories、transaction factory、Migration bootstrap/checksum/owner、Education CourseRun/Objectives/Evidence/Profile/Attempt 基础。
- **Changed**：walking skeleton 可在受限数据库角色下运行并持久化。
- **Fixed**：跨连接事务可见性、幂等/租约恢复与 migration drift 检测。
- **Security**：app/worker/migration role 分离和 Schema ownership 验证。
- **Database**：六个模块 `0002_gate1b` migrations；Gate1A 七个 `0001` 保留。
- **UI**：仍是最小工程验证界面。
- **Known limitations**：没有教师产品闭环、真实模型、文件或身份。

## Gate 1A — No-LLM walking skeleton

- **Added**：七模块 monorepo、统一 ingress、Task/Run、Authorization/Audit/Outbox、AgentRun、ToolExecution、ArtifactRevision 和内存 repositories。
- **Changed**：把 v0.3.x 架构决策变成第一条可执行纵向路径。
- **Fixed**：用静态/架构/Node/PGlite 测试冻结模块边界和幂等语义。
- **Security**：建立 ActingContext、ActionIntent、AuthorizationDecision 的最小验证链。
- **Database**：七个 Schema 的 `0001` migrations。
- **UI**：最小 React 骨架，不是教师门户。
- **Known limitations**：内存 Composition、Fake Tool、无真实业务数据；后续由 Gate1B/2.4 替代产品运行路径。
