# 普通教师端功能矩阵

> 当前基线：Gate 2.5。
> `REAL` = 真实类型化 API + PostgreSQL；`MOCK` = 前端数组、组件状态或确定性模板；`READ_ONLY` = 只读演示；`DISABLED` = 明确不可操作；`DEAD` = 有入口但无响应或伪成功。

| 页面 / 功能 | REAL | MOCK | READ_ONLY | DISABLED | DEAD |
|---|---|---|---|---|---|
| 概览 | 未完成备课 Task、待审核计划、已准备未完成 Task、最近课时均来自 PostgreSQL；点击进入真实 Task | 学生概况、备课组动态、学校动态、最近文件和非备课快捷信息仍来自前端数组 | — | — | — |
| 日程 | — | 日/周/月切换、待办勾选、转日程草稿，仅 React state | — | 通用 Calendar/Todo 写入未实现 | — |
| 教学 / 课程 | CourseRun → CurriculumUnit → Lesson、教学目标、备课状态、current approved、active in-review、关联 Task、创建/继续/reopen 和计划历史均为真实数据 | 当前选中的 Unit/Lesson 是页面视图状态，刷新后回到默认选中项 | 演示文件入口和“本 Gate 不处理二进制文件”说明 | 文件编辑、下载和课程 CRUD 未实现 | — |
| 教学 / 作业 | “调整下一课”仍可进入既有 Copilot | 作业列表、提交率、筛选、错题与学生表 | 合成分析结果 | 作业 CRUD/发布未实现 | — |
| 教学 / 测试 | — | 测试列表、指标、知识点与题目分析 | 合成分析结果 | 测试 CRUD/发布未实现 | — |
| 学生 | — | 班级概览、学生详情、优先列表、筛选 | 合成证据解释 | 学生写入和长期模型未实现 | — |
| 文件 | — | 筛选、排序、预览、列表/网格 | 文件元数据和内容摘要 | 上传、下载、编辑、版本、删除和 ObjectStore 未实现 | — |
| Agent 一级页 `/agent` | 进入“创建教学任务”可转到真实 Copilot | 开放对话、关键词回复、上下文、收藏、重命名和删除 | 固定 Mock 回复 | 外部模型和长期会话未实现 | — |
| Agent / 备课 Task `/agent/tasks/:taskRef` | 读取真实 Task、CourseRun、Unit、Lesson、教学目标、baseline plan、Evidence 和 TaskWorkingSet；可删除可选 Evidence 并提交真实请求 | `MockModelProvider` 的两套策略是确定性合成模板 | 核心上下文锁定和本地演示边界说明 | 已关闭 Task 修改上下文；已完成 Task 接受新建议前必须显式 reopen | — |
| Copilot / Proposal | Lesson/Task-scoped TaskRun、Proposal、策略、diff、Evidence、Disposition、直接 URL 和刷新恢复 | 模型输出内容仍为确定性 Mock | 已处置 Proposal 和历史 Evidence 只读 | 同一 Proposal 冲突处置被拒绝 | — |
| Teaching Plan | current approved、active in-review、draft、superseded、history、继续审阅、独立批准、返回 Task 和显式完成 | — | 历史 immutable Revision 只读 | approved Revision 原地编辑和无 approved plan 的完成命令被拒绝 | — |
| Runs | request、Lesson、Task、TaskWorkingSet、AuthorizedContextPlan、ContextManifest、Proposal、Disposition、Plan/Work 状态、权限、Audit 与 Outbox | — | 运行解释只读 | 不显示隐藏思维链、Secret 或原始内部推理 | — |
| 设置 | — | 记忆、通知、偏好等界面状态 | 当前能力说明 | 正式账号、安全和组织配置未实现 | — |
| Style Guide | — | — | 字体、组件和 Design Token 展示 | — | — |

Gate 2.5 闭环内的创建备课任务、打开课时、进入 Agent、生成/恢复 Proposal、形成 active in-review、批准 current approved、显式完成、概览联动和 Runs 追溯均为 `REAL`，且 `DEAD = 0`。非真实交互被标为 Mock、只读或禁用，不显示假成功。

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

### 刷新后丢失或恢复为演示初始状态

- 日程草稿和日历交互；
- 课程页当前选中项（课程、课时和业务数据本身来自 PostgreSQL）；
- 作业/测试筛选和演示操作；
- 学生页交互；
- 文件筛选、预览选择和演示修改；
- 通用 `/agent` 对话和上下文；
- 设置页组件状态。

## 身份和模型说明

- Web 显式发送合成 tenant/teacher Header。
- API 默认缺失身份返回 `401`；仅 local/demo 显式 bypass 可以注入身份并写 Audit，production 禁止 bypass。
- Copilot 使用 `MockModelProvider`。真实 `request_text` 和授权上下文进入模型 Port，但两套策略内容仍是固定、确定性的合成输出。
- 本矩阵不代表学校生产可用性；正式登录、真实模型、文件、作业/考试、学生长期模型和云部署仍未实现。
