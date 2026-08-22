# Phase 8A-0：Teaching Workspace Journey Foundation

状态：已实现，等待人工验收  
实现分支：`codex/phase8a-journey-foundation`

## 1. 新增架构

本阶段增加了一个可重建、只读的 `LessonJourneyProjection`。它解释现有正式业务状态，但不拥有、复制或改变这些状态。

```text
Authenticated session / ActingContext
  -> Lesson Journey Read API
  -> LessonJourneyReadService
  -> LessonJourneyReadAdapter
  -> existing application services
       Lesson / preparation Task / TeachingPlan
       FileAsset
       LessonDelivery / Reflection
       Proposal / Agent execution
  -> pure projectLessonJourney(...)
  -> compact LessonJourneyProjection
  -> Teaching Workspace presentation
```

状态所有权没有变化：Lesson、Task、TeachingPlan、File、Delivery、Reflection、Proposal 和 AgentRun 仍由原模块拥有。Journey 只是当前用户可见范围内的读取解释。

## 2. Projection 设计

`LessonJourneyProjection` 返回：

- `lessonRef`；
- `currentStage`：`understand | plan | materials | deliver | reflect | improve`；
- `status`：`ready | in_progress | waiting_for_agent | waiting_for_teacher | needs_attention | completed`；
- 一项 `nextBestAction`；
- 阻塞原因与已完成里程碑；
- 来源引用、来源版本向量和小型详情链接；
- 生成时间。

关键约束：

- 纯函数计算，不写数据库；
- 不创建 `lesson_journey` 或 `teaching_workspace` 表；
- 不读取跨模块 Repository；
- 不在响应中复制 TeachingPlan、Evidence、Run 或文件内容；
- `sourceRefs` 只记录可解释性所需的引用和版本；
- 前端不自行推导 Journey 状态。

核心语义规则：

- 无 Task 时为 `understand.ready`，由教师决定是否开始备课；
- Proposal 或 in-review 计划存在时为 `plan.waiting_for_teacher`；
- Agent 正在执行时为 `plan.waiting_for_agent`，失败时为 `needs_attention`；
- approved TeachingPlan 只完成“定方案”，不表示课堂已经实施；
- 无 confirmed Delivery 时 Journey 不可能完成；
- confirmed Reflection 但没有教师选择的 follow-up 时仍为 `improve.waiting_for_teacher`；
- 只有 confirmed Reflection 与显式 follow-up 同时存在时才解释为 `improve.completed`。

## 3. API 变化

新增只读路由：

```http
GET /api/v1/teacher/lessons/:lessonRef/journey
```

路由沿用服务端 Session、ActingContext、Membership 和 CourseRun 授权。跨学校 Lesson 使用不可枚举的 404 响应；返回体不包含跨学校 Evidence 或资源内容。

相关 Contract 集中在 `packages/contracts`，由 Zod 在 API 与 Web 两端解析。

## 4. UI 变化

现有 `TeachingWorkspacePage` 没有被推翻。课时详情顶部新增：

1. `LessonContextHeader`：课程、单元、课时、计划时间和 Journey 状态；
2. `LessonNextBestActionCard`：只显示当前最重要的教师判断和真实动作入口；
3. `LessonJourney`：六阶段进度，明确区分已完成、当前和未开始。

原有准备度、文件预览、重点难点、作业、课堂实施和 Reflection 面板继续保留，便于逐步迁移而不改变教师工作流。

浏览器实测中，“斜率与图像变化”课时显示：

- 已批准计划和材料就绪；
- 当前阶段为“课堂反馈”；
- 下一步为“课后记录实施情况”；
- 明确提示这不表示课堂已经实施；
- 已完成 3/6 个 Journey 阶段；
- 控制台无 error/warning。

## 5. 数据库和运行目录

- 未新增、删除或修改 Migration；
- 当前 45 个 Migration 均可重新执行，其中既有 43 个历史 Migration 未变化；
- 未创建 Journey 持久化表；
- pnpm 11 的 store 固定为 `D:\03_Edu-Agent\.pnpm-store\v11`；
- 测试临时目录和验收产物使用 `D:\03_Edu-Agent\.local-data`；
- `.pnpm-store`、`.local-data`、`node_modules`、`dist`、Playwright report 和 test results 均保持 Git ignored；
- 未删除或修改外部 store、开发数据库、ObjectStore 或上传文件。

## 6. 测试结果

| 验证 | 结果 |
| --- | --- |
| Frozen install | 通过，6 个 workspace，lockfile 未变化 |
| Secret Scan | 通过，482 个文件 |
| TypeScript | 通过 |
| Unit | 16 files / 81 tests 通过 |
| Architecture | 15 files / 87 tests 通过 |
| Static assertions | 1534 条通过 |
| Migration verification | 1/1 通过 |
| HTTP E2E | 5/5 通过 |
| Node smoke | 5/5 通过 |
| PostgreSQL | 19 files / 100 tests 通过 |
| Default Playwright | 21/21 通过 |
| Fake Ark Playwright | 1/1 通过 |
| Production build | 通过 |
| Bundle analysis | 通过；Teaching Workspace chunk 约 74.9 KiB raw / 23.0 KiB gzip |
| Markdown links | 78 files / 148 local links 通过 |
| Application Doctor | 通过 |

PostgreSQL 和 Playwright 均使用独立 Volume 与 ObjectStore，完成后已清理并验证开发状态未变化。

`verify:repo-sync` 唯一未满足项是当前功能分支尚无远程 upstream；这不是源代码或仓库内容错误，待人工验收后推送即可。

## 7. 当前未实现能力

本阶段刻意没有实现：

- 教材、课程标准、考点或向量知识库；
- `lesson-analysis`、材料生成或反思分析新 Skill；
- Journey 数据库或第二套 Lesson 状态；
- 自动创建 Delivery、Reflection 或 follow-up；
- TeachingPlan、Runtime Kernel 或 Skill Registry 重写；
- 全量 Teaching Workspace UI 重构。

## 8. 下一阶段建议

建议 Phase 8A-1 先增加实时计算的 `LessonBriefSnapshot`，用现有 Lesson、LearningObjective、approved TeachingPlan 和教师授权 Evidence 形成“看懂本课”摘要；随后再按顺序接入：

1. Lesson Brief 与教师快速确认；
2. 基于现有 `lesson-preparation` Skill 的方案生成入口；
3. Material Bundle 读取投影；
4. 课堂快速反馈；
5. Reflection 的 Next Best Action。

继续坚持先读模型、后交互、最后才评估是否需要新持久化字段，避免一次重写教学模块。
