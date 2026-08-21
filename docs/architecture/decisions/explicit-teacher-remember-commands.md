# 教师备课对话中的显式记住命令

> 状态：Accepted for PR-2B implementation；不是 Verified Gate
> 生效日期：2026-08-21
> 决策版本：`explicit-memory-command-policy@1`

## 背景

M1 已提供同一备课 Task 内的 Conversation/WorkingMemory 连续性，M0-lite 可解释本次参考内容，PR-2A 则增加了 TeacherPreference Scope、valid time、`teacherMemoryEpoch` 和 Pack V2。它们仍不能处理老师在对话中明确提出的“以后请记住”要求。

PR-2B 只把受控、低风险、完整解析的明确命令变成 durable TeacherPreference。它不从普通对话推断习惯，不实现对话式忘记或正式“仅本次”覆盖，也不增加 Episode、Habit、全文/向量检索或 Provider continuation。

## 决策

### 1. 只处理 explicit remember

只有 owning teacher 的当前 immutable Conversation Turn 中存在明确 durable marker，且整个命令被白名单规则完整覆盖时，才允许进入直接启用流程。`记住`、`请记住`、`帮我记住`、`以后`、`今后`、`从现在起`、`默认`和`以后都`只是意图候选；不确定表达、引述、元对话、临时语义、反向命令或未解析残留都会阻止直接启用。

普通请求继续是 `teacher + teacher_text` 并进入模型流程。明确命令是 `teacher + command`，只推进 Conversation sequence，不创建 ModelExecution 或 Proposal。

### 2. 不使用 LLM 解释命令

`explicit-memory-command-interpreter@1` 是纯 Domain 函数，不访问 Provider、Repository、PostgreSQL、embedding 或外部服务。相同输入、Catalog、Scope、flag 和时间产生相同 typed union 与 hash。这样可以审查何时写入长期状态，并避免模型把模糊话语、模型输出或 Prompt injection 解释成教师授权。

### 3. Catalog 与 canonical value

`teacher-preference-catalog@1` 只包含低风险服务器条目：教案长度、教案详细程度、教案表达风格、生活化案例偏好和回复篇幅。浏览器和模型都不能提交 canonical key/value、risk level、consent 或 Scope fingerprint 真值。

durable value 来自 Catalog，不复制老师原句。原始命令只保留在 Work Conversation 的既有 retention 边界；Personalization 保存安全摘要以及 immutable Turn ref/sequence/hash，不保存完整命令、Prompt、Provider 响应、隐藏推理、Secret 或学生敏感内容。

### 4. Scope、授权与 direct activation

默认 Scope 是 `global + skillIds=[lesson-preparation]`；“这门课/这个班/当前课程”只能绑定当前已授权的稳定 `courseRunRef`。PR-2B 不解析命名学科、年级、Lesson、Task 或任意 CourseRun。

Scope 仍不是授权。Composition 在写 command Turn 前重新验证 Session/ActingContext、Conversation、Task、CourseRun、Lesson 与 owner；Personalization 再通过 typed Scope authorization Port 校验。跨 tenant、foreign owner、不存在或不匹配统一 fail closed。

直接启用必须同时满足：完整覆盖、无残留、所有 item 为 Catalog low-risk、Scope 唯一且已授权、两个相关 feature flag 均开启，并且现有同 key/Scope 状态可安全处理。

### 5. Candidate、Preference、duplicate 与 conflict

新偏好在一个 Personalization 事务内创建 draft Candidate、立即确认、创建 active TeacherPreference、写 immutable revision/Audit/Authorization/idempotency，并递增 `teacherMemoryEpoch`。consent 固定为 `teacher_explicit_command` / `consent:explicit-remember@1`，explicitness 为 `teacher_declared`。

完全相同且当前有效的 active Preference 返回 `already_remembered`：不创建 Candidate/Preference，也不递增 epoch。同 canonical key + Scope 存在不同值时只创建 draft Candidate，返回 `review_required`；不得静默覆盖。老师显式选择“替换”才以 expected Candidate/Preference version 产生新 immutable Preference revision 并递增 epoch；选择“保留”只 reject Candidate，不递增 epoch。

### 6. Work 0013 与 command Turn

架构复核证明 Contract 已包含 `command`，但 PostgreSQL 0012 的 `conversation_turn_check` 不允许合法 command 组合。因此 PR-2B 追加 Work-owned `0013_explicit_memory_command_turn.sql`，不改写 0012 或其他既有 50 个 Migration。

0013 用固定名称 `conversation_turn_actor_content_check` 替换旧 CHECK，并只允许：teacher 的 `teacher_text/command`、assistant surface 的 `safe_surface_summary/command/result_link`、system event 的 `safe_surface_summary/result_link`。既有 immutable UPDATE/DELETE trigger、owner、Conversation FK、sequence 和 hash 语义保持不变。

