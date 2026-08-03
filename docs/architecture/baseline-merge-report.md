# Edu-Agent 基线合并分析报告

> 状态：架构决策草案
> 分析日期：2026-08-03
> GitHub 已验证基线：`ebb9ed3c28a83731ebcb9bcf06c6c6ae12622f1b`（`codex/fix-login-demo-auth`）
> 当前本地版本：`b9e43cb15b9d4be84235c1313933145a390bdc7e`（`codex/teacher-delivery-experience`）
> 范围：只分析，不移动目录、不修改业务代码、不改写历史 Migration。

## 1. 结论先行

新的长期维护基线不应简单回退到 `ebb9ed3`，也不应原样接受当前目录结构。推荐合并方式是：

1. 保留 `ebb9ed3` 的标准 pnpm monorepo 骨架：`apps/`、`packages/`、`infra/`、`scripts/`、`tests/`、`docs/`。
2. 保留当前版本已经验证的教师交付体验：登录呈现、教师侧边栏、单元优先课程视图、课时完成度、文件预览、真实 Agent 任务入口、失效交互清理和增强测试。
3. 保留当前 `scripts/local`、`scripts/testing`、`scripts/quality` 的职责拆分。
4. 撤销“环境目录承载 workspace package”的设计：`environments/sample-data` 应回到 `packages/sample-data`。
5. 本地 PostgreSQL 编排应归入 `infra/local/postgres`，而不是形成独立的 `environments/local` 架构层。
6. 当前 `deploy/` 只有占位说明，没有可部署资产；在真实部署实现出现前应移入运维文档，根目录不保留空壳部署层。
7. 不能只移动样例数据包：必须进一步切断正式应用服务对固定样例 Ref 的依赖。样例包应服务 Seed 和测试，不应成为产品运行时的业务真值来源。

因此，推荐的合并基线是“稳定 monorepo 骨架 + 当前有效产品改进 - 不合理目录变化 - 产品服务对样例数据的耦合”。

## 2. 分析方法与事实范围

本报告使用以下仓库事实进行核对：

- `git status`、当前分支及远程跟踪关系；
- `git log` 和 `ebb9ed3..HEAD` 提交范围；
- `git diff --stat`、`--name-status` 和逐文件差异；
- baseline 与当前版本的根目录、workspace、package manifest、脚本和目录树；
- API、Web、测试、Migration、Contracts 的引用关系；
- 当前模块、Composition Root 和大型应用服务的实际代码位置。

分析开始时工作区 clean，本地 `codex/teacher-delivery-experience` 与其远程跟踪分支一致。`git diff` 对工作区为空；本报告讨论的差异是 `ebb9ed3..b9e43cb` 的已提交差异。

当前版本相对 baseline 只有一个提交：

```text
b9e43cb refactor: prepare teacher workspace for delivery
ebb9ed3 fix: restore and redesign local teacher login
```

该提交共影响 128 个文件，约 1,997 行新增、2,640 行删除。43 个历史 Migration 均未修改；`packages/contracts` 没有发生契约变更；测试文件集合没有扩张，但多个既有测试的断言被加强。

## 3. GitHub baseline 分析

### 3.1 根目录

`ebb9ed3` 的根目录是标准 pnpm monorepo：

```text
Edu-Agent/
├── apps/
├── packages/
├── infra/
├── scripts/
├── tests/
├── docs/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig*.json
├── vitest.config.ts
├── playwright.config.ts
├── drizzle.config.ts
├── README.md
├── AGENTS.md
├── CHANGELOG.md
├── CONTRIBUTING.md
└── SECURITY.md
```

这套根目录能够直接回答四个问题：产品在哪里、共享边界在哪里、运行基础设施在哪里、如何验证。它值得作为长期骨架保留。

### 3.2 `apps/`

