# Phase 3 Application Service 边界收口报告

## 1. 结果摘要

Phase 3 在不改变产品行为的前提下，为 Agent 主链路、模型执行和身份上下文增加了稳定 Application Facade，并将具体 Model Provider、ObjectStore、Identity Provider 和 Ark Capability Probe 的构造/实现细节收回所属模块。

本阶段没有修改 API Contract、Web、数据库 Schema、43 个 Migration、Seed、事务顺序、授权规则、审批语义或业务状态机；没有创建 package、worker 或微服务。

## 2. 修改前依赖图

```text
Express app.ts
  -> ProductContainer inferred concrete type
     -> PostgresGate2TeacherCopilotService
     -> PostgresModelInvocationService
     -> PostgresIdentityOrganizationService

product-container.ts
  -> new VolcengineArkProvider / MockModelProvider
  -> new LocalObjectStore
  -> new OidcIdentityProvider / LocalIdentityProvider

ProviderCapabilityProbe (application)
  -> VolcengineArkProvider (infrastructure)

cross-module postgres services
  -> module A Repository
  -> module B Repository
  -> module C Repository
```

问题不是状态所有权已经失效，而是调用者依赖具体 PostgreSQL 类、Application 层认识具体 Adapter，以及 Product Composition Root 展开了 Adapter 构造细节。

## 3. 修改后依赖图

```text
Express / Worker
  -> TeacherCopilotApplicationFacade
  -> ModelInvocationApplicationFacade
  -> IdentityContextFacade
       |
       v
     existing PostgreSQL application implementations
       |
       +--> owning module repositories

product-container.ts
  -> createConfiguredModelProvider(settings)
  -> createConfiguredObjectStore(settings)
  -> createConfiguredIdentityProviders(settings)
       |
       v
     module infrastructure adapters

ModelInvocation application service
  -> createConfiguredProviderCapabilityProbe(ModelProvider)
       -> Ark-specific probe in capability infrastructure
```

正式状态仍由 governance、education、work、runtime、capability、artifact 和 personalization 七个 Schema owner 管理。Facade 不持有第二套状态，也不暴露 Repository、Pool、SQL row、OIDC token 或 OpenAI client。

## 4. 新增 Facade 与 Port

### 4.1 TeacherCopilotApplicationFacade

位置：`apps/api/src/modules/agent-runtime-context/application/teacher-copilot-facade.ts`

稳定调用面：

- `createTask`：Task/WorkingSet/AgentRun/Context/ModelExecution 入队；
- `disposition`：教师接受、修改、拒绝或延后 Proposal；
- `approveTeachingPlan`：教师显式批准 in-review revision。

`PostgresGate2TeacherCopilotService` 直接实现该接口，ProductContainer 对 HTTP 暴露接口类型。Task → AgentRun → ModelExecution → Proposal → Approval 的事务和状态逻辑未改。

### 4.2 ModelInvocationApplicationFacade

位置：`apps/api/src/modules/capability-integration/application/model-invocation-facade.ts`

稳定调用面覆盖 availability、capability、usage、create/detail/cancel/retry、Reflection generation 和 Worker `processExecution`。调用者不能接触 ModelProvider 或 Provider SDK。

### 4.3 IdentityContextFacade

位置：`apps/api/src/modules/identity-governance-audit/application/identity-context-facade.ts`

统一承载：

- Session → ActingContext；
- 受限测试身份和显式 demo bypass；
- CSRF；
- CourseRun/resource access；
- 安全事件；
- 活跃教师投影范围。

`ResolvedProductIdentity`、`ProductResourceRefs` 和 `SessionCreationResult` 从具体 PostgreSQL Service 中移到该边界。HTTP 不再为这些核心类型依赖具体实现文件。

### 4.4 LocalAuthenticationPort

位置：`apps/api/src/modules/identity-governance-audit/application/local-authentication-port.ts`

本地密码/验证码/测试 profile 通过受限 Port 暴露；`PostgresIdentityOrganizationService` 不再依赖 `LocalIdentityProvider` 具体类。Production fail-closed 行为不变。

## 5. Capability 集成隔离

新增模块工厂：

- `model-provider-factory.ts`：根据已验证设置构造 Ark 或 Mock Provider；
- `object-store-factory.ts`：构造 LocalObjectStore；
- `identity-provider-factory.ts`：构造 OIDC 或 Local Identity Provider；
- `createConfiguredProviderCapabilityProbe`：只为真实 `VolcengineArkProvider` 创建 Ark 专用 Probe。

`product-container.ts` 不再直接 import 或实例化：

- `VolcengineArkProvider`；
- `MockModelProvider`；
- `LocalObjectStore`；
- `OidcIdentityProvider`；
- `LocalIdentityProvider`。

