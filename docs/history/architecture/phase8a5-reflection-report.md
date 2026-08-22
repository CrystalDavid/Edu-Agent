# Phase 8A-5 Reflection 与下一课优化闭环报告

## 1. 完成范围

Phase 8A-5 在不修改数据库 Schema、历史 Migration、Runtime Kernel、TeachingPlan、Evidence 或 LessonDelivery 正式语义的前提下，完成了以下闭环：

```text
confirmed TeachingPlan Revision
  + confirmed LessonDelivery Revision
  + selected confirmed Observation
  + selected authorized Assignment Evidence
  + optional adopted Lesson Brief
  -> reflection-analysis@1
  -> Reflection Draft（事实 / 解释 / 行动候选）
  -> 教师判断、修改或暂不确定
  -> confirmed Reflection Revision
  -> 教师显式选择一个 follow-up
  -> 下一课 Preparation Task / Assignment Draft / Teacher Todo
```

系统负责整理和提出候选；教师仍负责确认课堂事实、确认 Reflection，以及决定是否创建下一步行动。

## 2. Reflection 模型

### 2.1 正式状态

正式 Reflection 继续由 Artifact 模块拥有，沿用既有 Reflection 与不可覆盖 Revision 历史：

- 模型生成只创建新的 `draft` Revision；
- 教师通过现有 Application Service 显式确认后才形成 `confirmed` Revision；
- 生成期间教师草稿发生变化时，finalize 通过 Revision 冲突阻止覆盖；
- confirmed Revision、旧 Revision 和来源 AgentRun 均可追溯；
- Reflection 不覆盖 approved TeachingPlan。

### 2.2 Skill 输出

`reflection-analysis-draft@1` 明确分为三层：

1. `whatHappened.facts`：只引用 confirmed Delivery、confirmed Observation 和 selected Evidence，状态固定为 `confirmed_source`；
2. `whatItMeans.interpretations`：明确标记为 `agent_interpretation`，同时保留 `uncertainties`；
3. `whatNext.actionCandidates`：最多三个、状态固定为 `candidate`，且 `teacherConfirmationRequired=true`。

现有 `ReflectionContent` 继续作为正式 Revision 的兼容编辑模型，因此本阶段无需新增事实表或 Migration。

## 3. Skill 设计

新增发布版本：

| 属性 | 值 |
| --- | --- |
| Skill | `reflection-analysis@1` |
| purpose | `reflection_analysis` |
| output | Draft |
| tools | disabled |
| memory | authorized context only |
| approval | teacher required |
| evaluation | contract / policy / quality / operation |

Skill 目录包含 Manifest、输入/输出 Schema、Prompt 元数据、Context Policy、Context Builder、规范化器、Validator 和 Evaluation。Skill 不引用 PostgreSQL、Education Repository 或 Artifact Repository。

模型 Provider 暂时继续输出兼容的 `lesson-reflection@1` JSON；本地验证后由 `reflection-analysis@1` 规范化为三层 Draft。新执行使用 `prompt-bundle:lesson-reflection-ark@2`，使教师已采用的 Lesson Brief 真正进入模型输入；历史执行仍可按 v1 原样重建。

## 4. 事实与推理边界

### 4.1 Context 来源

本次运行只允许读取：

- 当前 Lesson；
- 当前 approved TeachingPlan Revision；
- 当前 confirmed LessonDelivery Revision；
- 教师明确选择的 confirmed Observation；
- 教师明确选择且再次授权的 Assignment Evidence；
- 当前教师在当前学校、当前 Lesson 已采用的 Lesson Brief；
- 教师本次输入的一句话调整意见。

每个来源记录 ref、version、hash 和 provenance。Observation 与 Evidence 分别限制为最多 12 条，并使用有界摘要；未授权 Evidence 被排除并写入 Manifest，不能进入模型或输出 basis refs。

### 4.2 不允许发生的写入

Skill 与 Runtime 都不能：

- 确认 LessonDelivery 或 Observation；
- 创建 confirmed Reflection；
- 修改 approved TeachingPlan；
- 修改 Evidence；
- 自动创建 Preparation Task、Assignment 或 Todo；
- 自动发布作业；
- 形成长期学生能力标签。

## 5. Teaching Journey 与教师体验

Journey 继续是可重建读取投影，不是第二套业务状态：

| 正式状态条件 | Journey 解释 | 教师下一步 |
| --- | --- | --- |
| 无 confirmed Delivery | `deliver.*` | 先确认 30 秒课堂反馈 |
| confirmed Delivery、无 Reflection | `reflect.ready` | 生成本节课复盘 |
| Agent 正在运行 | `reflect.waiting_for_agent` | 等待或恢复运行 |
| Reflection Draft | `reflect.waiting_for_teacher` | 准确 / 需要调整 / 暂不确定 |
| confirmed Reflection、无 follow-up | `improve.needs_attention` | 明确选择下一步 |
| 已显式创建 follow-up | `improve.completed` | 进入对应正式流程 |

