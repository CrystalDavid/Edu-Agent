# Edu-Agent 目标仓库结构与安全迁移方案

> 状态：CURRENT DECISION
> 制定日期：2026-08-02（Asia/Shanghai）
> 产品基线：`gate-2-10a-verified`
> 整理分支：`chore/repository-cleanup-and-reorganization`

本文在执行目录移动和删除前，先固定目标结构、迁移理由和风险边界。目标是提高仓库可理解性与 Agent 开发效率，不改变七模块模块化单体、数据库 Schema、公共 Contract 或现有业务流程。

## 1. 决策依据

本方案综合：

- 当前代码、workspace dependency、路由、import、测试和 Migration registry；
- [当前架构](CURRENT_ARCHITECTURE.md)、[仓库地图](REPOSITORY_MAP.md)和[清理计划](REPOSITORY_CLEANUP_PLAN.md)；
- [Claude Code 仓库组织经验](CLAUDE_CODE_REPOSITORY_LESSONS.md)；
- Git 跟踪/忽略、大文件、Secret、二进制和本地运行目录审计。

优先级依次为：保持状态所有权和历史可追溯性、保持可运行、建立唯一入口、减少歧义，最后才是目录视觉整齐。

## 2. 目标结构

```text
Edu-Agent/
├── README.md                         项目唯一首要入口
├── CHANGELOG.md                      Verified stage 摘要
├── AGENTS.md                         工程 Agent 可执行指南
├── SECURITY.md                       Secret、漏洞和安全边界
├── CONTRIBUTING.md                   开发、提交和验证流程
├── apps/
│   ├── api/                          Express、组合根、Worker、七模块
│   └── web/                          React/Vite 教师门户
├── packages/
│   ├── contracts/                    Web/API 共享 DTO、路由和 Zod Schema
│   ├── demo-fixtures/                运行时可用、明确 synthetic 的演示数据
│   └── test-fixtures/                只供自动化测试的构造器与 Fixture
├── infra/
│   ├── docker/                       本地 PostgreSQL 编排和环境示例
│   └── postgres/                     数据库所有权说明
├── scripts/
│   ├── demo/                         本地 Demo 与隔离 Playwright 编排
│   ├── postgres/                     数据库生命周期和集成测试编排
│   ├── security/                     Secret 扫描
│   └── *.ts/*.mjs                    仓库级静态和一致性验证
├── tests/                            跨 workspace 的 contract/integration/E2E 测试
├── docs/
│   ├── README.md                     文档入口和阅读顺序
│   ├── ARCHITECTURE.md               当前架构唯一权威入口
│   ├── CAPABILITIES.md               当前 REAL/PARTIAL/MOCK 能力入口
│   ├── VERSION_HISTORY.md            Commit/PR/Tag/Migration 历史
│   ├── ROADMAP.md                    只描述未来计划
│   ├── DEVELOPMENT.md                目录、命令和开发路径
│   ├── VALIDATION.md                 测试类型、命令和证明范围
│   ├── OPERATIONS.md                 本地运行与部署准备入口
│   ├── adr/                          不可随意重写的长期决策入口
│   ├── demo/                         本地 Demo 专项指南
│   ├── operations/                   详细运维/部署差距
│   ├── project/                      仓库审计、清理和研究记录
│   └── history/
│       ├── gates/                    Verified Gate 设计和验收记录
│       ├── research/                 早期架构、红队和追加式状态报告
│       └── ui/                       历史 UI 设计记录
├── .env.example                      无真实 Secret 的环境模板
├── package.json                      稳定命令注册表
├── pnpm-workspace.yaml               workspace 成员入口
└── *.config.ts                       TypeScript、Vitest、Playwright、Drizzle 配置

本地存在但不进入 Git：

├── .env.local                        本机 Secret/配置
├── .demo/                            Demo 日志、报告和 LocalObjectStore
├── node_modules/、dist/               安装与构建产物
├── playwright-report*/、test-results/ 浏览器测试报告
├── output/playwright/                 本地验收截图
└── .playwright-cli/                   浏览器自动化临时状态
```

## 3. 保留不动的正式边界

| 目录/边界 | 决策 | 理由 |
|---|---|---|
| `apps/api`、`apps/web` | 保留 | 两个可部署应用边界清楚，workspace 和脚本均依赖现名 |
| `apps/api/src/modules/<module>` | 保留 | 七模块和七 Schema 是当前状态所有权，不因参考仓库目录而重构 |
| 各模块 `infrastructure/migrations` | 原地保留 | 43 个历史 Migration 的路径、顺序、checksum 和审计价值不可扰动 |
| `apps/api/src/composition` | 保留 | 当前服务端 Composition Root；大文件可后续按契约渐进拆分 |
| `packages/contracts` | 保留 | Web/API 共享协议入口；Gate 增量文件暂不机械合并 |
| `infra` | 保留 | 本地 Docker/PostgreSQL 职责明确；本轮不开始云部署 |
| `tests` | 保留 | 跨包测试不属于任一应用，当前配置和脚本已稳定引用 |
| `scripts/demo`、`scripts/postgres`、`scripts/security` | 保留 | 已按运行职责分组；根 package scripts 是唯一稳定调用面 |

## 4. 本轮可以安全执行的整理

### 4.1 文档

