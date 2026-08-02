# Gate 2.5C — 教师端产品正确性与体验收口矩阵

> 审计日期：2026-08-01
>
> 基线：`main@b3787fa117b74729e0e6347b993b2c7f4a5e37f4`，Tag `gate-2-5b-verified`
>
> 功能分支：`feat/gate-2-5c-teacher-product-stabilization`
>
> 状态：HISTORICAL / VERIFIED。PR #6，Merge `afdcfbd9d342822038dee3e6c1a19b64dca535ac`，annotated tag `gate-2-5c-verified`。

## 1. Gate 编号裁决

Git 分支、Tag、PR、提交图和产品文档中都没有 Gate 2.6B 的实现记录。Gate 2.6B 只在后续选项中表示“多模态文件理解”的候选名称。最新被用户验收、但在本阶段开始时尚未固化的成果实际是 Gate 2.5B；它已通过 PR #5 以 merge commit `b3787fa` 合入 `main`，并建立 annotated Tag `gate-2-5b-verified`。因此本阶段编号为 **Gate 2.5C**。

## 2. 审计结论

共确认 20 项：P0 1 项、P1 8 项、P2 8 项、P3 3 项。P0、P1 已全部修复；8 项 P2 均完成高价值收口；P3 只记录，不进行视觉重构。

