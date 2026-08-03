# Phase 3 Application Service 边界审计

## 1. 审计范围与结论

本审计以 `apps/api/src`、43 个已应用 Migration、当前 PostgreSQL Repository 和产品 Composition Root 为事实来源。审计只读取代码，没有修改 API、Schema、Migration、UI、Seed 或业务状态机。

当前实现仍是可维护的七模块模块化单体，Schema 所有权基本稳定；主要架构债务不在模块内部，而在 `apps/api/src/composition`：该目录同时承载对象装配和大量跨模块 Application Service。真正的 Composition Root `product-container.ts` 没有 SQL 或业务状态转换，但它直接认识具体 Provider Adapter；多个 `postgres-*-service.ts` 则直接组合多个模块的 Repository，边界只能靠约定维持。

本阶段不大规模搬迁这些成熟服务。优先收口三个高价值入口：

1. Agent/备课链路对外暴露明确的 Application Facade，而不是让 HTTP 层依赖具体 PostgreSQL 类；
2. Model Provider、ObjectStore 和 Identity Provider 的具体 Adapter 由所属模块工厂封装；
3. 用架构测试禁止模块间基础设施穿透、HTTP 直接使用 Repository，以及 Product Composition Root 直接实例化 SDK Adapter。

## 2. 当前目录职责

| 目录 | 当前职责 | 判定 |
|---|---|---|
| `modules/*/domain` | 领域记录、状态和值对象 | 正确，继续由模块拥有 |
| `modules/*/application` | 早期 Application Service、Port、校验与渲染 | 正确但覆盖不完整 |
| `modules/*/infrastructure` | PostgreSQL/In-memory Repository、Provider Adapter、Migration | 正确；不得被其他模块直接引用 |
| `composition/product-container.ts` | 创建连接池、读取配置、选择 Provider、装配服务和 Worker | 基本符合 Composition Root，但直接依赖具体 Adapter |
| `composition/postgres-*-service.ts` | 跨模块业务用例、事务、授权、幂等、审计和读取聚合 | 实质是 Application Service，不是纯 Composition Root |
| `app.ts` | Express 中间件、会话解析、Contract 解析、路由分派和错误映射 | 没有 Repository import；文件过大但本阶段不拆 HTTP |
| `platform` | PostgreSQL、错误、认证配置和系统元数据 | 技术平台边界，保持稳定 |

## 3. 七模块地图

### 3.1 Identity / Governance / Audit

- 模块：`identity-governance-audit`
- Schema：`governance`
- 正式状态：User、External Identity、Organization、Membership、Role、CourseRun access、Session、OIDC login state、Invitation、AuthorizationDecision、Audit、SecurityEvent、DataGovernanceRequest、ModelDataManifest。
- 主要表：`user_account`、`external_identity_link`、`organization`、`organization_membership`、`membership_role_assignment`、`membership_course_run_access`、`authentication_session`、`oidc_login_state`、`organization_invitation`、`authorization_decision`、`audit_record`、`security_event`、`data_governance_request`、`model_data_manifest`。
- Repository：`PostgresGovernanceRepository`、`PostgresGate2GovernanceRepository`。
- Application：`GovernanceService`；正式身份/学校/会话用例当前由 `PostgresIdentityOrganizationService` 实现。
- 发现：身份服务只写 governance，但为资源授权会读取 education、artifact 和 work。读取是必要策略输入，写入仍需保持单一所有者。

### 3.2 Education

- 模块：`education-domain`
- Schema：`education`
- 正式状态：CourseRun、CurriculumUnit、Lesson、LearningObjective、Enrollment、Assignment/Version/Item、Submission/Attempt、GradeDecision、Evidence、LessonDelivery、Observation、ObservedPedagogicalMove、InstructionalDecision。
- 主要表：`course_run`、`curriculum_unit`、`lesson`、`learning_objective`、`course_run_enrollment`、`assignment*`、`submission*`、`teacher_grade_decision`、`evidence_*`、`lesson_delivery*`、`classroom_observation*`。
- Repository：`PostgresEducationRepository` 及 Gate 2.5/2.7/2.9 前向扩展 Repository。
- Application：当前模块仅有 `EducationReadProjectionPort`；作业、课堂实施和课时用例位于 composition services。

### 3.3 Work / Durable Execution

