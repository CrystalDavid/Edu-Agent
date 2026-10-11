# Edu-Agent 模块边界规则

## 1. 适用范围

本规则适用于 `apps/api/src` 的七模块模块化单体。它定义状态所有权和依赖方向，不要求把七个模块拆成 workspace package 或微服务。

## 2. 状态所有权

| 模块 | Schema | 独占的正式状态 |
|---|---|---|
| Identity / Governance / Audit | `governance` | User、School/Organization、Membership、Role、Session、Authorization、Audit、安全事件、数据治理请求 |
| Education | `education` | CourseRun、Unit、Lesson、Objective、Enrollment、Assignment、Submission、GradeDecision、Evidence、LessonDelivery、Observation |
| Work / Durable Execution | `work` | Task/TaskRun、WorkingSet、Disposition、Todo、Calendar、Workbench Projection/Preference、Outbox effect |
| Agent Runtime / Context | `runtime` | AgentRun、RunManifest、AuthorizedContextPlan、ContextManifest |
| Capability / Integration | `capability` | ToolExecution、ModelExecution、BudgetDecision、Provider Capability Snapshot |
| Artifact / Collaboration | `artifact` | Artifact/Revision、Proposal、TeachingPlan lifecycle、FileAsset/FileVersion、Reflection |
| Personalization / Memory / Analytics | `personalization` | 仅保留已明确建模且获授权的 personalization 状态；当前没有长期 learner/teacher memory 真值 |

任何对象的正式状态只能由 owning module 的 Application Service/Repository 写入。读取聚合不获得写权限。

## 3. 允许的依赖方向

```text
HTTP / Worker / CLI
        |
        v
Application Facade / Use Case Port
        |
        +--> owning module application --> owning Repository
        |
        +--> explicit cross-module Application Port
        |
        +--> capability Port (ModelProvider / ObjectStore / Tool)

Composition Root --> factories + concrete implementations + configuration
```

规则：

1. `domain` 不依赖 `application`、`infrastructure`、HTTP 或 composition。
2. `application` 可以依赖自己的 `domain` 和声明的 Port；不得依赖其他模块的 `infrastructure`。
3. `infrastructure` 实现本模块 Port；不得直接写其他 Schema。
4. HTTP、Worker 和 CLI 只调用 Application Facade/Port，不直接调用 Repository。
5. 跨模块业务用例由明确的 orchestrating Application Service 协调；它通过 Application Port 调用 owner，不把 Repository 泄漏给调用者。
6. 跨模块只读投影可以组合多个 owner 的读取 Port；投影不能成为业务真值。
7. Composition Root 只读取配置、创建对象、选择实现和注入依赖，不查询业务数据、不做授权决定、不执行状态转换。

## 4. Repository 规则

- Repository 只属于声明它的模块。
- 模块 A 不得 import 模块 B 的 `infrastructure/*repository*`。
- Repository 方法不得返回数据库 client 给调用者。
- 跨模块事务必须由明确的 orchestration boundary 管理，并调用 owner 提供的 transaction-aware Port；不能以共享 `PoolClient` 为理由绕过 owner。
- 直接 SQL 只能位于 owning infrastructure adapter 或已登记的遗留 Application Service；不得新增到 Composition Root/HTTP。
- Schema owner、Migration owner 与 Repository owner 必须一致。

## 5. Application Facade 规则

Facade 是一个稳定的产品用例入口，不是万能 Service Locator。

- Facade 方法用业务动作命名，例如 `createTask`、`approveTeachingPlan`、`createInvocation`。
- 输入继续使用当前 Contract 或明确的内部 command；不得另造重复 DTO。
- Facade 不暴露 Repository、Pool、SDK client 或数据库 row 类型。
- Facade 不改变状态所有权：跨模块写入仍由各 owner 执行。
- Facade 的接口应足够小；读取、命令和后台处理可以分开。
- HTTP 和 Worker 应依赖 Facade 接口，具体 PostgreSQL 实现由 Composition Root 注入。

## 6. Agent 链路规则

主链路固定为：

```text
Task (work)
  -> AgentRun / AuthorizedContextPlan / ContextManifest (runtime)
  -> ModelExecution (capability)
  -> Proposal or Draft (artifact)
  -> teacher disposition / approval
  -> owning formal state (artifact/work/education)
```

- Runtime 不直接确认 TeachingPlan、GradeDecision、LessonDelivery、Observation 或 Reflection。
- Model Provider 只返回模型结果和 usage，不持久化正式业务对象。
- Agent 输出是 Proposal/Draft；教师确认动作由正式 Application Facade 执行。
- TaskWorkingSet/ContextManifest 是本次运行的授权快照，不是永久资源授权。
- retry/idempotency 不能创建重复 Proposal 或绕过审批。

## 7. Capability 集成规则

- OpenAI SDK 只允许存在于 `capability-integration/infrastructure`。
- 业务用例只依赖 `ModelProvider`、`ObjectStore` 或 Tool Port。
- Provider/ObjectStore 配置读取和 Adapter 构造由 capability 模块工厂封装；Composition Root 只选择并注入结果。
- 生产 Provider 失败不得静默回退 Mock。
- Web bundle 不得包含 SDK、API Key 或服务端 Provider 配置。

## 8. Identity Context 规则

- ActingContext 只能由验证过的服务端 Session、受限测试身份或显式 local/demo bypass 产生。
- 浏览器 payload/header 不能决定 tenant、actor、role 或 organization。
- Membership 和 CourseRun access 必须在每个受保护请求上重新验证到足够的新鲜程度。
- 业务模块接收已解析的 ActingContext/授权结果，不接收 OIDC token。
- Identity Provider Adapter 只证明外部身份；Edu-Agent governance 决定学校、Membership、Role 和资源访问。

## 9. HTTP 与 Composition Root 规则

HTTP 可以：

- 解析 Contract；
- 解析 Session/CSRF；
- 调用 Application Facade；
- 将领域错误映射为 HTTP 响应。

HTTP 不可以：

- import Repository 或 SDK Adapter；
- 拼写 SQL；
- 执行业务状态转换；
- 根据前端传入角色决定授权；
- 创建跨模块正式记录。

Composition Root 可以：

- 创建 Pool/Adapter/Service；
- 读取环境配置；
- 选择 Provider；
- 注入依赖；
- 管理进程级资源关闭。

Composition Root 不可以：

- 查询业务 Repository；
- 进行授权判断；
- 解释 Proposal 或状态；
- 执行 Agent workflow；
- 写正式业务状态。

## 10. 自动保护

架构测试至少锁定：

1. 模块不得 import 其他模块的 `infrastructure`；
2. `app.ts` 不得 import Repository、Provider Adapter 或直接 SQL；
3. `product-container.ts` 不得 import SDK client 或直接实例化具体 Provider/ObjectStore/Identity Adapter；
4. `openai` 只能由 capability infrastructure import；
5. Product code 不得依赖 sample-data/test-fixtures；
6. 43 个历史 Migration 的路径和 checksum 不变。

## 11. 例外与债务登记

当前 `composition/postgres-*-service.ts` 是历史形成的跨模块 Application Service。它们可继续存在，但属于显式债务：

- 不得新增同类大型文件；
- 新调用者应依赖 Facade 类型；
- 每次触及一个用例时，优先将 owner-specific 操作收进 owner Port；
- 迁移必须小步、保持事务和 Contract，并有 PostgreSQL/Playwright 回归；
- 未经独立设计不得把这些文件整体移动到某个单一模块。