| 编号 | 页面 / 对象 | 修复前行为 | 正确行为 | 严重度 | 根因 | 后端真值来源 | 修复方案 | 回归方式 | 状态 |
|---|---|---|---|---|---|---|---|---|---|
| STAB-001 | FileAsset / 正式 DOCX | 正式 TeachingPlan 导出文件仍可走通用新版本和手工绑定接口，可能使当前文件内容、来源 Revision 与绑定含义错位 | 正式成果版本和绑定只由明确 approved Revision 的导出服务维护 | P0 | 通用 File API 未区分 `upload` 与 `teaching_plan_export` 的写入权限 | `artifact.file_asset.source`、`artifact.teaching_plan_file_export` | API fail closed；正式导出文件禁用手工版本和绑定；保留 immutable 历史 | PostgreSQL/HTTP：两个结构化 409；Playwright：正式成果入口禁用 | 已修复 |
| STAB-002 | 教学 / Task | `completed` 在课时与概览中显示为“已准备” | `ready_for_use` 显示“已准备，待完成”，`completed` 显示“已完成” | P1 | 多页各自复制状态映射且映射错误 | `work.lesson_preparation_task_details.preparation_status` | 建立共享展示词汇，所有核心页统一使用 | Unit + Playwright 跨页断言 | 已修复 |
| STAB-003 | 教学 / Task CTA | `awaiting`、`ready` 仍以“继续备课”进入 Agent；`ready` 会被后端要求 reopen；cancelled/ready 无明确 reopen；取消命令无 UI | 主操作严格按状态进入 Agent、审核页或完成页；closed/ready 显式 reopen；可取消且说明影响范围 | P1 | 前端按钮只按“是否有 Task”分支，没有映射 Work 状态机 | Work Application Service 与 transition API | 状态驱动 CTA；新增 cancel/reopen/new-round 明确入口；后端仍决定转换 | Playwright：ready、completed、cancel/reopen；现有 PostgreSQL 状态机测试 | 已修复 |
| STAB-004 | TeachingPlan | 默认查看 active in-review 时显示“正在查看历史版本” | active in-review 明确是“当前待审核”，历史/superseded 才称历史 | P1 | 用“不是 current approved”错误等同“历史” | Artifact current/in-review pointers | 按 revision ref 与 active in-review 指针判断文案和按钮 | Playwright：in-review 页面不出现历史误标 | 已修复 |
| STAB-005 | Copilot / ModelExecution | 入队成功后 `generating=false`，而运行中仍可再次点击，随机幂等键会创建第二次执行 | queued/running/validating/retry/cancel-requested 期间只能取消或等待，不能再次生成 | P1 | 按 HTTP POST 生命周期而不是 durable ModelExecution 生命周期控制按钮 | `runtime.model_execution.status` | 使用持久化状态禁用提交并给出原因；刷新后同样生效 | 默认 Playwright + Fake Ark timeout 断言 | 已修复 |
| STAB-006 | Copilot / Proposal scope | 从 Task A 切到 Task B 或直接打开 Proposal URL 时，短暂保留全局 React 中的旧 Proposal，可误操作旧对象 | 路由 scope 改变立即清空视图缓存，完成服务端恢复后再启用操作 | P1 | App 级 `task` 仅是缓存，但未在 scope 变化时失效 | Proposal detail、preparation task detail API | 恢复开始即清空 task/selection/disposition/model view；处置时统一禁用 | Playwright 刷新/直接 URL；类型化恢复测试 | 已修复 |
| STAB-007 | Lesson → Files | 从“斜率与图像变化”打开文件页后，下拉默认“变量与函数”，上传可能绑定错课时 | URL 携带并恢复 Lesson/FileAsset；刷新、返回均保持上下文 | P1 | `/files` 导航没有资源参数，FileManager 总选第一课时 | File binding API、Lesson Repository | `/files?lesson=…&asset=…`；FileManager 用参数恢复选择 | Unit route test + Playwright 跨页 URL/选择断言 | 已修复 |
| STAB-008 | Copilot / Disposition | 一个处置请求执行时，其他处置、策略和编辑入口仍可点击 | 同一 Proposal 一次只允许一个 UI 处置；409 后恢复服务端最终处置 | P1 | loading 只绑定被点击按钮，未覆盖整个 disposition 区 | 唯一 disposition constraint、expected revision | 全区禁用；结构化冲突后 reload Proposal/pending list | Playwright 控件断言 + 既有并发 PostgreSQL 测试 | 已修复 |
| STAB-009 | 概览 | “制作课件”和备课组动作外观可用，但只跳 Mock 或显示 toast，容易被理解为成功 | 未实现动作明确禁用；Mock/READ_ONLY 区域显式标识 | P1 | 高保真原型沿用主动按钮 | 无正式 API | 禁用未实现入口，移除假成功；保留只读导航 | Playwright 概览结构与无 console error | 已修复 |
| STAB-010 | 文件 / 加载失败 | 课程/课时 API 失败被吞掉，按钮仅失效且无原因 | 显示安全错误，清空不可用上下文并解释禁用原因 | P2 | `catch(() => undefined)` | CourseRun/Unit/Lesson API | 显式错误、空状态和 disabled reason | UI 回归 + HTTP failure 审计 | 已修复 |
| STAB-011 | 文件 / 并发 | 上传时其他写按钮仍可操作；已删除文件的历史版本下载仍可点击 | mutation 期间相关操作统一禁用；deleted 只能恢复后下载 | P2 | busy 只绑定上传按钮 | FileAsset status/version | 所有文件 mutation 共享 busy；deleted history 禁用并说明 | Playwright 文件生命周期 | 已修复 |
| STAB-012 | 文件 / 删除恢复 | 软删除后文件从 active 列表消失，教师不知道去哪里恢复 | 自动切换到“已删除”，提示绑定和历史保留；恢复后回到“有效” | P2 | filter 与 mutation 结果未协同 | FileAsset soft-delete status | mutation 成功后切换正确生命周期 filter 并恢复同一 asset | Playwright 删除/恢复 | 已修复 |
| STAB-013 | 概览 / 最近文件 | 文件读取失败被静默忽略；点击最近文件只到列表、不恢复对象 | 显示读取错误；点击恢复明确 FileAsset | P2 | 错误被吞掉、导航无 asset ref | File list/detail API | 错误状态 + context URL | Unit route + Playwright 文件上下文 | 已修复 |
| STAB-014 | Runs | active ModelExecution 只读一次，页面可能长期停留旧状态；状态显示原始英文 | active 状态轮询到 terminal；同时显示教师词汇与审计 code | P2 | Runs 没有恢复轮询 | Run explanation / ModelExecution | 750ms 有界轮询，terminal 自动停止；共享状态词汇 | Fake Ark timeout/retry/cancel + Runs 断言 | 已修复 |
| STAB-015 | 概览只读区 | 学生、备课组、学校合成数据与真实备课模块视觉接近 | 标题/说明/状态明确标注只读演示，写动作禁用 | P2 | Mock 页面早于真实切片 | 前端固定数组 | READ_ONLY 标识，不产生成功 toast | Playwright 概览 | 已修复 |
| STAB-016 | 409 冲突恢复 | Plan、Disposition、ModelExecution、TaskWorkingSet、File mutation 冲突后按钮可能继续基于旧 version | 展示结构化冲突并重新读取后端当前版本 | P2 | catch 只显示错误，未刷新对象 | expected version、unique constraints | 409 后精确 reload 对象；不自动重放写命令 | PostgreSQL 并发 + UI 代码断言 | 已修复 |
| STAB-017 | FileVersion / Revision 对应 | 版本历史只显示文件名，Revision 对应关系需要猜测 | 正式成果标注来源、版本摘要与“只能由 approved Revision 导出” | P2 | 通用文件详情缺少成果语义说明 | export record + version content summary | 增加正式成果说明和每版摘要；不新增投影表 | Playwright DOCX v1/v2 历史 | 已修复 |
| STAB-018 | Runs / File refs | 技术 ref 对普通教师偏密集 | 普通业务区优先中文，技术 code/ref 按需展开 | P3 | 调试页承担审计详情 | 正式 refs | 本阶段只补中文标签，保留调试 refs | 人工走查 | 记录，未做视觉重构 |
| STAB-019 | 状态颜色层级 | 多种 terminal/历史状态仍共享相近 Tag 样式 | 后续可细分 cancelled/superseded/validation failure 色阶 | P3 | 冻结 Design Token | 状态字段 | 仅记录；不改 Design Token | 人工视觉检查 | 推迟 |
| STAB-020 | 文件绑定展示 | 绑定列表仍包含较长 ref | 后续可按对象标题聚合，并保留展开 ref | P3 | 现有 DTO 只返回 target ref | File binding | 本阶段增加中文对象类型；不增加万能 Dashboard/Projection | 人工走查 | 部分改善，聚合推迟 |

