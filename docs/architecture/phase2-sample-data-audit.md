# Phase 2 Sample Data 依赖审计

状态：基线审计  
审计基线：`bfb807508488f716293c64c2c6b98a3e9626f235`  
审计命令：`rg "@edu-agent/sample-data"`、`rg "sample-data"`、`rg "fixture"`、`rg "DEMO_"`、`rg "synthetic"`

## 结论

`@edu-agent/sample-data` 当前同时承担了三种职责：

1. 显式本地初始化数据；
2. 自动化测试的稳定匿名引用；
3. 产品运行时的默认资源与 Mock 输出目录。

前两类可以保留，第三类必须移除。当前 API package 将 `@edu-agent/sample-data` 声明为生产依赖，产品 Composition Root 暴露 Seed Service，七个 PostgreSQL 产品服务直接导入固定 Sample Ref 或 Sample 内容。未初始化数据库时，部分读取路径还会回退到固定 CourseRun、学校或教师，因此 Sample Data 尚未与正式运行路径分离。

## A. Seed 使用（允许，但必须迁出产品 Composition Root）

| 文件 | 当前用途 | 裁决 |
| --- | --- | --- |
| `apps/api/src/composition/gate2-demo-seed-cli.ts` | `sample:seed` CLI | 保留能力，迁入 `scripts/sample/` |
| `apps/api/src/composition/gate2-demo-seed-service.ts` | 将匿名课程、身份、作业、文件和反思写入 PostgreSQL | 保留能力，迁入 `scripts/sample/` |
| `apps/api/src/composition/gate2-7-demo-fixture.ts` | Gate 2.7 匿名 Enrollment 构造 | 仅 Seed 使用，随 Seed 迁移 |
| `apps/api/src/composition/gate2-5-demo-fixture.ts` | Gate 2.5 Seed 内容 | 仅 Seed 使用，随 Seed 边界处理 |
| `scripts/local/prepare.mjs` | 显式 `--sample-data` 时调用 Seed | 保留 |
| `scripts/local/run-app.mjs` | 显式 Sample 本地体验入口 | 保留 |
| `scripts/testing/run-e2e-app.mjs` | 隔离 E2E 数据库初始化 | 保留并改为调用脚本 Seed 入口 |
| 根 `package.json` 的 `sample:seed` | 稳定 Seed 命令 | 保留并改为 `scripts/sample/` 入口 |

问题：`product-container.ts` 当前 import `Gate2DemoSeedService` 并返回 `services.seed`。正式 Composition Root 因而依赖 Sample 初始化实现。Phase 2 应让显式 Seed 脚本自行组合 Seed Service，正式 API 容器不再包含 Seed。

## B. Test 使用（允许）

直接导入 `@edu-agent/sample-data` 的测试文件：

- `tests/gate2/contracts.test.ts`
- `tests/postgres/gate2-http.test.ts`
- `tests/postgres/gate2-teacher-copilot.test.ts`
- `tests/postgres/gate2-5-lesson-preparation.test.ts`
- `tests/postgres/gate2-5b-file-artifacts.test.ts`
- `tests/postgres/gate2-6a-model-invocation.test.ts`
- `tests/postgres/gate2-7-assignment-learning-evidence.test.ts`
- `tests/postgres/gate2-8-teacher-workbench.test.ts`
- `tests/postgres/gate2-9-classroom-reflection.test.ts`

测试配置中的解析入口：

- `vitest.config.ts`
- `tests/config/vitest-postgres.config.ts`
- `tests/config/vitest-live.config.ts`
- 根 `tsconfig.json`

这些测试可继续使用稳定匿名 Ref，但测试初始化应直接组合 Seed 工具，不能通过正式 `ProductContainer.services` 获得 Seed 能力。

`@edu-agent/test-fixtures` 未出现在 `apps/api/src`、`apps/web/src` 或产品 package dependencies 中，当前不存在 Test Fixture 进入产品运行路径的问题。

## C. Product Runtime 使用（禁止）

### package 和 Composition Root