Provider 选择仍由 Composition Root 根据配置驱动；生产 Ark 配置缺失、Strict Live、Mock fallback 等已有语义未改变。

Ark 专用 `ProviderCapabilityProbe` 从 application 移到 capability infrastructure。安全调用摘要类型保留在 application 的 `provider-capability.ts`，避免通用 Application 类型依赖 OpenAI-compatible Adapter。

`ModelBudgetConfig` 由 Application Policy 声明，配置 Adapter 依赖它；依赖方向从“policy → infrastructure config”改为“infrastructure config → policy type”。

## 6. Service 拆分情况

本阶段没有拆分或移动大型业务 Service 的方法实现。这是有意的风险控制：

- `PostgresModelInvocationService`、`PostgresGate2TeacherCopilotService` 等包含已验收的跨 Schema 事务顺序；
- 直接按文件归入某个模块会错误暗示该模块拥有其他 Schema；
- 本阶段先建立 Facade 和自动边界，后续只能按单个用例逐步把 owner-specific 操作收进 Port。

实际完成的低风险提取是：

- 三个 Application Facade；
- 一个 Local Authentication Port；
- 三个 Adapter factory；
- 一个 Ark Probe factory；
- Capability Probe 类型/实现分层。

## 7. 被禁止的依赖

新增架构测试强制：

1. `modules/*/application` 不 import infrastructure；
2. `app.ts` 不 import Repository、模块 infrastructure、OpenAI SDK 或写 SQL；
3. `product-container.ts` 不 import 具体 Model/ObjectStore/Identity Adapter，不查询 SQL；
4. `openai` 只由 `capability-integration/infrastructure/volcengine-ark-provider.ts` import；
5. Agent、Model 和 Identity 核心实现必须实现对应 Facade；
6. 当前十二个跨模块 Repository orchestrator 是登记债务，只能减少，不能新增同类文件；
7. Phase 2 的 sample-data/test-fixtures 产品依赖禁令继续有效；
8. 原七模块、Schema owner 和 Migration owner 测试继续有效。

## 8. Composition Root 收口

`product-container.ts` 现在只负责：

- 创建 app/worker Pool；
- 读取配置；
- 调用所属模块 factory 选择 Adapter；
- 创建和注入 Application Service；
- 连接 Outbox callback；
- 关闭进程资源。

它没有 Repository import、业务查询、授权判断、状态转换或 SQL。

需要明确：`apps/api/src/composition` 目录里仍有历史 `postgres-*-service.ts`。这些文件实质是跨模块 Application Service，不是 Composition Root。本阶段通过登记和 Facade 阻止继续扩张，未做高风险批量移动。

## 9. 验证结果

| 验证 | 结果 |
|---|---|
| TypeScript | 通过，5 个 workspace project |
| Unit / Gate 2 Vitest | 11 files，51 tests 通过 |
| Architecture | 11 files，67 tests 通过 |
| PostgreSQL | 17 files，96 tests 通过 |
| Playwright | 20/20 通过 |
| Production build | API/Web/contracts/sample-data/test-fixtures 全部通过 |
| Migration | 43 个在空隔离 Volume 执行成功；相对 Phase 2 内容无变化 |
| 测试隔离 | PostgreSQL Volume 和 ObjectStore 均为临时资源并已删除；开发数据未动 |
| `git diff --check` | 通过 |

Playwright 覆盖正式登录和学校隔离、备课/Proposal/TeachingPlan、文件、作业与 Evidence、工作台、课堂实施与 Reflection，证明 Facade/Factory 改动没有改变 API 或 UI 行为。

## 10. 剩余架构债务

### 高价值但需独立阶段

- 十二个登记的 composition Application Service 仍直接组合多个 owner Repository；
- `PostgresIdentityOrganizationService` 仍把 identity application 和 governance SQL adapter 合在一个类中；
- `PostgresModelInvocationService` 仍过大，混合队列生命周期、预算、上下文、调用、修复和产物落库；
- `app.ts` 仍是大型路由文件，虽然没有业务 Repository/SQL；
- 跨模块 transaction-aware Port 尚未覆盖所有既有用例。

### 不应在本阶段处理

- 将七模块拆成 package/微服务；
- 创建 Runtime Kernel、Skill Registry、Memory 或 Context 新模型；
- 合并/更名 Schema 或历史 Migration；
- 为目录整齐批量移动全部 Service；
- 修改 Contract、状态机或 UI。

## 11. 下一步建议

Platform Layer 现在有更稳定的入口，未来 Agent Runtime/Skill/Memory 工作可以依赖 Facade 和 owner Port，而不是直接认识 PostgreSQL Adapter。下一次边界演进应只选择一个完整用例（建议 ModelExecution 的“排队与执行”边界），先补 transaction-aware owner Port，再迁移实现并运行 PostgreSQL/Playwright 回归；不要同时重写所有大型 Service。

