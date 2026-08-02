# Edu Agent

面向学校的教育智能体平台工程仓库。Gate 2.8 日程、待办与教师统一工作台已经 verified；当前分支建设 **Gate 2.9 — 课堂实施、课后反思与教学改进闭环**，把批准的计划、教师确认的实际实施与课堂观察、可恢复 Reflection 草稿及显式后续行动连接起来。

## 当前真实能力

- 七模块模块化单体与七个 PostgreSQL Schema；
- Product Composition Root 全部使用 PostgreSQL，Gate 1A 内存实现只供隔离测试；
- 默认缺失身份返回 `401`；本地演示绕过必须显式开启且会写 Audit；
- 正式 Repository/API 提供八年级 3 班数学的 CourseRun、一次函数 Unit、五个 Lesson、教学目标和当前计划；
- Education-owned CourseRunEnrollment 提供 12 名匿名合成 learner；Assignment 采用 `draft → published → closed → archived`，内容版本、SubmissionAttempt 和 ItemResponse 不可变；
- 教师可以保存批改草稿、单独确认 GradeDecision、显式重新打开；“未交”表示不存在 SubmissionAttempt，不以 0 分代替；
- confirmed GradeDecision 生成可追溯 `Assignment → Attempt → ItemResponse → GradeDecision → EvidenceObservation` 来源链，修订会创建替代版本而非覆盖历史；
- 作业/题目/Objective/learner 统计均从 PostgreSQL 事实实时重算；学生页只显示近期动态 Evidence，不形成长期能力标签；
- 教师可以从共性错误中显式选择 Evidence 创建下一 Lesson 的 `lesson_preparation` Task；TaskWorkingSet、AuthorizedContextPlan 和 ContextManifest 只包含该次选择并在每次 Run 重新授权；
- Work-owned `TeacherTodo` 支持创建、编辑、优先级、截止时间、完成、取消、重开、置顶、稍后提醒和显式资源关联；
- Work-owned `CalendarEvent` 支持日/周/月统一读取、创建、移动、完成和取消；Todo 安排到日历会建立 `TodoCalendarLink`，二者不会互相自动完成；
- 备课、Assignment 截止/未交/待批改、active in-review、待处理 Proposal、模型失败和最近文件通过可重建 `TeacherWorkProjection` 汇入工作台，不复制源业务真值；
- 来源事项只能进入源页面执行真实动作；置顶、稍后和隐藏属于 source-version-bound 的教师个人偏好，不修改源对象；
- Todo 进入 Agent 只把 Todo 与明确关联资源写入 TaskWorkingSet Revision，每次 Run 仍重新授权；模型不会自动完成 Todo；
- Education-owned LessonDelivery/DeliveryRevision 区分 approved TeachingPlan 与真实课堂实施；只有教师确认的 revision 是正式事实，确认后不可原地覆盖；
- ClassroomObservation 支持班级、Objective、活动和明确匿名 learner 范围；只有教师确认的 observation 才进入 Lesson/学生读取模型，修订保留 supersedes 历史且不形成长期能力标签；
- Artifact-owned LessonReflection 独立于 TeachingPlan；Agent 只基于教师选择并重新授权的实施、观察和 Assignment Evidence 生成可恢复 draft，教师编辑并单独确认；
- confirmed Reflection 可由教师显式创建下一课备课 Task、Assignment draft 或 TeacherTodo，并保留来源关系；确认 Reflection 不会自动创建行动；
- 复用 `work.task` 表达 `lesson_preparation`，持久化 `planned → in_progress → awaiting_plan_review → ready_for_use → completed` 状态和历史；
- TaskWorkingSet 保存教师显式选择；每个 AgentRun 重新生成 AuthorizedContextPlan 并封存 ContextManifest；
- 教师请求原文及所选课时、目标、Evidence 和 baseline plan 被保存到 TaskRun、Resolved Contract、ContextManifest 和 MockModelProvider 输入；
- Proposal 列表、详情与直接 URL 可恢复，不依赖浏览器 session state，也不会恢复时重新调用模型；
- `draft → in_review → approved` TeachingPlan 生命周期；同一 Lesson 最多一个 active in-review 和一个 current approved，旧版本保留历史；
- 接受/修改、批准和完成是三个独立命令；拒绝/稍后处理不改变 current approved；
- Task、Disposition、active review、批准和完成具备 expected version、结构化冲突与幂等语义；
- 本地应用级 Outbox Worker，使用租约、重试和幂等 Consumer Effect，不声称 exactly-once；
- `VolcengineArkProvider` 使用 API workspace 内的 OpenAI-compatible Node SDK；模型 ID 只来自服务端配置，Web bundle 无 SDK/Key；
- `ModelExecution` 持久化 queued/running/validating/succeeded、失败、超时、取消、Token、延迟、估算费用和安全 Provider 关联；
- 模型调用在数据库事务外由租约 Worker 执行；预算、ModelDataManifest、幂等、有限重试和一次受控修复均 fail closed；
- 默认 `MockModelProvider` 不联网；Fake Ark、32 项合成评测集和默认关闭的 Live Integration 分离验证；
- Artifact-owned `FileAsset`、不可变 `FileVersion` 和文件关联持久化到 PostgreSQL；Capability-owned `LocalObjectStore` 使用服务端生成 object key、流式 SHA-256、大小/MIME/签名校验和失败补偿；
- 文件页提供真实上传、搜索、分类、排序、下载、版本历史、软删除/恢复，以及所选 Lesson、备课 Task、current approved TeachingPlan Revision 关联；被正式 TeachingPlan Revision 引用的成果禁止删除；
- DOCX/PPTX/XLSX 上传会校验实际 OOXML 容器，并在服务端本地提取有界文本摘要；不会把文件内容发送给模型；
- 同一 tenant 的重复内容按 SHA-256 与大小复用物理对象，但保留各自 FileAsset/FileVersion 与审计语义；
- 明确的 current approved TeachingPlan Revision 可导出 DOCX，并作为正式 FileAsset 绑定 Lesson、备课 Task 与 TeachingPlan；新 approved Revision 导出形成同一文件的新版本；
- `ready_for_use` 与 `completed` 使用不同文案和主操作；awaiting/ready/completed/cancelled 的按钮严格映射 Work 状态机，取消、reopen 和新一轮备课均为显式动作；
- `/files?lesson=…&asset=…` 保存 Lesson/FileAsset 上下文；从课时、概览和 TeachingPlan 进入文件页不会回落到错误课时；
- active ModelExecution 期间禁止重复提交；Proposal 处置统一锁定，409 后重读 PostgreSQL 当前版本；Runs 对 active execution 自动刷新到 terminal；
- 正式 TeachingPlan 导出文件不能通过通用 API 手工替换版本或改绑来源，只能由新的 approved Revision 导出创建版本；
- PostgreSQL、HTTP、Playwright、架构与数据库生命周期测试。