| 文件 | 依赖 | 风险 |
| --- | --- | --- |
| `apps/api/package.json` | 将 `@edu-agent/sample-data` 声明为 production dependency | API 发布物携带 Sample package |
| `apps/api/src/composition/product-container.ts` | 构造并暴露 `Gate2DemoSeedService` | 正式容器拥有初始化能力 |

### 产品服务直接依赖

| 文件 | 当前使用 | 必须替换为 |
| --- | --- | --- |
| `postgres-gate2-read-service.ts` | 默认 CourseRun、默认学校名、默认教师名 | Session/ActingContext 与 Repository 查询；无数据返回空状态 |
| `postgres-lesson-preparation-service.ts` | 固定 `goalRef` | Task/请求中的 Goal，或 Repository 按业务上下文查询 |
| `postgres-assignment-learning-service.ts` | 调整下一课时固定 `goalRef` | Assignment/Lesson/Task 上下文中的 Goal |
| `postgres-gate2-teacher-copilot-service.ts` | 固定 CourseRun、固定 Sample 教案目录 | 请求/TaskWorkingSet/Repository；Mock Provider 自有确定性输出 |
| `postgres-file-artifact-service.ts` | 存在未使用的 Sample import | 删除 import；资源只来自请求与 Repository |
| `postgres-classroom-reflection-service.ts` | 存在未使用的 Sample import | 删除 import；资源只来自请求与 Repository |
| `postgres-teacher-workbench-service.ts` | 存在未使用的 Sample import | 删除 import；投影只来自正式业务表 |

补充：`postgres-model-invocation-service.ts` 调用 `getDemoCaseAndGoal`，但未直接导入 Sample Ref；方法命名遗留需要澄清，调用本身使用执行记录中的 `goalRef`，不是固定 Sample fallback。

## 固定 fallback 清单

审计发现的运行时固定 fallback：

- 未提供 CourseRun 时回退 `gate2DemoRefs.courseRunRef`；
- 读取模型缺少组织名称时回退 Sample 学校名；
- 读取模型缺少 Actor 显示名时回退 Sample 教师名；
- 创建 Lesson Preparation Task 时回退 `gate2DemoRefs.goalRef`；
- Assignment 调整下一课时回退 `gate2DemoRefs.goalRef`；
- Teacher Copilot 某读取路径固定使用 `gate2DemoRefs.courseRunRef`；
- Teacher Copilot 通过 `strategyTeachingPlans` 读取 Sample package 内的确定性 Mock 教案。

Phase 2 后这些 fallback 必须全部为零。

## 关键词审计说明

### `DEMO_`

文件级命中完整列表：

- `.env.example`
- `apps/api/src/app.ts`
- `apps/api/src/platform/auth/config.ts`
- `apps/api/src/platform/demo-identity.ts`
- `scripts/local/run-app.mjs`
- `scripts/testing/run-e2e-app.mjs`
- `scripts/testing/run-playwright-isolated.mjs`
- `tests/postgres/gate2-10a-identity-organization.test.ts`
- `tests/unit/demo-identity.test.ts`
- `tests/unit/identity-provider-config.test.ts`
- `docs/history/gates/gate-2-10a-identity-organization-foundation.md`
- `docs/history/gates/gate-2-4-copilot-correctness.md`
- `docs/operations/local-environment.md`

这些命中主要属于受控 Local/Demo Identity 开关和测试，不等于 Sample Data 运行依赖。本阶段不改变身份工作流；架构测试会继续保证 Demo Identity 不能在 production 开启。

### `fixture`

产品代码命中完整列表：

- `apps/api/src/app.ts`
- `apps/api/src/composition/gate2-5-demo-fixture.ts`
- `apps/api/src/composition/gate2-7-demo-fixture.ts`
- `apps/api/src/composition/gate2-demo-seed-service.ts`
- `apps/api/src/composition/postgres-gate1b-education-service.ts`
- `apps/api/src/composition/postgres-gate2-read-service.ts`
- `apps/api/src/composition/postgres-identity-organization-service.ts`
- `apps/api/src/modules/capability-integration/infrastructure/mock-model-provider.ts`
- `apps/web/src/presentation.ts`