课后反思页改为先显示：

- **发生了什么**：教师已确认的来源事实；
- **这意味着什么**：教学助手解释和仍不确定内容；
- **下一步可以做什么**：尚未执行的候选。

长表单不再是主入口。教师可以用一句话重新整理；需要精细修改时再展开兼容编辑区。只有“准确，确认反思”形成 confirmed Reflection；“需要调整”和“暂不确定”都保持 Draft。

## 6. 下一课优化流程

confirmed Reflection 后最多显示三类候选：

1. 调整下一课教学重点 -> `lesson_preparation`；
2. 生成补充练习草稿 -> `assignment_draft`；
3. 复核仍不确定的问题 -> `teacher_todo`。

确认 Reflection 本身不会创建任何候选对应对象。教师必须逐项点击创建；既有 Work/Application Service 继续负责幂等、权限、来源关系与正式状态。Preparation Task 的 TaskWorkingSet 保留 Reflection、Observation 和 Evidence 来源，后续 TeachingPlan 仍需独立审阅和批准。

## 7. 失败、恢复与审计

- 没有 confirmed Delivery 时 fail closed；
- Context 授权或来源 hash 不一致时不调用模型；
- Provider、Schema 或 Skill Evaluation 失败时不损坏正式事实；
- API/Worker 重启后从 PostgreSQL AgentRun、ModelExecution、ContextManifest 和 Reflection Revision 恢复；
- Run 记录 Skill id/version/ref/hash、Prompt version/hash、Context Manifest hash、三层 Draft、Evaluation 和 `waiting_for_human`；
- 相同幂等键同 payload 可回放，不同 payload fail closed；
- 任何失败和任何 Draft 生成都不会自动创建 follow-up。

## 8. 测试结果

验证日期：2026-08-07。所有依赖、数据库、ObjectStore 和浏览器测试产物均限制在 `D:\03_Edu-Agent`；pnpm store 为 `D:\03_Edu-Agent\.pnpm-store\v11`。

| 验证 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过，6 个 workspace，lockfile 无变化 |
| `pnpm typecheck` | 通过 |
| `pnpm test:unit` | 22 files / 115 tests 通过 |
| `pnpm test:architecture` | 19 files / 105 tests 通过 |
| `pnpm test:postgres` | 23 files / 110 tests 通过 |
| `pnpm test:playwright` | 23 tests 通过 |
| `pnpm test:ark-fake` | 1 test 通过 |
| `pnpm build` | API、Web、Contracts、Sample/Test Fixtures 通过 |
| Migration | 45 个历史 Migration，基线差异为 0 |
| 隔离资源 | PostgreSQL Volume 与 E2E ObjectStore 已清理，开发状态未改变 |

新增回归覆盖：

- Skill Contract、三层输出、最多三个行动候选；
- 未选择 Evidence 排除和跨学校引用拒绝；
- adopted Lesson Brief 的 Prompt v2 输入与历史 Prompt v1 重放；
- Runtime 绑定 SkillVersion、Manifest 和 `waiting_for_human`；
- Draft 不成为事实，Reflection 不自动创建 follow-up；
- Journey 的 `reflect.ready`、`waiting_for_teacher`、`improve.needs_attention`；
- PostgreSQL 正式 Revision、Layered Draft、无自动 follow-up 和重启恢复；
- Playwright 生成、三层审阅、教师修改/确认、显式后续行动、工作台同步和原 TeachingPlan 不变。

Playwright 证据位于 Git ignored 的：

`D:\03_Edu-Agent\.local-data\test-output\playwright\evidence\gate-2-9\`

其中 `02-layered-reflection-review.png` 展示了新的事实、解释和下一步候选审阅界面。

## 9. 未实现与后续建议

本阶段有意未实现：

- 自动修改下一课 TeachingPlan；
- 自动创建或发布 Assignment；
- 自动创建全部后续行动；
- 学生长期画像或自动能力判断；
- 新 Memory 系统；
- Reflection 专用新数据库表；
- Provider 原生三层输出契约。

后续若需要让 Provider 原生生成三层结构，应发布 `reflection-analysis@2`，保留 v1 历史 Run；不应静默修改已发布 SkillVersion。下一产品阶段可在不改变事实边界的前提下，把 Lesson Journey 的课前、课堂和课后状态进一步汇总为教师当天的 Next Best Action。

## 10. 结论

Phase 8A-5 已形成完整教学闭环：系统基于教师确认和授权的来源总结真实发生内容，明确分离 Agent 解释，提出最多三个尚未执行的下一步候选；教师确认 Reflection 后，再决定是否进入下一轮备课、练习或个人待办。Edu-Agent 不会把 Draft、推理或候选冒充教育事实。