- 模块：`work-assistant-durable-execution`
- Schema：`work`
- 正式状态：Task、TaskRun、WorkingSet、SuggestionDisposition、Preparation 状态、Grading Task、TeacherTodo、CalendarEvent、Workbench Projection/Preference、Reflection Follow-up link、Outbox effect 和幂等记录。
- 主要表：`task`、`task_run`、`task_working_set*`、`suggestion_disposition`、`lesson_preparation_task_details`、`teacher_todo`、`calendar_event`、`teacher_work_projection`、`teacher_work_preference`、`reflection_follow_up_link`。
- Repository：`PostgresWorkRepository` 及 Gate 2/2.5/2.7/2.8/2.9 扩展 Repository。
- Application：`WalkingSkeletonService`；正式备课、工作台和 follow-up 用例位于 composition services。

### 3.4 Agent Runtime / Context

- 模块：`agent-runtime-context`
- Schema：`runtime`
- 正式状态：AgentRun、RunManifest、AuthorizedContextPlan、ContextManifest、Runtime Outbox。
- 主要表：`agent_run`、`run_manifest`、`authorized_context_plan`、`context_manifest`、`outbox_record`。
- Repository：`PostgresRuntimeRepository`、`PostgresGate2RuntimeRepository`。
- Application：`RuntimeService` 和 `CapabilityExecutionPort`。
- 发现：当前 Agent 主链路由 Teacher Copilot、Lesson Preparation 和 Model Invocation 三个 composition services 共同编排；状态所有权没有丢失，但调用面缺少稳定 Facade。

### 3.5 Capability / Integration

- 模块：`capability-integration`
- Schema：`capability`
- 正式状态：ToolExecution、ModelExecution/Event、BudgetDecision、ProviderCapabilitySnapshot。
- 主要表：`tool_execution`、`model_execution`、`model_execution_event`、`model_budget_decision`、`provider_capability_snapshot`。
- Repository：`PostgresCapabilityRepository`、`PostgresGate2CapabilityRepository`、`PostgresModelExecutionRepository`。
- Application：PromptBundle、预算、DataManifest、输出校验、Capability Probe、安全日志。
- Adapter：`VolcengineArkProvider`、`MockModelProvider`、`LocalObjectStore`。
- 发现：业务服务通过 `ModelProvider`/`ObjectStore` Port 调用能力，未直接调用 OpenAI SDK；但 Product Composition Root 直接实例化具体 Adapter，隔离仍可加强。

### 3.6 Artifact / Collaboration

- 模块：`artifact-collaboration`
- Schema：`artifact`
- 正式状态：Artifact/Revision、Proposal、TeachingPlan lifecycle、FileAsset/FileVersion/Binding、TeachingPlan Export、LessonReflection/Event。
- 主要表：`artifact`、`artifact_revision`、`teaching_plan_scope_*`、`file_asset`、`file_version`、`artifact_file_binding`、`teaching_plan_file_export`、`lesson_reflection_*`。
- Repository：Artifact、Gate 2、File 和 Gate 2.9 Repository。
- Application：`ArtifactService`、DOCX renderer、Office summary。
- 发现：文件和 TeachingPlan 跨模块用例位于 composition services，但正式写入仍经 Artifact Repository。

### 3.7 Personalization / Memory / Analytics

- 模块：`personalization-memory-analytics`
- Schema：`personalization`
- 正式状态：当前只有 Schema/Port 骨架，没有长期 learner/teacher memory 真值。
- Repository：无 PostgreSQL Repository。
- Application：`PersonalizationCandidateSink`。
- 发现：保持空骨架优于提前创建未验证的 Memory/Skill 结构；本阶段不扩展。

## 4. 跨模块服务热点

下表中的“模块数”按源码直接 import 的模块基础设施统计；“Repository 数”是不同 Repository 类型的静态计数。

| Service | 行数 | 模块数 | Repository 数 | 主要职责 |
|---|---:|---:|---:|---|
| `postgres-model-invocation-service.ts` | 3648 | 6 | 13 | ModelExecution、上下文、模型调用、校验、Proposal/Reflection 草稿 |
| `postgres-assignment-learning-service.ts` | 1910 | 3 | 6 | 作业、提交、批改、Evidence、调整下一课 |
| `postgres-gate2-teacher-copilot-service.ts` | 1841 | 6 | 10 | Task → AgentRun → Proposal → TeachingPlan approval |
| `postgres-teacher-workbench-service.ts` | 1773 | 2 | 2 | Todo、Calendar、业务投影与偏好 |
| `postgres-identity-organization-service.ts` | 1723 | 1 | 0 | 会话、身份、学校、成员、授权；直接访问 governance SQL |
| `postgres-classroom-reflection-service.ts` | 1320 | 4 | 6 | Delivery、Observation、Reflection、Follow-up |
| `postgres-lesson-preparation-service.ts` | 1157 | 5 | 7 | 课时读取、备课 Task、WorkingSet 和状态转换 |
| `postgres-file-artifact-service.ts` | 1096 | 5 | 7 | FileAsset、ObjectStore、绑定、DOCX export |
| `postgres-gate2-read-service.ts` | 866 | 6 | 8 | 跨模块只读聚合 |

