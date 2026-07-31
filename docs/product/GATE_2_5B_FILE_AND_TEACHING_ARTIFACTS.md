# Gate 2.5B — 文件与教学成果闭环

## 1. 目标与边界

Gate 2.5B 在 Gate 2.5 的 Lesson → Task → Proposal → approved TeachingPlan 闭环之上，增加一条最小、真实、可恢复的文件链路：

```text
approved TeachingPlan / Lesson
  → 上传参考资料或导出教案
  → FileAsset + immutable FileVersion
  → LocalObjectStore
  → Lesson / preparation Task / TeachingPlan Revision binding
  → 文件页、课时页和 TeachingPlan 页读取与下载
```

本 Gate 只解决文件安全保存、版本、关联和 approved TeachingPlan 的 DOCX 成果导出。不实现文件内容进入模型、多模态理解、OCR、分享协作、云 ObjectStore 或完整 Office 在线编辑。

## 2. 实施裁决

### 2.1 不新增第八模块

- `artifact-collaboration` 拥有 `FileAsset`、`FileVersion`、`ArtifactFileBinding`、软删除状态、版本历史、幂等记录和文件事件。
- `capability-integration` 提供 `ObjectStore` Port 和 `LocalObjectStore` Adapter；Adapter 只处理字节、object key、hash 和存储元数据，不拥有文件业务状态。
- Composition Root 负责授权、Artifact Repository、ObjectStore、DOCX Renderer 与 Education/Work 只读上下文的编排。
- Runtime、模型 Provider 和 React 均不能直接写文件正式状态。

### 2.2 文件真值与对象字节分离

`FileAsset` 是教师看到的逻辑文件；`FileVersion` 是不可变内容版本。数据库保存业务元数据与内部 object key，本地磁盘只保存内容字节。用户文件名从不成为物理路径。

开发根目录默认为：

```text
.demo/uploads/objects/
```

可由服务端 `LOCAL_OBJECT_STORE_ROOT` 覆盖。Playwright/PostgreSQL 测试为每次 run 使用独立临时根目录，并在结束后清理；任何测试都不得清空开发根目录。

### 2.3 approved Revision 才能形成正式教案成果

- DOCX 导出必须指定一个明确的 `approved` TeachingPlan Revision，禁止使用含混的 `latest`。
- draft / in_review 不生成正式成果；未来如需预览，应使用独立、带水印且不入正式 FileAsset 的流程。
- 同一 approved Revision + 导出格式 + 模板版本 + 幂等键只产生一个结果。
- 同一 TeachingPlan Artifact 的新 approved Revision 导出时，为既有教案 FileAsset 创建新 FileVersion；旧版本保留且可下载。

## 3. 领域对象与所有者

| 对象 | 所有者 | 关键语义 |
|---|---|---|
| `FileAsset` | Artifact | 教师可识别的逻辑文件；拥有分类、来源、当前版本指针与 active/deleted 状态 |
| `FileVersion` | Artifact | 不可变内容版本；保存 MIME、扩展名、大小、SHA-256、object key、摘要与创建信息 |
| `ArtifactFileBinding` | Artifact | 将具体 FileAsset/FileVersion 绑定到 Lesson、lesson-preparation Task、TeachingPlan Artifact/Revision |
| `FileOperationIdempotency` | Artifact | 文件命令的 payload 指纹和安全重放结果；同键异 payload 返回 409 |
| `ObjectStore` | Capability Port | `put/get/exists/metadata/delete` 及流式读写契约 |
| `LocalObjectStore` | Capability Adapter | 原子临时写入、hash、大小限制、路径隔离和本地恢复 |
| `TeachingPlanDocxRenderer` | Artifact application support | 只把已校验的 approved Revision 与课程上下文渲染为 DOCX 字节，不写数据库或对象存储 |

## 4. 数据模型

### `artifact.file_asset`

至少保存 tenant、asset ref、显示文件名、分类、来源、当前 version ref、状态、乐观锁版本、创建人和时间。软删除只改变 Asset 状态，不删除 FileVersion 或对象字节。

### `artifact.file_version`

至少保存 version ref、asset ref、递增版本号、原始文件名、规范扩展名、MIME、字节数、SHA-256、内部 object key、内容摘要、创建人和时间。记录一经插入不可更新或删除。

### `artifact.artifact_file_binding`

目标类型限定为 `lesson`、`preparation_task`、`teaching_plan_artifact`、`teaching_plan_revision`。正式 DOCX 同时绑定具体 approved Revision、TeachingPlan Artifact、Lesson 和关联 Task；参考资料按教师选择绑定 Lesson/Task。

不建立跨 Schema 外键；Composition Root 在写入前通过 owning Repository 验证 refs 和 tenant，Artifact 只保存外部 ref。

## 5. ObjectStore 与补偿

### 写入

1. 校验授权、文件名、扩展名、MIME、声明大小与上限。
2. `LocalObjectStore.put` 流式写入同根目录临时文件，同时计算 SHA-256 和实际大小。
3. `fsync` 后以随机/内容寻址 object key 原子 rename；用户文件名不进入路径。
4. 开启数据库事务，写 AuthorizationDecision、FileAsset/FileVersion/Binding、Outbox、Audit 和幂等结果。
5. 数据库提交失败时删除刚写入且无数据库引用的对象；补偿失败会写入 Git ignored 的安全 orphan 标记，并由显式 cleanup 扫描处理。

对象写入失败时不会创建数据库记录。数据库已成功提交后不进行物理删除，因此不会出现已提交 FileVersion 指向被补偿删除对象的情况。

### 删除与恢复