- `apps/api`：Node.js / TypeScript API、七模块实现、Composition Root、Worker 和 PostgreSQL Adapter。
- `apps/web`：React 教师门户、正式 API Client、路由和页面。

二者是可部署应用，不应被拆成大量 package，也不应被 `environments/` 包裹。

### 3.3 `packages/`

baseline 包含：

- `packages/contracts`：Web 与 API 共享的 Zod DTO、路由和稳定协议。
- `packages/demo-fixtures`：合成演示数据和稳定 Ref。
- `packages/test-fixtures`：测试专用构造器、Fake 和测试数据。

`packages/contracts` 是真实的跨进程边界，必须保留。`demo-fixtures` 的名称已经不合适，但“它是 workspace package”这一物理事实是正确的；问题在于正式 API 服务也直接消费固定演示数据。

### 3.4 `scripts/`

baseline 将本地启动、PostgreSQL、Secret Scan、Bundle 分析和测试编排集中在 `scripts/`。这是正确的工具边界，但 `scripts/demo` 同时混合了本地生命周期、测试基础设施和质量检查，职责不够清晰。

### 3.5 `infra/`

baseline 的 `infra/docker` 和 `infra/postgres` 承载本地容器、Schema owner/grant 和数据库基础设施说明。这类文件属于基础设施，不属于产品代码，也不应被称为“环境产品层”。

### 3.6 `tests/`

`tests/` 集中承载 architecture、static、unit、HTTP、PGlite、PostgreSQL、Playwright 和 Live Provider 验证。跨 workspace 的测试放在根 `tests/` 是合理的；应用内部的近距离测试仍可随源码放置，但当前不需要为了形式重排。

### 3.7 `docs/`

baseline 已建立当前文档、Gate 历史、ADR、开发、验证和运维入口。文档需要持续去重，但不应把历史 Gate 文档与当前事实混合，也不应为目录美观大规模移动仍被链接的文档。

### 3.8 pnpm workspace 与依赖边界

baseline workspace 只匹配：

```yaml
packages:
  - apps/*
  - packages/*
```

这是清晰且低成本的边界。应用依赖共享 package，共享 package 不反向依赖应用。需要保留的核心依赖原则是：

- Web 只能通过 `packages/contracts` 共享协议，不能 import API 实现；
- 领域模块不能依赖 Web、SDK 或具体 Provider；
- OpenAI SDK 只在服务端 Capability/Integration Adapter；
- 测试 Fixture 不进入浏览器 bundle；
- PostgreSQL Adapter 只实现所属模块的 Repository Port。

### 3.9 baseline 的目录分类

#### A. 核心架构

- `apps/api`
- `apps/web`
- `packages/contracts`
- `infra/postgres`
- `tests`
- `docs`
- workspace、lockfile 和根配置

#### B. 工具辅助

- `scripts`
- `packages/demo-fixtures`
- `packages/test-fixtures`
- `infra/docker`
- Playwright、Vitest、Drizzle 配置

工具辅助不等于可以随意放置；它们仍需要稳定边界和明确命名。

#### C. 值得保留的设计

- 两个部署应用 + 少量共享 package；
- `packages/contracts` 作为唯一共享协议入口；
- 七个 PostgreSQL Schema 的 owner/grant 与前向 Migration；
- Product Composition Root 与 Test Composition Root 分离；
- Repository Port 与 PostgreSQL Adapter；
- Outbox、Consumer Effect、租约和 Audit；
- 自动化测试使用隔离数据库和 ObjectStore；
- 本地运行数据默认 Git ignored；
- 根 package scripts 作为稳定命令入口。

## 4. 当前本地版本变化分类

### 4.1 A 类：业务功能和业务呈现增强

当前提交没有新增数据库表或 API Contract，主要是把既有能力从“工程验收界面”收口为“教师可以直接使用和展示的界面”。