这些类当前同时承担事务边界、授权调用、幂等、跨模块顺序和结果组装。直接把它们移动进单个领域模块会错误地赋予该模块跨 Schema 所有权，因此本阶段只建立外部 Application Facade 和适配器工厂，不机械搬目录。

## 5. Agent 主链路现状

```text
HTTP / Contract
  -> PostgresGate2TeacherCopilotService.createTask
     -> governance authorization/idempotency/audit
     -> work Task + TaskWorkingSet
     -> runtime AgentRun + AuthorizedContextPlan + ContextManifest
     -> capability ModelExecution queued
  -> LocalCopilotOutboxWorker
     -> PostgresModelInvocationService.processExecution
        -> ModelProvider
        -> validation / repair
        -> artifact Proposal or Reflection Draft
  -> teacher disposition / TeachingPlan approval
     -> artifact lifecycle
     -> work preparation state
     -> audit / outbox
```

状态仍由 owning Repository 写入，但 HTTP、Worker 和其他服务看到的是具体 PostgreSQL 类。缺少的不是新的领域对象，而是稳定、最小的 Application Port。

## 6. 具体问题与风险

### P1：Composition 目录语义混杂

`product-container.ts` 是 Composition Root；`postgres-*-service.ts` 是产品 Application Service。两类文件同目录导致开发者容易把业务规则继续堆进装配层。短期以规则和 Facade 隔离，长期再按用例归位，不能一次性移动十余个大型文件。

### P1：跨模块基础设施依赖缺少自动保护

模块内部当前没有发现跨模块 Repository import，这是好现状；但没有测试阻止未来出现 `education -> artifact/infrastructure` 之类的穿透。

### P1：HTTP 依赖具体服务类

`app.ts` 没有直接 import Repository，但通过 `ProductContainer` 获得具体 PostgreSQL Service。具体实现名和公共调用面耦合，未来替换运行时或测试双实现成本高。

### P2：Capability/Identity Adapter 在 Composition Root 中展开

`product-container.ts` 直接认识 `VolcengineArkProvider`、`MockModelProvider`、`LocalObjectStore`、`OidcIdentityProvider` 和 `LocalIdentityProvider`。选择配置属于 Composition Root，但 Adapter 构造细节应由所属模块工厂封装。

### P2：大型应用服务难以局部理解

多个文件超过 1000 行，`app.ts` 超过 3000 行。它们应按稳定用例逐步拆分，而不是以文件长度为理由机械拆分。本阶段只给未来拆分建立依赖方向，不改变 API 或流程。

### P2：Identity Service 直接 SQL

Identity 服务只写 governance，但把 Application Service 和 PostgreSQL Adapter 混在一个类中。改为 Repository-backed service 需要独立阶段和完整权限回归，本阶段记录而不改写。

## 7. 本阶段安全改动边界

本阶段允许：

- 新增纯 TypeScript Application Facade/Port；
- 让 ProductContainer 和 HTTP 依赖 Facade 类型；
- 在 capability/identity 模块新增 Adapter factory，保持配置选择与实例化可测试；
- 新增架构测试，锁定已存在的正确边界；
- 文档化仍存在的 composition service 债务。

本阶段不做：

- 修改任何 Migration、表、SQL wire format 或 Contract；
- 移动大型 service/repository；
- 改变事务、授权、幂等、审批或状态转换；
- 创建新 package/worker；
- 改 Runtime、Skill、Memory、Context 算法；
- 修改 Web。

## 8. 审计基线

- 分支基线：`codex/phase2-sample-data-boundary`
- 基线 Commit：`ee913ec27cbe49601a7cb2cc9f338a39310873c7`
- Migration：43 个，Phase 3 必须保持内容不变
- Product runtime：不依赖 `@edu-agent/sample-data` 或 `@edu-agent/test-fixtures`
- HTTP Repository import：0
- 模块间直接 infrastructure import：0

