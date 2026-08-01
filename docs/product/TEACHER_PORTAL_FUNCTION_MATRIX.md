# 普通教师端功能矩阵

> 当前基线：Gate 2.5C 已 verified；当前分支进行 Gate 2.7 作业、学习 Evidence 与教学调整闭环。
> `REAL` = 真实类型化 API + PostgreSQL；`MOCK` = 前端数组、组件状态或确定性模板；`READ_ONLY` = 只读演示；`DISABLED` = 明确不可操作；`DEAD` = 有入口但无响应或伪成功。

| 页面 / 功能 | REAL | MOCK | READ_ONLY | DISABLED | DEAD |
|---|---|---|---|---|---|
| 概览 | 未完成备课 Task、待审核计划、已准备未完成 Task、最近课时/文件、作业草稿/发布数、待确认批改、未交人次和调整候选来自 PostgreSQL | 备课组动态、学校动态仍来自前端数组 | 所有 Mock 区均明确标注只读演示 | 制作课件、协作/待办写操作明确禁用 | — |
| 日程 | — | 日/周/月切换、待办勾选、转日程草稿，仅 React state | — | 通用 Calendar/Todo 写入未实现 | — |
| 教学 / 课程 | CourseRun → CurriculumUnit → Lesson、教学目标、备课状态、计划、关联 Task，以及关联参考文件/正式 DOCX 均为真实数据；Task 主操作严格按状态进入 Agent/审核/完成/reopen/cancel；Lesson/File 深链可刷新恢复 | 页面内未写入 URL 的临时 Unit 选择是视图状态 | — | 课程 CRUD 未实现 | — |
| 教学 / 作业 | Assignment 草稿/版本、显式发布/关闭/归档、12 名匿名提交、未交、逐题批改草稿/确认/重开、题目与 Objective 表现、共性错误、selected Evidence 创建下一课 Task 全部经类型化 API + PostgreSQL | 页面当前选择、筛选和未保存表单仅为视图状态 | Submission 内容是明确标记的合成演示数据 | 已发布内容原地修改、自动发布/自动评分发布被拒绝 | — |
| 教学 / 测试 | — | 测试列表、指标、知识点与题目分析 | 合成分析结果 | 测试 CRUD/发布未实现 | — |
| 学生 | CourseRunEnrollment、近期 Assignment/Submission 状态、current teacher-confirmed Evidence 与动态复核事项来自 PostgreSQL | 当前 learner 选择是视图状态 | 12 名匿名 learner 与提交内容为合成演示数据 | 长期能力标签、正式学生写入、自动结论未实现 | — |
| 文件 | 原有 FileAsset/FileVersion/Binding/LocalObjectStore 能力不变；新增 Assignment 与明确 AssignmentVersion 参考/附件绑定并校验 tenant | 筛选、排序与预览滚动位置是临时视图状态 | Office 文件显示文件信息、本地提取摘要与下载，不做完整浏览器渲染 | 在线新建、分享、协作、云同步明确禁用；正式成果删除、手工替换版本和手工改绑均被拒绝 | — |
| Agent 一级页 `/agent` | 进入“创建教学任务”可转到真实 Copilot | 开放对话、关键词回复、上下文、收藏、重命名和删除 | 固定 Mock 回复 | 外部模型和长期会话未实现 | — |
| Agent / 备课 Task `/agent/tasks/:taskRef` | 读取真实 Task/context；创建 durable ModelExecution；显示 queued/running/validating/retry/terminal 状态；可取消、人工 retry、刷新恢复；active 执行期间禁止重复提交；配置 Ark 时经服务端真实调用 | 默认 local/test 使用确定性 Mock；Ark 配置不完整时明确回退 | completed Task 可补充生成仅供拒绝/延后审阅 | ready/cancelled 必须先 reopen；completed Proposal 的接受/修改入口禁用；真实学生/Secret/连接信息被策略拒绝 | — |
| Copilot / Proposal | Lesson/Task-scoped TaskRun、ModelExecution、1–3 条经校验策略、Proposal、diff、Evidence、Disposition、直接 URL 和刷新恢复 | Mock 模式下建议内容是确定性合成模板 | 已处置 Proposal 和历史 Evidence 只读 | 同一 Proposal 冲突处置、无效 Provider 输出和越权 Evidence 被拒绝 | — |
| Teaching Plan | current approved、active in-review、draft、superseded、history、继续审阅、独立批准、返回 Task/Lesson、显式完成；active in-review 不再误标历史；明确 approved Revision 导出 DOCX、查看/下载版本 | — | 历史 immutable Revision 只读 | draft/in-review 正式导出、approved 原地编辑和无 approved plan 的完成命令被拒绝 | — |
| Runs | request、Lesson、Task、TaskWorkingSet、AuthorizedContextPlan、ContextManifest、ModelExecution、Provider/展示名、PromptBundle 版本、Token、延迟、估算费用、脱敏 request ID、Proposal、Plan/Work、权限、Audit 与 Outbox；active execution 自动刷新至 terminal | — | 运行解释和安全模型摘要只读 | 不显示 Key、Base URL、完整 Prompt/响应、错误体或隐藏思维链 | — |
| 设置 | — | 记忆、通知、偏好等界面状态 | 当前能力说明 | 正式账号、安全和组织配置未实现 | — |
| Style Guide | — | — | 字体、组件和 Design Token 展示 | — | — |

Gate 2.5–2.5C 备课/文件链和 Gate 2.6A 模型执行继续为 `REAL`。Gate 2.7 的作业发布、合成提交、教师批改、Evidence 来源链、学生近期证据和调整下一课均接入 Product Composition Root；默认测试仍用 Mock/Fake，不发起公网请求。考试、日程和开放 Agent 对话仍明确为 Mock/READ_ONLY。`DEAD = 0`。

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

### 刷新后丢失或恢复为演示初始状态

- 日程草稿和日历交互；
- 未写入 URL 的课程页临时 Unit/Lesson 选择（从 Lesson 深链进入时可恢复）；
- 作业页未保存表单、筛选和当前选择；正式 Assignment/Submission/Grade/Evidence 不丢失；
- 学生页当前 learner 选择；Enrollment、Submission 和 Evidence 不丢失；
- 文件筛选和预览滚动位置；从业务页携带的 Lesson/FileAsset 选择可由 URL 恢复（文件业务数据与字节不会丢失）；
- 通用 `/agent` 对话和上下文；
- 设置页组件状态。

## 身份和模型说明

- Web 显式发送合成 tenant/teacher Header。
- API 默认缺失身份返回 `401`；仅 local/demo 显式 bypass 可以注入身份并写 Audit，production 禁止 bypass。
- 默认 Copilot 使用 Mock；服务端显式配置后使用唯一 `VolcengineArkProvider`。普通教师端没有模型选择器。
- 所有真实 Ark 调用只允许演示 tenant 和合成数据；图片、streaming、Function Calling 仅 Probe。
- 本矩阵不代表学校生产可用性；正式登录、真实学校数据、云文件存储/协作、文件内容进入模型、学生提交端、完整题库/考试、学生长期模型、云部署和多供应商仍未实现。