- 登录页移除教师不需要理解的本地、Token、tenant 等技术说明；
- 教师身份移到侧边栏顶部，头像和工作空间信息更符合真实产品；
- Agent 首页不再使用 `sessionStorage` 伪造会话或生成本地假回复，改为读取真实备课任务并进入真实流程；
- 教学页改为单元优先、按需展开课时；
- 课时详情优先显示已完成内容、待补内容、教学目标和重点难点；
- 教学文件支持真实预览并跳转文件管理页；
- 考试功能明确禁用，不再用只读示例冒充已实现功能；
- Runs、设置、学生、概览和 Copilot 页面减少技术 Ref 和演示术语泄漏。

这些变化应保留。

### 4.2 B 类：UI 与交互优化

- 重做侧边栏图标、对齐、圆角和选中态；
- 删除重复的底部教师身份区；
- 统一教师可理解的中文状态文案；
- 删除假成功 Toast、死按钮和不具备产品行为的卡片；
- 新增 `presentation.ts`，集中展示层格式化逻辑；
- 删除未路由的 `AgentComponents.tsx`、`TeachingComponents.tsx` 和旧 `teacher-portal-data.ts`；
- 增强 Playwright 对真实业务结果和教师可见语言的断言。

这些变化总体应保留。大型页面仍需要后续按业务场景低风险拆分，但不应在本次基线合并中机械重写。

### 4.3 C 类：架构变化

- 新增 `environments/`；
- 新增仅含占位说明的 `deploy/`；
- `packages/demo-fixtures` 移到 `environments/sample-data`；
- `infra/docker` 移到 `environments/local/postgres`；
- workspace 新增 `environments/*`；
- `scripts/demo` 拆分为 `scripts/local`、`scripts/testing`、`scripts/quality`；
- 根命令从 `demo:*` 收口为 `app:*`、`sample:*` 等更产品化名称；
- 本地运行目录从 `.demo` 调整为 `.local-data`。

这些变化不能一概保留或回退：脚本职责拆分和运行目录命名是改进；`environments` 和空壳 `deploy` 则增加了错误的顶层概念。

### 4.4 D 类：临时产物

本次提交没有把 `.env.local`、数据库、上传文件、构建产物或 Playwright 输出加入 Git。下列内容仍应保持本地 ignored：

- `.env.local`；
- `.local-data/` 运行数据；
- 本地 PostgreSQL Volume；
- 本地 ObjectStore；
- `node_modules/`；
- workspace `dist/`；
- Playwright / Vitest 输出、截图和临时报告；
- Live model 安全报告；
- IDE 和个人分析资料。

## 5. 逐项差异裁决