普通教师端的概览工作台、日程/Todo、教学课程/课时/作业、匿名学生近期 Evidence、Task-scoped Agent、Teaching Plan、Runs，以及文件/教学成果链路已接入真实闭环；考试、开放式 Agent 对话和设置仍主要是高保真 Mock 或明确禁用。详见 [教师门户功能矩阵](docs/product/TEACHER_PORTAL_FUNCTION_MATRIX.md)。

## 本地启动

前置条件：Node.js、Corepack 与 Docker Desktop。

```powershell
cd D:\03_Edu-Agent
corepack pnpm install
corepack pnpm demo:doctor
corepack pnpm demo:dev
```

打开 `http://localhost:5173/`。本地演示只使用合成身份和教育数据；默认 Mock，不联网。用户可在被忽略的 `.env.local` 中显式选择 Ark，配置仍只存在于服务端。它不是正式登录或 SSO。完整说明见 [LOCAL_DEMO.md](docs/demo/LOCAL_DEMO.md)。

## 验证命令

```powershell
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:architecture
corepack pnpm test:e2e
corepack pnpm test:migrations
corepack pnpm test:secrets
corepack pnpm test:node-smoke
corepack pnpm test:postgres
corepack pnpm test:playwright
corepack pnpm test:playwright:ark-fake
corepack pnpm build
corepack pnpm demo:doctor
```