刷新后恢复成功回执和 conflict card 需要解析 Personalization 真值。由于 0012 只有模型/Proposal 物理 ref 列，0013 同时增加有界的 `memory_candidate_refs text[]` 与 `teacher_preference_refs text[]`：默认空数组、每类最多 10 个、元素非空，仅 `command/result_link` 可携带。它们只保存 ref，不复制正文，不建立跨 Schema FK，也不引入自由格式 result JSON。读取时仍按当前 owner 授权通过 Personalization typed API 解析详情。

### 7. WorkingMemory 语义

WorkingMemory Builder 只把 `teacher + teacher_text` 作为 active goal、recent teacher request 和指代来源。teacher command 和 assistant command receipt 都不会进入模型输入或替换教学目标。

如果 Conversation 的第一条内容就是 remember command，Conversation 可以有 command/receipt，但 WorkingMemory 保持 null，含义是“尚无教学生成目标”；系统不会虚构任务或调用模型。后续普通 teacher text 才建立新的 snapshot。

### 8. 跨 Schema 恢复与幂等

Composition saga 顺序为：

1. Work 幂等写 immutable teacher command Turn；
2. 使用 Turn ref/content hash 派生稳定 key，调用 Personalization typed service；
3. Work 幂等写 assistant command receipt Turn；
4. Web 读取 Conversation 安全摘要，并按 refs 读取当前授权下的 Candidate/Preference view。

不使用跨 Schema SQL 或分布式事务。步骤 2 失败时 command Turn 保留，重试复用同一 Turn；Personalization 事务全部回滚。步骤 3 失败时已提交 Preference 不回滚，重试由 Personalization idempotency replay，再补写同一 receipt，不重复 Candidate/Preference 或 epoch。这里的保证是 at-least-once + idempotency + recoverability，不声称 exactly-once。

### 9. 高风险、Prompt injection 与公开回执

学生/learner 标签、成绩判断、健康/纪律、身份数据、Secret/Token/密码/手机号、Evidence 结论、权限/审批、正式业务事实、系统提示、工具调用和绕过指令均不进入 Candidate/Preference。高风险或不支持命令只产生最小 command Turn 与安全 receipt，不调用模型，不递增 epoch。

公开回执只包含受控状态、Catalog display value、Scope、必要 refs/version 和安全 reason；不暴露 parser regex、数据库错误、foreign ref、完整 Prompt/响应或隐藏推理。UI 使用“已记住/已经记住/需要确认/未保存”，不声称模型一定遵循或已经形成教师人格。

### 10. Feature flag、retention 与回滚

`MEMORY_EXPLICIT_REMEMBER_ENABLED` 在 local/test 默认开启，production 未显式配置时关闭；它还依赖 `MEMORY_SCOPED_PREFERENCES_ENABLED`。任一关闭都不降级成 unrestricted Preference，不写 Candidate/Preference，不调用模型处理 memory-only command。既有 Preference 与历史 receipt 保留。

command 原文、receipt 摘要和结果 refs 继承 Conversation retention；Candidate/Preference 沿用 Personalization 的治理和 immutable revision。具体生产保留期限、学校级覆盖、Legal Hold、导出和 redaction/tombstone SLA 仍待产品负责人确认。

应用回滚通过关闭 feature flag 停止新写入；不逆向 0013、不删除历史 Turn/Preference。旧 append-turn、requestVersion 1/2、lesson-preparation@1–@6 与 Pack V1/V2 保持兼容。

## 后续边界

PR-2C 可以新增明确的 forget 和 temporary override 状态，但必须设计撤销授权、历史解释和运行级覆盖，不得把本轮“未保存”回执当成已实施状态。M3 可以从普通行为提出 Candidate，但不能复用本轮 direct activation 路径；推断项必须单独 consent、评测和教师确认。

## 未采用方案

- 让 LLM 或浏览器解释并直接写 Preference：不可确定，且会绕过服务端 Catalog、owner 与 consent。
- 把 command 当普通 teacher text：会污染 WorkingMemory 和 Prompt，并错误创建模型运行。
- duplicate 时重新确认：会制造 revision/epoch 噪声。
- conflict 时 last-write-wins：会把老师未确认的新值变成长期状态。
- 跨 Schema 事务或 Work 直接写 Personalization：破坏状态所有权和现有 Port 边界。
- 保存完整命令结果 JSON：扩大复制面，且 refs + owning typed read 已足够恢复。
- 立即实现 forget、Habit 或向量检索：超出本轮显式、低风险、确定性目标。
