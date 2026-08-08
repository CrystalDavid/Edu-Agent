# Phase 8A-6 下一课优化现状审计

## 1. 审计范围

本次审计以 `codex/phase8a6-next-lesson-optimization` 分支和 Phase 8A-5 HEAD `f4d721a` 为事实来源，检查：

- confirmed Reflection Revision 与 `reflection-analysis@1` 的行动候选；
- `work.reflection_follow_up_link`；
- Lesson Preparation Task 与 TaskWorkingSet；
- Assignment Draft、TeacherTodo 和工作台投影；
- Reflection 页面、Lesson Journey 的 `reflect` / `improve` 解释；
- Authorization、Audit、幂等、跨学校隔离和现有 PostgreSQL 测试。

## 2. 当前闭环

Phase 8A-5 已经具备以下链路：

```text
confirmed Delivery + selected Observation/Evidence
  -> reflection-analysis@1
  -> Reflection Draft
  -> teacher confirms Reflection Revision
  -> 页面从 ReflectionContent 临时解释三个候选
  -> teacher directly invokes createFollowUp
  -> Preparation Task / Assignment Draft / TeacherTodo
```

正式 follow-up 创建边界是正确的：

1. 只有当前教师确认的 Reflection Revision 可以创建后续行动；
2. 创建命令使用服务端 Session / ActingContext，不能由请求伪造 tenant 或 actor；
3. Preparation Task 会复用当前 Lesson Preparation Application Service；
4. 已有开放 Task 时会追加 Reflection、Delivery、Observation 和 Evidence 到 TaskWorkingSet Revision；
5. Assignment 只创建 draft，仍需教师审核和发布；
6. TeacherTodo 需要教师显式完成；
7. `reflection_follow_up_link` 保存 Reflection Revision 到正式目标的来源关系；
8. 幂等键、并发冲突、Audit 和 tenant scope 已有 PostgreSQL 保护。

## 3. 现有对象与状态所有者

| 对象 | 所有者 | 当前用途 | Phase 8A-6 裁决 |
| --- | --- | --- | --- |
| Reflection Revision | Artifact | confirmed 复盘事实与解释 | 只读输入，不修改 |
| LessonDelivery / Observation / Evidence | Education | 已确认课堂与学习来源 | 只读、显式授权 |
| Reflection Action Draft | Runtime | `reflection-analysis@1` 输出中的临时候选 | 作为生成来源，不直接执行 |
| Reflection Follow-up Link | Work | 已创建正式目标的来源关系 | 继续保留，代表 accepted 的执行结果 |
| Preparation Task / TaskWorkingSet | Work | 下一课备课与封存来源 | 继续复用，不建立第二套 Task |
| Assignment | Education | 补充练习草稿和生命周期 | 继续由 Assignment Service 创建 |
| TeacherTodo | Work | 教师个人复核事项 | 继续由 Workbench Service 创建 |
| Lesson Journey | Work 读取解释 | `improve.needs_attention/completed` | 不成为业务真值 |

## 4. 当前缺口

### 4.1 候选不是持久化、可治理对象

当前页面直接从 confirmed `ReflectionContent` 重新拼出候选。候选没有稳定 ref、版本、来源 Skill、Context hash、过期时间或教师 disposition，刷新虽然可以再次计算，但无法解释教师曾经修改或拒绝了什么。

### 4.2 没有独立的教师决策生命周期

当前只有“创建 follow-up”这一条接受路径，没有：

- `candidate`；
- 修改候选但仍不执行；
- `rejected`；
- 基于来源版本失效的 `expired`；
- expected-version 并发保护。

`reflection_follow_up_link` 只能证明正式目标已经创建，不能代替完整候选和 disposition 历史。

### 4.3 候选尚未使用 confirmed TeacherPreference

Reflection 生成阶段使用已授权课堂来源，但下一步候选没有独立读取当前教师已确认、未撤销的 Preference。未确认 Memory 不应进入候选上下文。

### 4.4 “修改”与“重新生成”语义不清

当前教师可以修改 Reflection Draft，但 confirmed Reflection 后不能只调整某个下一课行动的标题或理由。直接修改 Reflection 会混淆正式复盘与行动计划。

### 4.5 Journey 只根据 follow-up 数量判断完成

现有 `improve.completed` 只说明至少一个正式 follow-up 已创建。它无法展示候选正在等待教师、全部被拒绝或已经过期。

## 5. 可复用的正式写入路径

### 5.1 调整下一课

现有 `createFollowUpTarget()` 已能：

- 查找或创建目标 Lesson 的 Preparation Task；
- 处理已有 Task 的 `awaiting_plan_review` / `ready_for_use`；
- 追加 Reflection Context 到 TaskWorkingSet Revision；
- 保留 Reflection、Delivery、Observation、Evidence 来源；
- 返回 Agent Task deep link。

### 5.2 补充练习

现有 Assignment Application Service 可以创建绑定目标 Lesson 的 draft；不会自动发布。

### 5.3 教师事项

现有 Workbench Service 可以创建 TeacherTodo，并将其绑定到 confirmed Reflection Revision；不会自动完成。

## 6. 实现裁决

Phase 8A-6 应新增 Work-owned `NextLessonActionCandidate`，而不是新建教育事实或复制 Lesson/Task：

```text
confirmed Reflection
  -> explicit generate command
  -> next-lesson-adjustment@1
  -> Runtime AgentRun + sealed ContextManifest
  -> Work action candidates (candidate)
  -> teacher edit / reject / accept
  -> existing formal follow-up command
```

候选是可治理的工作建议，不是 TeachingPlan、Lesson、Evidence 或长期 Memory。建议使用 forward-only Work Migration 保存候选与不可变状态历史；不修改 45 个既有 Migration。

## 7. 边界要求

1. 只有 confirmed Reflection 才能显式生成候选；
2. 生成命令本身不创建 Task、Assignment 或 Todo；
3. Skill 只读取 Runtime 提供的快照，不引用 Repository；
4. 只读取当前 teacher/tenant 的 active confirmed Preference；
5. Evidence 必须来自 Reflection Revision 已封存的选择；
6. 修改候选只产生新 Candidate Version，不修改 Reflection；
7. 接受必须通过现有 Platform Application Service 创建正式目标；
8. 拒绝和过期不修改 Lesson 或其他正式业务对象；
9. 同一 Candidate 并发 disposition 只能一个成功；
10. 历史 Candidate、版本、教师决定和来源 Run 必须可追溯。

## 8. 审计结论

现有正式 follow-up 和下一课 Preparation Task 链路无需重写。Phase 8A-6 的最小高价值改动是：在 Reflection 与正式 follow-up 之间增加一个 Work-owned、版本化、可拒绝的行动候选层，并通过 `next-lesson-adjustment@1` 和 Runtime ContextManifest 生成它。这样既补齐教师“接受 / 修改 / 拒绝”的控制权，又继续复用已验证的 Lesson Preparation、Assignment 和 Todo 真值。
