# 普通教师端功能矩阵

> 当前基线：Gate 2.4；Gate 2.5 目标已冻结，但只有实际接通并通过 PostgreSQL、HTTP 与 Playwright 验证后才会改为 `REAL`。
> `REAL` = 真实 API + PostgreSQL；`MOCK` = 前端数组或组件状态；`READ_ONLY` = 只读演示；`DISABLED` = 明确不可操作；`DEAD` = 有入口但无响应或伪成功。

| 页面 / 功能 | REAL | MOCK | READ_ONLY | DISABLED | DEAD |
|---|---|---|---|---|---|
| 概览 | 教师身份和启动 workspace 来自产品 API | 待办、课程、学生概况、动态、最近文件；Gate 2.5 将只把备课 Task 与最近课时替换为真实数据 | — | — | — |
| 日程 | — | 日/周/月切换、待办勾选、转日程草稿，仅 React state | — | — | 刷新后全部恢复初始数组 |
| 教学 / 课程 | “生成新版本”进入真实 Copilot；TeachingPlan 历史入口真实 | CourseRun/单元/课时仍是前端数组；Gate 2.5 将替换为 PostgreSQL | 演示文件和材料摘要 | 编辑、下载等未接后端 | 非真实按钮明确提示“高保真界面预览”，不伪装持久化 |
| 教学 / 作业 | “调整下一课”进入真实 Copilot | 作业列表、提交率、筛选、错题与学生表 | 合成分析结果 | 作业 CRUD/发布未实现 | 其他分析动作进入 Mock Agent 或明确提示 |
| 教学 / 测试 | — | 测试列表、指标、知识点与题目分析 | 合成分析结果 | 测试 CRUD/发布未实现 | “生成讲评课”等仍是 Mock Agent |
| 学生 | — | 班级概览、学生详情、优先列表、筛选 | 合成证据解释 | 学生写入、长期模型未实现 | 个别指导建议不是后端业务结果 |
| 文件 | — | 筛选、排序、预览、列表/网格、恢复初始数据 | 文件元数据与内容摘要 | 上传、下载、编辑、版本、删除未实现 | 不存在真实文件字节或 ObjectStore |
| Agent 一级页 | “创建教学任务”进入真实 Copilot | 对话、关键词回复、上下文、收藏/重命名/删除 | 固定 Mock 回复 | 外部模型、长期会话未实现 | 对话刷新后丢失；回复不是 ModelProvider 运行结果 |
| Copilot 详情 | Task request、Proposal、策略、diff、Evidence、Disposition、直接 URL 恢复 | TaskWorkingSet、Lesson 和备课 Task 尚未接入；MockModelProvider 的两套策略内容是确定性固定模板 | 本地演示身份与模型边界提示 | 已处置 Proposal 禁止再次处置 | 无 API 失败 fallback；失败显示真实错误 |
| Teaching Plan | current approved、current in-review、draft list、history、独立批准 | Lesson/备课 Task 关联和 superseded 语义尚未实现 | 历史 Revision 只读 | approved Revision 原地编辑被数据库拒绝 | — |
| Runs | Task/Run/Contract/ContextManifest/请求/Evidence/Authorization/ModelExecution/Audit/Outbox | TaskWorkingSet、AuthorizedContextPlan、Lesson/Work status 尚未展示 | 审计与运行解释只读 | 不显示隐藏思维链或 secret | — |
| 设置 | — | 记忆、通知、偏好等界面状态 | 当前能力说明 | 正式账号、安全和组织配置未实现 | — |
| Style Guide | — | — | 字体、组件、Design Token 展示 | — | — |

## 关键持久化边界

### 刷新后可恢复

- Teacher Task request；
- Proposal、策略、diff 与 Evidence 引用；
- SuggestionDisposition；
- TeachingPlan draft / in-review / approved / history；
- Run、Contract、ContextManifest、ModelExecution；
- Authorization、Idempotency、Audit 与 Outbox 状态。

### Gate 2.5 验收时必须转为 REAL

- 概览中的未完成备课 Task、待审核计划、已准备未完成 Task；
- 教学页 CourseRun → Unit → Lesson、教学目标、备课状态和开始/继续入口；
- Lesson Preparation Task 的创建、启动、恢复、完成、取消和历史；
- TaskWorkingSet 选择、当次 AuthorizedContextPlan 与 sealed ContextManifest；
- Lesson/Task-scoped Proposal、active in-review、superseded、current approved；
- 批准后 `ready_for_use`、显式完成、概览和教学页联动；
- Runs 中的 Lesson、TaskWorkingSet、授权计划、Plan/Work 状态；
- 上述范围 `DEAD = 0`。

### 刷新后丢失或恢复到固定数组

- 普通概览待办；
- 日程草稿和日历交互；
- 课程树选择状态；
- 作业/测试筛选与演示操作；
- 学生页交互；
- 文件筛选、预览选择与本地演示修改；
- `/agent` 对话和上下文；
- 设置页组件状态。

## 身份和模型说明

- Web 显式发送合成 tenant/teacher Header。
- API 默认缺失身份返回 `401`；仅 local/demo 显式 bypass 可以注入身份，并写 Audit。
- Copilot 使用 `MockModelProvider`。请求原文真实进入模型 Port，但策略内容仍是固定、确定性的合成输出。
- 本矩阵不代表学校生产可用性；正式登录、真实模型、文件、课程/作业/学生业务仍未实现。
