# Phase 8A-3 教学材料流程审计

## 审计结论

当前仓库已经具备可靠的 TeachingPlan DOCX 导出、FileAsset / FileVersion、对象存储、文件绑定、预览、下载和历史版本能力，但尚不存在可解释的 Material Bundle，也不存在 `material-generation` Skill。Teaching Workspace 目前把“课时关联了任意 active 文件”解释成“材料可用”，参考资料或普通上传也会让 Journey 提前进入课堂实施阶段，这是本阶段必须收口的读取语义。

本阶段可以在不新增表、不修改 45 个现有 Migration、不改变 TeachingPlan 生命周期的前提下完成：材料内容由版本化 Skill 生成 Draft，正式文件由 Artifact Application Service 写入既有 FileAsset / FileVersion，Material Bundle 只从 approved Revision、文件版本和绑定实时重建。

## 1. 当前文件生成流程

### 1.1 已批准 TeachingPlan DOCX

当前正式导出入口是 `PostgresFileArtifactService.exportApprovedTeachingPlan`：

1. 读取 TeachingPlan Revision 及 scope；
2. 只接受 `approved + current_approved` Revision，并校验 expected revision number；
3. 校验 Lesson 与可选 Preparation Task；
4. 读取 CourseRun、CurriculumUnit、Lesson 和可追溯 Evidence 摘要；
5. 通过确定性 `renderApprovedTeachingPlanDocx` 渲染 DOCX；
6. 先写 ObjectStore，再在 Artifact 事务内创建或更新 FileAsset / FileVersion；
7. 为 Lesson、TeachingPlan Artifact、TeachingPlan Revision 和可选 Task 建立 `export` binding；
8. 写入 `teaching_plan_file_export`、Audit、Outbox 和幂等结果；
9. 新 approved Revision 复用同一教案 FileAsset，创建新的 immutable FileVersion。

导出失败时会补偿 ObjectStore；重复请求由 idempotency reservation 和 revision/template 唯一性去重。普通上传不能为 `teaching_plan_export` 文件创建版本或关联，避免用户绕过正式导出链。

### 1.2 普通文件

普通文件支持：

- `.pdf`、常见图片、`.md`、`.txt`、`.docx`、`.pptx`、`.xlsx`；
- FileAsset / immutable FileVersion；
- Lesson、Preparation Task、TeachingPlan Artifact/Revision、Assignment/Version binding；
- 当前版本预览与任意历史版本下载；
- optimistic version、幂等、软删除/恢复和正式成果删除保护；
- LocalObjectStore 内容哈希、对象复用和孤儿补偿。

当前 Artifact Schema 只允许 `upload | teaching_plan_export` 两种 source。由于本阶段禁止 Migration，系统生成的材料继续作为“由 TeachingPlan 派生的导出成果”落入 `teaching_plan_export`，并用唯一材料类别、approved Revision binding 和生成 provenance 区分普通 DOCX 导出与材料 Draft。

## 2. 当前 Artifact 边界

| 能力 | 当前所有者 | 边界 |
|---|---|---|
| TeachingPlan / Revision | Artifact | Agent 不能批准；只有教师命令产生 current approved |
| FileAsset / FileVersion / Binding | Artifact | ObjectStore 只保存 bytes，不拥有文件生命周期 |
| DOCX 渲染 | Artifact application renderer | 只消费 approved Revision 和已授权读取结果 |
| ObjectStore | Capability Port / Adapter | 不写 Artifact 表，不决定采用或版本语义 |
| Skill / AgentRun / ContextManifest | Runtime / Skill Registry | 只能产生 Draft 和执行事实，不能写 File 表 |
| Lesson / Objective / Evidence | Education | Material Skill 只能消费 Facade 提供的授权快照 |
| TeacherPreference | Personalization | 只允许 current teacher / tenant 的 active confirmed preference |

现有 `PostgresFileArtifactService` 是跨模块资料收集与 Artifact 写入的 Composition Application Service。它已经封装对象写入补偿、文件授权、版本冲突、Audit 和绑定校验；Phase 8A-3 应复用该写入路径，而不是让 Skill、Web 或 Runtime Repository 直接写 FileAsset。

## 3. 已支持的材料能力

| 材料 | 当前支持程度 | 证据 |
|---|---|---|
| 教案 | REAL | current approved TeachingPlan → DOCX → FileAsset/FileVersion；新 approved Revision 生成新版本 |
| PPT 大纲 | NOT IMPLEMENTED | 仅支持上传/预览 `.pptx` 元数据，没有内容 Draft 生成 |
| 课堂练习 | PARTIAL | TeachingPlan 有 `independentCheck` / `followUp`，Assignment 有题目，但没有材料文件生成 |
| 板书设计 | NOT IMPLEMENTED | 无 Skill、无文件生成流程 |
| 分层支持材料 | PARTIAL | TeachingPlan 有 `supportStrategy`，没有可预览/下载的独立材料版本 |
| 材料包读取 | NOT IMPLEMENTED | 当前只有按 Lesson/Binding 的通用文件列表 |
| 单项重生成 | NOT IMPLEMENTED | 普通上传可建版本，系统管理成果只有 DOCX Revision 导出 |
| 教师采用 | NOT IMPLEMENTED | 没有材料 Draft / adopted 的读取语义 |