| 变化 | 类型 | 是否保留 | 原因 |
|---|---|---:|---|
| 登录呈现增强 | 功能/UI | 保留 | 登录能力已在 baseline 实现；当前版本去除了教师无关技术说明，产品表达更正确。 |
| 教师身份置于侧边栏顶部 | UI | 保留 | 消除重复身份区，学校和当前教师上下文更清晰。 |
| 单元优先课程视图 | 功能/UI | 保留 | 更符合教师从单元进入课时的工作方式。 |
| 课时完成度与待补项 | 功能/UI | 保留 | 将正式 API 状态转换为教师下一步行动。 |
| 文件真实预览与文件页跳转 | 功能 | 保留 | 复用已有 FileAsset/FileVersion API，不是前端假数据。 |
| Agent 首页读取真实任务 | 功能 | 保留 | 删除 sessionStorage 业务副本和假回复，恢复 PostgreSQL 单一真值。 |
| 考试明确禁用 | 产品正确性 | 保留 | 未实现功能不再用假页面冒充。 |
| 删除三个零路由旧文件 | 清理 | 保留删除 | 已通过 import、路由、测试和构建引用核对，有现有页面替代。 |
| 教师可见技术/演示术语清理 | UI | 保留 | 技术诊断仍在工程页面，普通教师页面不应暴露。 |
| 测试断言增强 | 测试 | 保留 | 约束“不显示合成/本地演示/技术实现”和真实页面流程。 |
| `scripts/local` | 工具架构 | 保留 | 本地生命周期是稳定脚本职责。 |
| `scripts/testing` | 工具架构 | 保留 | 明确隔离测试资源和正式启动。 |
| `scripts/quality` | 工具架构 | 保留 | Bundle 等质量脚本不属于 demo。 |
| `.local-data` 运行目录 | 本地运行 | 保留 | 比 `.demo` 更准确；继续 Git ignored，并与部署数据分离。 |
| `environments/sample-data` | 架构 | 调整 | 它有 package manifest、TypeScript 源码和导出，是 workspace library，不是 environment。迁到 `packages/sample-data`。 |
| API 正式服务直接 import sample data | 架构债务 | 不保留 | 应用服务不应依赖固定演示 Ref；样例只允许 Seed/测试路径使用。 |
| `environments/local/postgres` | 架构 | 调整 | Docker Compose 是本地基础设施，迁到 `infra/local/postgres`；生命周期脚本仍在 `scripts/local`。 |
| `environments/` 顶层 | 架构 | 不保留 | 当前内容分别属于 package 和 infra，没有形成独立环境层的必要。 |
| `deploy/README.md` | 架构/文档 | 不保留目录 | 当前没有部署代码；说明移入 `docs/operations`，真实部署资产出现时再建目录。 |
| workspace 加入 `environments/*` | 架构 | 不保留 | 样例包回到 `packages` 后恢复仅 `apps/*`、`packages/*`，减少 workspace 入口。 |
| `@edu-agent/demo-fixtures` 改名 `sample-data` | 命名 | 保留方向 | “sample”比“demo fixture”准确，但必须配合依赖治理，不能只换名字。 |
| 根命令产品化命名 | 工具 | 保留并兼容 | `app:*`、`sample:*` 更清楚；必要时短期保留弃用别名，避免脚本和文档突变。 |

## 6. sample data 的实际性质与处理方案

`environments/sample-data` 不是普通数据目录，而是一个可构建 package：

- 有自己的 `package.json` 和 `tsconfig.json`；
- 导出 TypeScript 数据和稳定 Ref；
- 依赖 `@edu-agent/contracts`；
- 被 API package、Seed 服务和多组测试直接 import。

因此第一步应移动到 `packages/sample-data`。但仅移动目录不够。目前多个正式 PostgreSQL 应用服务仍 import 其中的固定 Ref，这意味着正式产品路径在某些地方仍把样例学校、课程或教师当作运行时默认值。

长期规则应是：

```text
packages/sample-data
  允许：本地 Seed CLI、Demo 数据初始化、明确的 synthetic 测试
  禁止：正式 Application Service、Authorization Policy、Repository Adapter 读取固定业务 Ref

packages/test-fixtures
  允许：单元测试、集成测试、Fake Provider、Playwright 构造器
  禁止：产品 Composition Root、Web bundle、生产启动路径
```

正式服务必须从经过验证的 `ActingContext`、请求 Contract 和 Repository 查询中得到资源 Ref。建议新增 architecture test，阻止产品路径 import `sample-data` 或 `test-fixtures`。

## 7. 推荐的长期仓库结构

这是阶段二的目标，不代表本报告已经执行移动：