其中 Gate 2 Seed Fixture 应迁出产品目录；Fake/Mock Provider 与测试 Fixture 仍是本地和测试基础设施；其余命中需按内容判断，不能仅凭名称删除。

### `synthetic`

`synthetic` 同时表达数据治理约束、匿名 Seed、Live Provider 安全数据和测试数据。它不是固定 Ref 的同义词，不能全局删除。产品代码文件级命中如下：

- `apps/api/src/app.ts`
- `apps/api/src/composition/gate2-7-demo-fixture.ts`
- `apps/api/src/composition/gate2-demo-seed-cli.ts`
- `apps/api/src/composition/gate2-demo-seed-service.ts`
- `apps/api/src/composition/local-copilot-outbox-worker.ts`
- `apps/api/src/composition/postgres-assignment-learning-service.ts`
- `apps/api/src/composition/postgres-classroom-reflection-service.ts`
- `apps/api/src/composition/postgres-file-artifact-service.ts`
- `apps/api/src/composition/postgres-gate1b-command-service.ts`
- `apps/api/src/composition/postgres-gate1b-education-service.ts`
- `apps/api/src/composition/postgres-gate2-read-service.ts`
- `apps/api/src/composition/postgres-gate2-teacher-copilot-service.ts`
- `apps/api/src/composition/postgres-identity-organization-service.ts`
- `apps/api/src/composition/postgres-lesson-preparation-service.ts`
- `apps/api/src/composition/postgres-model-invocation-service.ts`
- `apps/api/src/composition/postgres-teacher-workbench-service.ts`
- `apps/api/src/composition/provider-capability-probe-cli.ts`
- `apps/api/src/composition/synthetic-live-model-request.ts`
- `apps/api/src/modules/artifact-collaboration/infrastructure/postgres-gate2-artifact-repository.ts`
- `apps/api/src/modules/capability-integration/application/lesson-preparation-prompt-bundle.ts`
- `apps/api/src/modules/capability-integration/application/lesson-reflection-prompt-bundle.ts`
- `apps/api/src/modules/capability-integration/application/model-data-manifest.ts`
- `apps/api/src/modules/capability-integration/application/provider-capability-probe.ts`
- `apps/api/src/modules/capability-integration/application/safe-model-logging.ts`
- `apps/api/src/modules/capability-integration/infrastructure/mock-model-provider.ts`
- `apps/api/src/modules/capability-integration/infrastructure/volcengine-ark-provider.ts`
- `apps/api/src/modules/education-domain/domain/gate1b.ts`
- `apps/api/src/modules/education-domain/infrastructure/postgres-education-repository.ts`
- `apps/api/src/modules/education-domain/infrastructure/postgres-gate2-7-education-repository.ts`
- `apps/api/src/modules/identity-governance-audit/application/governance-service.ts`
- `apps/api/src/modules/identity-governance-audit/infrastructure/postgres-governance-repository.ts`
- `apps/api/src/modules/identity-governance-audit/infrastructure/schema.ts`
- `apps/web/src/api.ts`
- `apps/web/src/pages/AssignmentWorkspace.tsx`
- `packages/contracts/src/api-routes.ts`
- `packages/contracts/src/gate2.ts`
- `packages/contracts/src/gate2-6a.ts`
- `packages/contracts/src/gate2-7.ts`
- `packages/contracts/src/governance.ts`

Migration 中的 `synthetic` 列和约束属于已应用历史，本阶段不修改。Model Data Manifest 对合成数据的要求、Live Provider 的合成请求以及 Assignment 的匿名测试导入也不构成固定 Sample Ref fallback。

## 目标边界

```text
scripts/sample ──> @edu-agent/sample-data ──> PostgreSQL
tests          ──> @edu-agent/sample-data ──> 隔离测试数据库

apps/api product runtime ──> Session / ActingContext
                         ├──> Contracts request
                         ├──> Repository
                         └──> TaskWorkingSet / ContextManifest

apps/web ──> Contracts API（不导入 sample-data）
```

产品运行时不得从 Sample package 获得 tenant、actor、role、CourseRun、Lesson、Goal 或 Evidence；Sample Seed 完成后，所有页面和业务操作只读取 PostgreSQL 与正式 API。