- `pnpm test` 不启动 Docker。
- 普通测试和两条 Playwright 链都显式禁用 live model；Fake Ark 只监听本机。
- `pnpm test:model:live` 与 `pnpm model:probe:live` 默认关闭，只有显式 strict live flags 和完整 Ark 配置时才联网；严格模式禁止 Mock/Fake fallback。
- `pnpm test:postgres` 和 `pnpm test:playwright` 每次创建独立的临时 Compose Project/Volume，结束后清理，并核验开发 Volume、`infra/docker/.env.local` 和本地上传目录未变化。
- Playwright 还使用 `.demo/e2e/<run-id>/uploads` 临时 ObjectStore；结束后只删除该已核验目录，不触碰 `.demo/uploads/objects` 开发文件。
- Gate 2.5B Playwright 会在同一隔离数据库与 ObjectStore 上真实重启一次 API/Worker，并验证文件、版本和 bindings 恢复；重启控制器只监听本机且不进入产品路由。
- 长期开发数据库使用 Compose Project `edu-agent-dev` 和 Volume `edu-agent-dev-postgres-data`。
- 删除长期开发 Volume 必须显式设置 `ALLOW_DESTRUCTIVE_DB_RESET=1`；未设置时命令会在调用 Docker 前拒绝执行。

## 明确边界

当前不包含真实学校数据、正式登录/SSO、第二模型或多供应商路由、DeepSeek、CloudBase、Netlify、云 ObjectStore、文件分享/协作、上传内容进入模型、外部/共享日历、复杂重复日程、自动 Agent、完整课程资源树或课程 CRUD、完整题库/考试闭环、学生端、学生长期模型、多 Agent 或 v0.4。图片、streaming 和 Function Calling 只做 capability probe，不进入产品。

Gate 2.6A 的 Provider、事务边界、生命周期、安全与验收见 [GATE_2_6A_VOLCENGINE_ARK_PROVIDER.md](docs/product/GATE_2_6A_VOLCENGINE_ARK_PROVIDER.md)。Gate 2.5 业务语义见 [GATE_2_5_RECOVERABLE_LESSON_PREPARATION.md](docs/product/GATE_2_5_RECOVERABLE_LESSON_PREPARATION.md)。
Gate 2.5B 的文件所有权、补偿、DOCX 与验收见 [GATE_2_5B_FILE_AND_TEACHING_ARTIFACTS.md](docs/product/GATE_2_5B_FILE_AND_TEACHING_ARTIFACTS.md)。Gate 2.5C 的问题分级、单一真值源与修复证据见 [TEACHER_PRODUCT_STABILIZATION_MATRIX.md](docs/product/TEACHER_PRODUCT_STABILIZATION_MATRIX.md)。
Gate 2.7 的 Assignment、Submission、GradeDecision、Evidence 来源链与调整下一课语义见 [GATE_2_7_ASSIGNMENT_LEARNING_EVIDENCE.md](docs/product/GATE_2_7_ASSIGNMENT_LEARNING_EVIDENCE.md)。
Gate 2.8 的 Todo、Calendar、来源投影、提醒偏好与 Agent handoff 语义见 [GATE_2_8_TEACHER_WORKBENCH.md](docs/product/GATE_2_8_TEACHER_WORKBENCH.md)。
Gate 2.9 的课堂实施事实、课堂观察、Reflection 与后续行动语义见 [GATE_2_9_CLASSROOM_REFLECTION_LOOP.md](docs/product/GATE_2_9_CLASSROOM_REFLECTION_LOOP.md)。