## 3. 状态语义与主操作

| 对象 | 后端状态 | 教师页面主语义 |
|---|---|---|
| Lesson preparation Task | `planned` | 启动或继续备课 |
|  | `in_progress` | 继续 Agent 备课 |
|  | `awaiting_plan_review` | 继续审核 Proposal / in-review |
|  | `ready_for_use` | 计划已批准，但必须另行“完成备课”；如需修改须显式 reopen |
|  | `completed` | 已完成；可查看成果。补充建议仅供拒绝/延后审阅，接受修改前必须显式 reopen 或新建一轮 |
|  | `cancelled` | 已取消；可显式 reopen 或新建一轮，历史不删除 |
| TeachingPlan | `draft` / `in_review` / `superseded` / `approved` | 只有 current approved 是当前正式计划；in-review 不是历史也不是正式成果 |
| ModelExecution | queued → running → validating → succeeded 或 terminal failure | UI 由 durable status 驱动；页面关闭不取消；active 时禁止重复提交 |
| FileAsset | active / soft deleted | FileVersion 不可变；deleted 保留 binding/history；正式导出文件由 export service 管理且不可删除/手工替换 |

## 4. 单一真值源

以下状态只读取 PostgreSQL 与类型化 API：Lesson/Task 状态、Proposal/Disposition、active in-review、current approved、ModelExecution、FileAsset/FileVersion、binding、TeachingPlan export 和最近真实文件。React state 只缓存当前视图、筛选、已加载 DTO 与 loading/error；`sessionStorage` 只用于一次性 Agent 文本预填，不承担业务状态。概览没有新增万能 Dashboard 表。

## 5. P3 与明确非目标

本 Gate 不调整侧边栏、一级路由、字体、Design Token 或卡片体系；不实现作业/考试闭环、学生长期模型、日历/Todo、第二模型、云部署、文件多模态理解或新业务模块。Gate 2.6B 仍只是候选，不是已经完成的历史阶段。

## 6. 自动化与可视化证据

| 证据 | 结果 | 证明范围 |
|---|---|---|
| TypeScript | 4 个 workspace 通过 | API、Web、Contracts 与共享包保持类型一致 |
| Vitest | 15 个文件、77 个测试通过 | 状态展示词汇、路由上下文、领域与应用回归 |
| Architecture | 4 个文件、30 个测试通过 | 七模块边界与 Product/Test Composition Root 未回退 |
| Static Assertions | 990 项通过 | 产品路由、迁移、权限与禁止项约束 |
| HTTP E2E / Node Smoke | 5 / 5 个测试通过 | 类型化 API 与 Node 启动链路 |
| PGlite Migration | 32 个 Migration 从空库通过 | 前向数据库基线未破坏 |
| PostgreSQL | 11 个文件、63 个测试通过 | Task、Plan、ModelExecution、File 并发/幂等/恢复语义 |
| 默认 Playwright | 12 个流程通过 | 教师主流程、刷新恢复、文件联动与页面一致性 |
| Fake Ark Playwright | 1 个完整故障矩阵通过 | timeout、429/retry、repair、cancel 与安全状态反馈 |
| Production Build / Bundle | 通过；初始 JS 646.9 KiB（gzip 211.8 KiB） | 生产构建可用，OpenAI SDK 与 Secret 未进入 Web bundle |
| Secret Scan / Demo Doctor / `git diff --check` | 通过 | 无 Secret 泄露；本地 Demo 健康；补丁格式正确 |

Playwright 截图保存在 Git ignored 的本地验收目录：

- `output/playwright/teacher-portal-ui-v1/final/22-gate2-5c-active-in-review.png`：active in-review 与 current approved 明确分离；
- `output/playwright/teacher-portal-ui-v1/final/23-gate2-5c-ready-action.png`：`ready_for_use` 显示“已准备，待完成”，主操作为查看计划并显式完成；
- `output/playwright/teacher-portal-ui-v1/final/24-gate2-5c-file-context.png`：从 Lesson 打开文件后恢复正确 Lesson 与 FileAsset，正式导出文件写入口受保护。
