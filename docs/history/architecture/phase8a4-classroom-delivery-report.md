# Phase 8A-4 Classroom Delivery 实施报告

## 1. 结论

Phase 8A-4 已将原来的长表单主路径收敛为：

```text
Approved TeachingPlan
  -> 教师 30 秒快速反馈
  -> classroom-reflection@1
  -> 可解释 ContextManifest + AgentRun
  -> LessonDelivery Draft + Observation Candidates
  -> 教师确认 LessonDelivery
  -> 正式课堂实施事实
  -> 教师逐条采用并确认 Observation
  -> Reflection 入口
```

系统负责把已批准方案和教师的少量选择整理为候选；教师仍然是正式课堂事实和课堂观察的唯一确认者。快速反馈、Skill 输出和 Observation Candidate 都不会自动声称课堂已经发生，也不会形成长期学生能力标签。

## 2. 课堂反馈模型

快速反馈只收集五组低成本信号：

| 维度 | 选项 |
| --- | --- |
| 整体情况 | 基本按计划 / 有调整 / 未完成 |
| 节奏 | 正常 / 比计划慢 / 比计划快 |
| 学生反应 | 达成 / 部分困难 / 需要复习 |
| 异常环节 | 导入 / 讲解 / 活动 / 练习 / 总结，可多选 |
| 补充 | 可选一句话，最多 500 字 |

请求必须绑定当前 Lesson、CourseRun 和 current approved TeachingPlan Revision，并带显式 purpose 与幂等键。它是教师信号，不是 `LessonDelivery` 正式事实。

## 3. Delivery Draft 流程

`classroom-reflection@1` 是 published、版本化、需要人工确认的 Draft Skill。第一版采用确定性整理，以便在没有新增模型风险和事实幻觉的情况下稳定完成候选转换；Prompt、Schema、Context Policy、Validator 和 Evaluation 均有明确版本。

Skill 输入只包括：

- 当前 Lesson；
- current approved TeachingPlan Revision；
- 教师本次快速反馈；
- 当前 Lesson 范围内已授权且已确认的 Evidence；
- 当前 Lesson 的 Observation Draft；
- 当前教师已确认且未撤销的 Preference。

Skill 输出包括：

- 五个教学环节的 `LessonDelivery Draft`；
- planned vs implemented 摘要；
- Reflection 输入候选；
- `status=candidate` 的课堂观察候选；
- 明确的数据缺口和不确定性。

Runtime 保存：

- `AgentRun`，输出状态为 `waiting_for_human`；
- Skill id/version/content hash；
- `ContextManifest`、来源版本和排除原因；
- Evaluation；
- `ClassroomDeliveryDraftGenerated` Outbox 事件；
- AuthorizationDecision、幂等结果和 Audit。

随后仅调用既有 Education Application Service 的 `createDelivery` 创建 Draft。确认仍走原有 `lesson-delivery.confirm` 命令。

## 4. Observation 边界

课堂观察候选遵守以下约束：

- Candidate 始终记录 `teacherConfirmationRequired=true`；
- Delivery 未确认前，候选不能被采用为 Observation Draft；
- 教师采用候选后仍需单独确认 Observation；
- Skill 不能直接调用 Education Repository 或 PostgreSQL；
- 一次课堂现象不能生成固定能力标签、长期学生画像或正式 Evidence；
- 跨学校 Evidence 在 Context Builder 中被排除并记录 provenance；
- 未授权或未确认的 Evidence 不进入 ContextManifest。

## 5. Journey 变化

Lesson Journey 没有新增第二套业务状态：

| 条件 | Journey 读取解释 |
| --- | --- |
| approved plan + materials ready，尚无 Delivery | `deliver.ready`，下一步为快速反馈 |
| 快速反馈已生成 Delivery Draft | `deliver.waiting_for_teacher`，下一步为确认实施 |
| Delivery 已确认 | 进入 `reflect` |
| 只有 Draft、没有 confirmed Delivery | 不能进入 Reflection completed |
| Reflection 已确认但无显式 follow-up | 不能假设教学改进闭环完成 |

