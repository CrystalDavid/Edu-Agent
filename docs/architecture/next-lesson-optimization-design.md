# Next Lesson Optimization 设计

## 目标与边界

Phase 8A-6 把已确认的课后反思转化为可治理的行动候选，并且只有教师接受后，才调用现有正式 Application Service 创建下一课备课任务、补充练习草稿或教师待办。

这条链路严格区分三类状态：

- Artifact 模块拥有已确认 Reflection Revision；
- Runtime 模块拥有 `next-lesson-adjustment@1` 的 AgentRun、ContextManifest 和 Evaluation；
- Work 模块拥有教师需要处置的 `NextLessonActionCandidate` 及其决策历史。

候选不是课程、教学计划、作业或 Todo 的替代真值。接受候选之后产生的正式目标对象仍由原所属模块拥有。

## 端到端流程

```text
Confirmed Reflection Revision
  -> teacher explicitly requests suggestions
  -> Authorization + Skill-aware Context Builder
  -> next-lesson-adjustment@1
  -> at most three candidate actions
  -> waiting_for_human
  -> teacher accepts / edits / rejects
  -> existing follow-up Application Service
  -> Preparation Task | Assignment draft | Teacher Todo
  -> target Lesson Brief / Lesson Preparation journey
```

生成建议本身是显式操作。确认 Reflection 不会自动运行 Skill，也不会自动创建后续对象。

## NextLessonActionCandidate

候选由 Work 模块持久化，最小字段包括：

- `candidateRef`：稳定引用；
- `tenantRef`、`teacherRef`：授权范围；
- `sourceReflectionRef`、`sourceReflectionRevisionRef`：唯一事实来源；
- `sourceAgentRunRef`、`contextManifestRef`：生成过程和实际上下文；
- `candidateType`：`adjust_next_lesson_focus`、`create_practice_task`、`create_teacher_todo` 或 `review_student_issue`；
- `title`、`reason`、`confidence`；
- `targetLessonRef`：需要下一课时使用，普通 Todo 可以为空；
- `status`：`candidate`、`accepted`、`rejected`、`expired`；
- `version`：教师修改和并发控制；
- `targetRef`、`deepLink`：接受后形成的正式对象；
- `sourceRefs`、`generatedBySkillRef`、时间字段。

每次创建、修改、接受、拒绝或过期都写入不可变历史。已接受、已拒绝或已过期候选不可再编辑；修改使用 `expectedVersion`，冲突返回结构化 409。

## Skill 与 Context

`next-lesson-adjustment@1` 是版本化 Skill，不直接访问 Repository，也不写业务状态。它只接收 Runtime 提供的授权快照：

- 已确认 Reflection Revision；
- 与 Reflection 精确绑定的 confirmed Delivery；
- Reflection 中教师明确选择且仍有权限读取的 Evidence；
- 当前教师已确认且未撤销的 Preference；
- 来源 Lesson 和教师明确选择的目标 Lesson；
- 可选的一句话调整要求。

Context Builder 对 Evidence 做授权交集和数量限制；未授权或超出预算的引用写入 ContextManifest 的 excluded information，不进入 Skill 输入。Manifest 记录资源版本、hash、provenance、缺口和估算 token。

该 Skill 使用确定性归一化：Reflection Analysis 已经由模型生成并由教师确认，本阶段不重复消耗模型 token，而是把其中的下一课建议、练习建议和不确定项转换成最多三个可执行候选。它仍产生完整 AgentRun、RunStep/Manifest 和 Evaluation，历史可解释。

## 教师决策与正式写入

- 接受“调整下一课”后，复用 `lesson-reflection.create-follow-up` 创建或复用正式 `lesson_preparation` Task，并把 Reflection、Delivery、Observation 和 Evidence 来源加入 TaskWorkingSet；随后进入目标 Lesson 的 Brief / Preparation 流程。
- 接受“补充练习”后，由 Education Application Service 创建 Assignment draft，不发布。
- 接受“教师待办”或“复查学生事项”后，由 Workbench Application Service 创建教师个人 Todo；它不会生成学生画像或长期能力结论。
- 修改只改变候选的新版本；不修改 Reflection。
- 拒绝只记录教师决策；不创建目标对象。

接受操作先用候选版本锁定决策，再调用幂等的正式 follow-up 写入路径；重复请求返回同一目标对象。任何失败都不会修改 Lesson、TeachingPlan、Evidence 或 Reflection。

## 读取与 Journey

候选通过独立小型 API 读取，不塞入巨型 Reflection 响应：

- 生成/列出某个 Reflection 的候选；
- 读取单个候选；
- 修改、接受或拒绝候选。

Journey 继续只把正式 follow-up 作为完成依据。只有生成但未决定的候选时，`improve` 显示等待教师；全部拒绝且没有正式 follow-up 时显示仍可优化，而不是伪造完成。

## 安全、不变量与恢复

- 只有 Reflection 的确认教师且当前 Membership 有效时才能生成和处置候选；
- Reflection、来源 Lesson、目标 Lesson、Evidence 和 Preference 必须属于同一 tenant；
- 未确认 Reflection 不能生成候选；
- 候选不能直接修改 Lesson、TeachingPlan、Evidence 或 Delivery；
- `sourceReflectionRevisionRef + skillRef + request idempotency` 保证生成幂等；
- 接受、修改、拒绝使用 expected-version；
- AgentRun 和 ContextManifest 持久化，进程重启后候选与来源仍可读取；
- 历史候选和决策不静默覆盖。