- 把三个 `CURRENT_*` 权威文档移动为 `docs/ARCHITECTURE.md`、`CAPABILITIES.md`、`VERSION_HISTORY.md`；
- 增加 `ROADMAP.md`、`DEVELOPMENT.md`、`VALIDATION.md` 和 `OPERATIONS.md`，每份只维护一种当前事实；
- 把 Gate、UI 和早期架构/研究资料移动到 `docs/history/`，保留 Git 历史和文档内容；
- 保留 `docs/project/` 作为仓库审计、目标结构、清理和参考研究区，不把它列为新开发者第一阅读层；
- 更新所有本地 Markdown 链接，并用自动脚本验证；
- 根目录只保留五个入口/治理 Markdown。

### 4.2 Demo 与测试数据

- 新增 `packages/demo-fixtures`，接收当前由产品代码使用的 Gate 2 synthetic refs、教学计划和演示数据；
- `apps/api` 改为依赖 `@edu-agent/demo-fixtures`；
- Gate 2 测试可直接复用 demo package，避免复制数据；
- `packages/test-fixtures` 只保留 Gate 1A/1B 测试构造器；
- Fake Provider 响应、Playwright 行为和断言继续留在测试基础设施，不进入 demo package。

### 4.3 已证明无运行引用的遗留代码

在再次核对静态 import、动态 import、路由、package scripts、测试、文档链接和 Git 历史后，可删除：

- 八个未路由旧 Page；
- `InspectorPanel.tsx`、`portal/StudentComponents.tsx`；
- 只被旧 Page 使用的 `demo-read-model.ts`；
- 只会抛错且无调用者的 `run-demo-fresh.mjs`。

现行 `Teacher*Page`、Workspace 页面、`teacher-portal-data.ts` 中仍被使用的显式 Mock、Gate 1A Test Container 和历史文档不删除。

### 4.4 稳定工程入口

- 根 `package.json` 增加可预测的测试/验证别名；
- 新增无 GitHub Token 的 `verify:repo-sync`；
- 增加 Markdown 链接检查；
- 删除失效脚本，但保留危险数据库命令的显式名称和 fail-closed 保护；
- 为复杂顶层代码区域增加短 README，减少 Agent 猜测入口的成本。

## 5. 只补说明、不移动的区域

| 区域 | 本轮动作 | 原因 |
|---|---|---|
| `apps/api` | 增加局部 README | 组合根、模块、平台层和数据库入口需要导航，但移动会扩大回归面 |
| `apps/web` | 增加局部 README | 明确现行路由/Page、API client 和 Mock 标记边界 |
| `packages` | 增加 README | 解释 contracts/demo/test 三包依赖方向 |
| `scripts` | 增加 README | 根命令为公共入口，脚本文件不应被直接猜测调用 |
| `tests` | 增加 README | 说明每类测试证明什么以及数据库隔离语义 |
| `teacher-portal-data.ts` | 记录剩余 Mock，不整文件移动 | 仍被 Overview、Agent、Exam 和 Sidebar 使用，直接拆分风险高 |

## 6. 推迟到后续独立重构

以下内容不阻塞本轮仓库整理：

1. `apps/web/src/api.ts` 按领域拆分；需先固定 transport/session/error 契约和 API client 回归测试；
2. Express `app.ts` 与大型 Composition Service 拆分；需先画依赖图并确保 middleware/route 顺序不变；
3. `packages/contracts/src/gate*.ts` 合并或重命名；需保持公共 export 和兼容层；
4. `teacher-portal-data.ts` 按 portal types、read-only demo、exam demo、agent demo 拆分；需逐一替换消费者；
5. tenant/organization 全局更名、七模块目录重构、Schema 更名；涉及契约、审计和持久化，必须单独 ADR；
6. 历史 Migration 合并、重写或重排；明确禁止；
7. 云 CI、正式 OIDC、托管 PostgreSQL/ObjectStore、监控和部署流水线；属于另行审查的仓库治理或 Gate 2.10B 工作；
8. 插件、MCP、Skill、多 Agent 或上下文压缩框架；当前产品没有足够需求，不预建空抽象。

## 7. 依赖方向与完成条件

本轮整理后的期望依赖方向：

```text
apps/web  ───────> packages/contracts
apps/api  ───────> packages/contracts
apps/api  ───────> packages/demo-fixtures   （仅本地 synthetic demo/seed）
tests     ───────> packages/contracts
tests     ───────> packages/demo-fixtures   （复用 synthetic demo）
tests     ───────> packages/test-fixtures   （测试专用构造器）
test-fixtures -X-> apps/*
demo-fixtures -X-> test-fixtures
```

完成本轮整理至少满足：

- 43 个历史 Migration 内容和路径未修改；
- 产品应用不再依赖 `@edu-agent/test-fixtures`；
- 当前文档只有一组清晰入口，历史资料可查但不与当前事实并列；
- 根 README 和 AGENTS 能独立引导新开发者/Agent 找到正确入口；
- 失效代码删除后 TypeScript、Vitest、PostgreSQL、Playwright 和 production build 均通过；
- `.env.local`、开发数据库、LocalObjectStore 和用户验收资料未删除、未提交；
- 工作分支推送后 `verify:repo-sync` 证明本地 HEAD 与远程跟踪分支一致；
- 只创建 Draft PR，不创建 Gate Tag，不自动合并。