- 教师删除是 soft delete；下载和普通列表默认隐藏 deleted Asset。
- 被 TeachingPlan Revision 正式引用的文件仍可软删除，但不可物理清除；恢复只恢复 Asset 状态。
- 本 Gate 不提供教师物理 purge。Orphan cleanup 只清理没有数据库引用、超过安全宽限期的对象。

## 6. 文件安全策略

- 支持 PDF、PNG/JPEG/GIF/WebP、Markdown、TXT、DOCX、PPTX、XLSX。
- 扩展名与 MIME 必须匹配 allowlist；Office Open XML 使用明确 MIME。
- 默认最大文件大小 25 MiB，可由 `FILE_MAX_UPLOAD_BYTES` 在服务端配置。
- 拒绝空文件、NUL、路径分隔符、`..`、控制字符和过长文件名。
- object key 只允许服务端生成的安全段；所有解析后路径必须仍位于配置根目录内。
- 下载重新执行 tenant/actor 授权，并设置安全 `Content-Type`、`Content-Disposition`、`X-Content-Type-Options: nosniff`。
- HTML、脚本和可执行文件不在 allowlist；Markdown/TXT 预览按纯文本显示。

## 7. DOCX 教案映射

DOCX 使用 `compact_reference_guide` 设计 preset 与 `workshop_agenda` 首屏结构，模板版本固定并进入导出指纹。内容来自：

| 文档部分 | 数据来源 |
|---|---|
| 课程 / 单元 / 课时 | Education CourseRun / CurriculumUnit / Lesson |
| 教学目标 | Lesson learning objectives + TeachingPlan `objective` |
| 重点和难点 | `lessonFocus` 与 `supportStrategy` |
| 教学准备 | 已授权 EvidenceRef 摘要、课时信息和准备说明 |
| 教学流程 / 活动 | `openingActivity`、`teacherQuestions`、`studentActivity`、`independentCheck`、`followUp` |
| Evidence 依据摘要 | approved Revision 的 `evidenceRefs` 及 Education 的合成摘要 |
| 已知缺口 | 当前 Revision 未封存的证据缺口以明确未知项呈现，不虚构数据 |
| 追踪信息 | 生成时间、Revision ref/number、模板版本和“AI 辅助生成、教师已批准”说明 |

测试不仅检查 ZIP/扩展名，还会检查 OOXML 必要部件、正文关键字段和 Revision 追踪信息；最终样例使用仓库外渲染工具转换为逐页 PNG 进行视觉检查。

## 8. API 与 Contracts

所有路径和 Zod DTO 位于 `packages/contracts`：

- list/get FileAsset；
- upload FileAsset；
- create FileVersion；
- get version history；
- download/inline content；
- soft delete / restore；
- add/list Lesson、Task、TeachingPlan bindings；
- list files by target；
- export explicit approved TeachingPlan Revision to DOCX；
- orphan cleanup 仅为受控本地维护入口，不暴露给普通教师 UI。

二进制响应本身不是 JSON DTO；其授权请求、元数据响应和路由仍由 Contracts 定义。React 不手写散落 `/api/...` URL。

## 9. 权限、幂等、审计与事件

正式写入链：

```text
ActingContext
  → ActionIntent
  → AuthorizationDecision
  → FileArtifactApplicationService
  → ObjectStore put + Artifact transaction / compensation
  → Outbox
  → Audit
```

下载也先验证 tenant 和 actor。文件命令使用 Artifact-owned 幂等记录；相同 key 和相同 payload 返回原结果，相同 key 不同 payload fail closed。事件包括 `FileAssetCreated`、`FileVersionCreated`、`FileAssetSoftDeleted`、`FileAssetRestored`、`TeachingPlanDocxExported`；现有本地 Worker 只做幂等消费记录，业务事实均同步提交，不声称 exactly-once。

## 10. 页面接入

- 文件页：真实列表、搜索、分类、排序、上传、下载、详情、版本、软删除、恢复与关联信息；分享、协作、新建在线文档明确 disabled。
- Lesson：显示关联参考资料与 approved TeachingPlan DOCX，并可进入文件页/下载。
- TeachingPlan：对明确 approved Revision 提供“导出教案 DOCX”、查看导出历史和下载；批准与导出保持两个动作。
- 概览：最近教学文件与最近导出成果来自 PostgreSQL。

视觉框架、一级路由、侧边栏、字体、Design Token 和卡片体系保持冻结。

## 11. Migration 与前向修复

新增 Artifact owner 的前向 Migration；不改写任何已应用 Migration。迁移注册在 `apps/api/src/database/migrations.ts`，由 Artifact owner 执行并记录 checksum，应用仍使用非超级用户角色。

Gate 2.6A 以前数据库没有文件表，无需数据回填。若历史磁盘已有 `.demo/uploads` 内容，它们不会被自动认作正式文件；只有经过受控导入命令创建完整 FileAsset/FileVersion 后才成为业务数据，避免把未知本地文件静默纳入系统。

## 12. 验收范围

自动化覆盖 ObjectStore 路径安全、流式 hash/大小、MIME、上传下载、版本、幂等、软删除/恢复、引用保护、补偿、orphan cleanup、tenant 隔离、Lesson/Task/TeachingPlan 绑定、approved DOCX 导出、重复导出、新 approved Revision 新版本、服务重启恢复和 E2E 目录隔离。

Playwright 验证导出、文件页出现、下载、Lesson 关联、版本历史、参考资料上传、重启恢复与删除保护；所有既有 Gate 测试继续离线运行。

## 13. 非目标

本 Gate 不实现图片/PDF 内容理解、OCR、多模态上下文、上传文件进入 Ark、云 ObjectStore、文件分享与多人协作、在线 Office 编辑、完整 PPT 设计、作业/考试/学生闭环、日历、云部署、第二模型或多供应商。