```text
Edu-Agent/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   ├── contracts/
│   ├── sample-data/
│   └── test-fixtures/
├── infra/
│   ├── postgres/
│   └── local/
│       └── postgres/
├── scripts/
│   ├── local/
│   ├── testing/
│   ├── quality/
│   ├── postgres/
│   └── security/
├── tests/
├── docs/
│   ├── architecture/
│   ├── operations/
│   ├── product/
│   ├── history/
│   └── adr/
├── package.json
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

目录语义：

- `apps`：可启动、可部署的产品应用；
- `packages`：有真实跨 workspace 消费者的共享代码；
- `infra`：数据库、容器和未来真实部署基础设施；
- `scripts`：稳定、可重复、带保护的开发和验证命令；
- `tests`：跨应用验收与基础设施隔离测试；
- `docs`：当前架构、产品事实、运维和历史记录；
- `.local-data`：本地可再生或持久运行数据，只存在于 Git ignored 文件系统。

本阶段不建议创建 `data/`。Seed 数据若是代码 package 放入 `packages/sample-data`；一次性 Seed 执行器放入 `scripts/seed` 或现有 Seed Composition；运行数据放入 `.local-data`。

## 8. 推荐合并后的依赖规则

1. `apps/web` 只依赖 `packages/contracts` 和纯展示资源。
2. `apps/api` 可以依赖 `packages/contracts`；只有 Seed/测试 Composition 可以依赖 `packages/sample-data`。
3. 产品代码不得依赖 `packages/test-fixtures`。
4. `packages/contracts` 不依赖应用、数据库 Adapter 或 Provider SDK。
5. `packages/sample-data` 可以依赖 Contracts 中的稳定类型，但不能依赖 API 应用。
6. 领域模块只通过 Port 访问其他模块能力；Composition Root 负责组装。
7. 跨 Schema 写入必须经过拥有模块的 Application Service 或明确 Port。
8. SDK、ObjectStore、Identity Provider 和 Model Provider 只存在于服务端 Adapter。
9. 新 package 必须有至少两个真实消费者或明确的跨进程协议理由，不能为了“看起来整齐”创建。

## 9. 阶段二允许与禁止的动作

### 可以执行

- 把 sample package 迁回 `packages/sample-data` 并更新 workspace/import/lockfile；
- 把本地 PostgreSQL 编排迁到 `infra/local/postgres`；
- 把 `deploy/README.md` 内容合并到运维文档并移除空目录；
- 保留并文档化 `scripts/local`、`scripts/testing`、`scripts/quality`；
- 增加依赖边界 architecture test；
- 逐个消除正式服务中的固定样例 Ref；
- 在每个小步骤后运行完整回归。

### 不应执行

- checkout baseline 覆盖当前版本；
- 删除当前教师门户和 Agent 的有效改进；
- 修改或合并 43 个历史 Migration；
- 大规模移动七模块目录；
- 创建 Kubernetes、Terraform 或 production 空目录；
- 为每个领域对象创建 package；
- 同时进行目录迁移、Schema 重命名和领域重写；
- 删除本地数据库、ObjectStore 或用户 ignored 文件。

## 10. 基线合并验收条件

阶段二只有在以下条件全部满足时，才能成为新的长期维护基线：

- 当前有效教师功能全部保留；
- `apps/*`、`packages/*` 是唯一 workspace package 根；
- 根目录不再有无真实职责的 `environments/` 和空壳 `deploy/`；
- 产品 Application Service 不依赖 `sample-data` 或 `test-fixtures`；
- 43 个 Migration checksum 不变；
- Secret Scan、TypeScript、Vitest、Architecture、Static、HTTP、PGlite、PostgreSQL、Playwright、Fake Ark、Build、Bundle 和 Demo/Local Doctor 全部通过；
- 开发数据库和 ObjectStore 未被测试删除；
- 根命令和文档链接仍可用；
- 本地与远程功能分支一致，工作区 clean。

## 11. 最终裁决

baseline 的物理 monorepo 结构更适合长期维护；当前版本的产品行为更接近可交付教师体验。两者应合并，而不是二选一。

短期结构恢复不会改变领域语义。真正的后续架构工作是：减少巨大 Composition Service、建立 Platform 与 Agent 的显式数据边界，并让样例数据彻底退出正式产品服务。对应的目标设计与迁移顺序分别见：

- [未来 Agent 平台设计](./future-agent-platform-design.md)
- [推荐迁移路线](./recommended-roadmap.md)