这些状态均由现有 Lesson、TeachingPlan、Material、Delivery 和 Reflection 真值实时投影，不写入新的 Journey 表。

## 6. API 与页面

新增了小粒度、向后兼容的读取与命令能力：

- `GET /api/v1/teacher/lessons/:lessonRef/classroom-feedback/latest`
- `POST /api/v1/teacher/classroom/deliveries/quick-feedback`

Teaching Workspace 的 deliver 阶段新增 `QuickClassroomFeedback`：

- 三组单选；
- 一组环节多选；
- 一句可选补充；
- 草稿生成结果、来源与缺口；
- 教师确认 Delivery；
- Delivery 确认后逐条采用 Observation Candidate。

原有完整课堂实施表单仍作为 Draft 后的精细调整能力保留，但不再是教师首次记录课堂的主入口。

## 7. 权限、幂等与恢复

- 身份来自服务端 Session / ActingContext，不接受前端伪造 actor 或 tenant；
- current approved TeachingPlan 不存在或版本不一致时返回结构化冲突；
- 相同幂等键和相同 payload 返回同一 AgentRun 与 Delivery Draft；
- 相同幂等键、不同 payload fail closed；
- Runtime 保存成功而 Delivery Draft 写入失败时，可由相同请求继续恢复；
- Skill 生成或校验失败时，不写 Delivery Draft；
- School A 无法读取或生成 School B 的课堂反馈；
- confirmed Delivery、TeachingPlan 和 Observation 的既有不可变历史语义保持不变。

## 8. 数据库与兼容性

- 没有新增表；
- 没有新增 Migration；
- 45 个既有 Migration 未修改；
- 没有修改 `LessonDelivery`、`ClassroomObservation`、`TeachingPlan` 或 `Reflection` 的核心语义；
- API 变化为新增路由与 DTO，既有 Contract 和页面流程保持兼容；
- Runtime 复用既有 AgentRun、ContextManifest、Outbox、Audit 和幂等设施。

## 9. 测试结果

| 验证 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过，6 个 workspace，lockfile 无变化 |
| `pnpm typecheck` | 通过 |
| `pnpm test:unit` | 21 文件 / 108 测试通过 |
| `pnpm test:architecture` | 18 文件 / 101 测试通过 |
| `pnpm test:postgres` | 23 文件 / 110 测试通过 |
| `pnpm test:playwright` | 23 条教师主流程通过 |
| `pnpm test:ark-fake` | 1 条 Fake Ark 恢复流程通过 |
| `pnpm build` | API、Web、contracts、sample/test fixtures 全部构建通过 |

新增回归明确验证：

- 快速反馈只创建 Draft，确认前正式 Delivery、ObservedPedagogicalMove 和 Observation 数量均为 0；
- 教师确认后才生成 5 个课堂实施 move；
- approved TeachingPlan 内容前后完全一致；
- Skill 失败不损坏 Delivery；
- Journey 在 Draft 时等待教师，不会假完成；
- 幂等重放和 payload 冲突；
- current approved plan 缺失时不伪造 baseline；
- tenant / school 隔离；
- Playwright 覆盖快速反馈、确认、Observation、Reflection、follow-up 与 API 重启恢复。

所有 PostgreSQL、Playwright 和 Fake Ark 测试均使用独立 Volume 与 ObjectStore；执行后已清理，开发数据库与上传文件未变化。

## 10. 明确未实现

- 实时课堂助手；
- 摄像头、音频或视频分析；
- 自动判断课程是否发生；
- 自动确认 LessonDelivery 或 Observation；
- 自动学生能力标签或长期画像；
- 从传感器或课堂设备采集数据；
- 多模态课堂分析。

Phase 8A-4 的完成标准是“低成本收集教师信号并安全形成可确认草稿”，不是自动代替教师声明课堂事实。