## 4. 当前 Skill 与 Runtime 能力

Built-in Registry 当前发布：

- `lesson-analysis@1`；
- `lesson-preparation@1`、`@2`、`@3`、`@4`。

Skill Manifest 已覆盖 input/output schema、PromptBundle、Context/Tool/Memory/Budget/Approval/Evaluation Policy 和 immutable content hash。`lesson-analysis@1` 展示了无需修改 Runtime Kernel 即可创建确定性 AgentRun、ContextManifest 和 Draft 的模式。

当前没有：

- `material-generation@1`；
- 材料输入/输出 Schema；
- approved Revision 专用 Context Policy；
- 材料完整性、来源和局部重生成 Evaluation；
- Material AgentRun 与 FileVersion 的 provenance 关联。

## 5. 当前 Teaching Workspace 与 Journey

Journey 已有 `materials` stage 和 `prepare_materials` action，但实现仍是占位：

```text
Lesson binding 下 activeFiles.length > 0
→ materials_available
→ deliver.ready
```

由此产生三个问题：

1. 普通参考文件会被误判为教学材料包；
2. 文件可能绑定旧 TeachingPlan Revision，却被当前 approved Revision 复用；
3. 页面无法说明缺的是教案、课件大纲、练习、板书还是分层支持。

`prepare_materials` 当前只跳转通用文件页，没有材料生成、局部调整、采用或版本历史入口。

## 6. 可复用的数据与 API

可直接复用：

- Lesson detail 与 `getLessonTeachingPlans`；
- `currentApproved` Revision 的结构化 TeachingPlan；
- Lesson Brief Snapshot 与教师 disposition；
- `getAuthorizedLessonEvidence`；
- active confirmed TeacherPreference；
- File list/detail/content/download；
- FileAsset/FileVersion/Binding Repository；
- LocalObjectStore；
- `LessonJourneyProjection` 纯读取规则；
- Session → ActingContext → tenant/actor 解析。

需要新增但无需 Migration：

- Material contracts 和小型读取/命令 API；
- `MaterialBundleProjection` 纯计算器；
- `material-generation@1`；
- Runtime Material generation Application Service 及 Artifact writer Port；
- Artifact system-managed material writer；
- Teaching Workspace `MaterialBundlePanel`；
- architecture、unit、PostgreSQL 和 Playwright 回归。

## 7. 无 approved TeachingPlan 的裁决

材料生成必须绑定 current approved TeachingPlan Revision。以下都不能作为 baseline：

- Lesson 本身；
- Lesson Brief Candidate；
- pending Proposal；
- draft 或 in-review TeachingPlan；
- 历史 approved Revision；
- 前端临时内容。

无 current approved Revision 时，Material Bundle 返回 `blocked_no_approved_plan`，生成命令返回结构化冲突。教师必须先完成：

```text
Lesson
→ Lesson Brief / Preparation Task
→ Proposal
→ in-review TeachingPlan Revision
→ 教师显式批准
→ Material Bundle
```

Phase 8A-2 已记录的“首版 TeachingPlan bootstrap”限制仍然存在；本阶段不会用空计划或样例内容掩盖它。

## 8. 风险与实施约束

- **无新表。** Bundle 只能从 current approved Revision、FileAsset、FileVersion 和 binding 重建。
- **旧 Migration 不动。** 当前基线为 45 个 SQL Migration，本阶段建立哈希基线并验证 diff 为零。
- **Skill 不写文件。** Skill 只返回 typed Content Draft；Artifact Application Service 才能存 bytes 和版本。
- **按 Revision 读取。** 旧 Revision 的文件保留历史，但不能满足新 current approved Revision 的材料齐备度。
- **局部重生成。** 只更新一个 material kind 对应的 FileAsset，创建新的 FileVersion；其他 item 的 asset/version 不变。
- **教师最终控制。** 生成结果先是 Draft；只有显式 adopt 才成为当前 Revision 的 adopted material。
- **不生成真实 PPTX。** `slide_outline` 首轮是可预览/下载的 Markdown 大纲，不伪装成 PowerPoint 文件。
- **跨校 fail closed。** Lesson、Revision、Evidence、Preference、File 查询都以 server ActingContext tenant/actor 为边界。

