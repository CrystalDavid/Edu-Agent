# Edu-Agent Roadmap

> 状态：CURRENT ROADMAP
> 产品基线：Gate 2.10A / `gate-2-10a-verified`

本文只描述尚未完成的未来工作。当前已经具备的能力以 [当前能力](capabilities.md) 为准，历史阶段以 [版本历史](version-history.md) 为准。

## 近期：完成 Teaching Workspace 端到端产品验收

- 验收 Lesson Journey、Lesson Brief、备课 Proposal、Material Bundle、课堂快速反馈、Reflection 与下一课优化的同页工作流；
- 确认 51 个只向前 Migration、开发数据库和 LocalObjectStore 均未被改变；
- 验证 confirmed Reflection → 版本化行动候选 → 教师接受 → 下一课 Preparation Task 的完整重启恢复链路；
- 教材/课程标准/考点 Knowledge Layer 在独立阶段设计，不在缺少来源时伪造权威结论。

Teaching Workspace 闭环验收后，优先进入独立的 Phase 9 Knowledge Foundation 设计与来源治理；只有在来源授权、版本和引用策略明确后，才让教材、课程标准或考点知识进入 Agent Context。

## Memory Track（与 Phase 9 并行，需产品排序）

M1 技术基线已经交付同一备课 Task/Conversation 的短期连续性。后续 Memory Track 的顺序是 **M0-lite → M2 → M3 → M4 → M5**，它与 Phase 9 Knowledge Foundation 并行，不能删除、替代或静默越过 Gate 2.10B：

- **M0-lite（当前代码已具备，未标记 Verified Gate）：**只读 `MemoryContextPackManifest@1`、“本次参考”解释、durable Preference application/outcome 与 degraded 观测；不改变检索、Prompt 或模型语义；
- **M2A（当前代码已具备，未标记 Verified Gate）：**Lesson Preparation 的结构化 scoped TeacherPreference、valid time、Skill constraint、teacherMemoryEpoch、确定性覆盖和 `MemoryContextPackManifest@2`；设置页只暴露 global/CourseRun；
- **M2B（当前代码已具备，未标记 Verified Gate）：**Lesson Preparation 对话中的明确“记住”、受控低风险 Catalog/确定性 canonicalization、`teacher_explicit_command` consent、重复去重，以及同 key/Scope 冲突的教师替换/保留；不从普通话语自动推断长期偏好；
- **M2C1（当前代码已具备，未标记 Verified Gate）：**Lesson Preparation Conversation 中受控、确定性的显式 Forget；唯一匹配立即 revoke，多 Scope/“全部”必须老师选择，后续新 Context 不再使用且历史 Run 保留；
- **M2C2（当前代码已具备，未标记 Verified Gate）：**Lesson Preparation 中受控、确定性的 current-conversation temporary override；WorkingMemory V2 封存 replace/suppress/clear，Pack V3 解释临时输入及 durable 覆盖，close/到期或新 Conversation 后失效，且不修改 Preference/epoch；
- **M3（未实现）：**编辑、采用、拒绝和局部重生成等最小化 Observation，先 shadow 评测，再形成待教师确认的 Candidate；
- **M4（未实现）：**scope 覆盖/冲突、经确认的 Episode/Procedural Habit；结构化过滤和全文检索优先；
- **M5（未实现）：**效果治理、导出/遗忘、redaction/tombstone 与批准的 retention 清理；只有评测证明结构化与全文检索不足时，才评估脱敏摘要的语义向量检索。

Candidate 在教师确认前不得进入正式 Context；M2B 只对明确命令的完整低风险 Catalog 项走 direct confirmation，冲突 Candidate 仍须教师显式处置。M2C1 的 revoke 不等于物理删除历史；M2C2 的临时状态固定 `eligibleForConsolidation=false`，不得作为 M3 习惯证据。至此 M2A–M2C2 的当前代码切片已齐备，但均未标记 Verified Gate；M3–M5 仍不得被当前表、界面文案或文档描述成已实现。

## 后续生产阶段：Gate 2.10B 云部署与小范围试点

Gate 2.10B 尚未开始。进入实施前需要产品所有者确认试点范围、云平台、Identity Provider、数据类别、供应商与运维责任。最小方向包括：

1. 正式 OIDC、域名、HTTPS、Cookie/Origin/CSRF 与反向代理边界；
2. 云 Secret 管理、轮换和最小权限；
3. 托管 PostgreSQL、独立 migration/app/worker role、备份与恢复演练；
4. ObjectStore Port 的云 Adapter、私有 bucket、tenant key、加密与 orphan cleanup；
5. 一次性 Migration job、发布锁、forward-fix 和升级库验证；
6. 结构化脱敏日志、指标、告警、trace correlation 和预算监控；
7. CSP、安全 Header、限流、依赖/镜像扫描和错误信息控制；
8. staging 远程 E2E、容量/延迟基线、故障降级和发布/回滚 Runbook；
9. 试点隐私、DPA、保留、访问、支持和事件响应流程。

完整 blocker/required 清单见 [部署就绪差距](operations/deployment-readiness-gaps.md)。该文档是规划输入，不是部署授权。

## Gate 2.10B 之后的候选方向

候选方向需要重新排序和独立 Gate，不因目录或已有 Mock 自动进入实施：

- 学生端真实身份、提交与反馈闭环；
- 家长端最小信息边界；
- 完整考试、题库和教师评测流程；
- 多模态文件理解、OCR 和受控文件入模；
- 第二模型 Provider、Provider routing 和故障切换；
- 更丰富但仍由教师控制的偏好类型与效果评估；Phase 7A 已完成持久化、确认 UI 和备课 Context 接入，不扩展学生画像；
- 更完整 school admin、邀请、MFA/SCIM 和治理 Worker。

## 明确不做的“捷径”

- 不把本地 Demo 直接暴露到公网；
- 不在 production 缺配置时回退 Local Identity、Mock Model 或 Demo bypass；
- 不用跨 Schema SQL 加速产品开发；
- 不合并或重写历史 Migration；
- 不在没有产品需求时预建插件、多 Agent 或永久 learner profile；
- 不把页面高保真或 synthetic 数据解释为真实试点完成。
