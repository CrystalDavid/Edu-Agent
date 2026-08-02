# Edu-Agent 仓库清理计划与实施记录

> 状态：IMPLEMENTED IN DRAFT PR BRANCH
> 产品基线：`gate-2-10a-verified`
> 整理分支：`chore/repository-cleanup-and-reorganization`

本文保留清理判定、已执行动作和延期项。整理不改变产品 Gate、七模块、Schema 或历史 Migration。

## 判定方法

删除或移动前使用 Git 跟踪状态、`rg` import/动态 import、路由、package scripts、测试、文档链接、build 和 Git history 交叉检查。零文本引用只是证据之一；动态加载、公共 export、历史审计和用户本地数据必须单独判断。

风险口径：

- 低：已证明无运行引用、可由现行入口替代，或只是路径整理；
- 中：可能影响 Demo、测试、文档链接或公共 import；
- 高：影响持久化、状态所有权、安全、外部兼容或历史审计。

## 已完成的低风险清理

### 旧 Web Page 和 Mock

删除以下 12 个对象，共 1,743 行：

- `apps/web/src/pages/{Assignments,Courses,Dashboard,Files,Schedule,Settings,Students,StyleGuide}Page.tsx`；
- `apps/web/src/components/InspectorPanel.tsx`；
- `apps/web/src/components/portal/StudentComponents.tsx`；
- `apps/web/src/demo-read-model.ts`；
- `scripts/demo/run-demo-fresh.mjs`。

依据：

- 八个 Page 均未被 `App.tsx`、动态 import、route、测试或 package script 引用；
- 现行路由分别进入 `Teacher*Page`、`TeachingWorkspacePage` 或 `StudentWorkspacePage`；
- `InspectorPanel` 无消费者；
- `StudentComponents` 的三个导出只在自身和历史 UI 文档中出现；
- `demo-read-model.ts` 的每个 export 只被八个旧 Page 使用；
- `run-demo-fresh.mjs` 无调用者且唯一行为是抛错；替代命令是隔离 `test:playwright`，显式重置使用受保护的 `demo:reset`；
- 删除后 typecheck、architecture、static 和 production build 通过；初始 bundle 不变，证明这些文件此前没有进入运行图。

### Demo 与测试 Fixture

- 新增 `packages/demo-fixtures`，承载产品本地 Demo 使用的 Gate 2 synthetic refs/data；
- API 和 Gate 2 tests 改为依赖 `@edu-agent/demo-fixtures`；
- `packages/test-fixtures` 只保留 Gate 1A/1B 测试构造器；
- 数据使用移动而不是复制，避免两套 Fixture 漂移；
- Fake Ark、Playwright 行为和断言仍在 tests；
- `apps/*` 中已无 `@edu-agent/test-fixtures` import。

### Markdown 与根目录

- 根目录五份早期架构/研究资料已移入 `docs/history/research/` 或 `docs/adr/`；
- 当前权威入口统一为 `docs/ARCHITECTURE.md`、`CAPABILITIES.md`、`VERSION_HISTORY.md`、`ROADMAP.md`、`DEVELOPMENT.md`、`VALIDATION.md` 和 `OPERATIONS.md`；
- Gate、live acceptance、UI 规格和历史图片已归档到 `docs/history/`；
- 根目录新增 `AGENTS.md`、`SECURITY.md`、`CONTRIBUTING.md`；
- Playwright 不再改写已跟踪历史 UI 图片，只写 ignored `output/playwright/`；
- 新增 Markdown 链接验证。

### 稳定工程入口

- 根 `package.json` 继续作为单一命令注册表；
- 增加 `test:unit`、`test:ark-fake`、`verify:markdown-links` 和 `verify:repo-sync`；
- 保留兼容的 `test:playwright:ark-fake`；
- 危险数据库命令保持显式名称和原有保护，不改变测试隔离语义。

## 明确保留

| 内容 | 保留原因 |
|---|---|
| 43 个历史 Migration | 只向前、审计和已验证 Schema 事实；内容和路径不得改变 |
| Audit/Seed Migration | 正式历史与幂等初始化的一部分 |
| Gate 1A Test Container / in-memory repositories | 仍被 Node smoke、HTTP skeleton 和隔离测试使用；不是产品 fallback |
| `teacher-portal-data.ts` | Overview read-only、Agent/Exam demo 和 Sidebar types 仍有消费者 |
| 字体和许可证/Attribution | 正式静态资源和许可证义务 |
| ADR、Gate 文档、live acceptance | 审计历史；只归档不删除 |
| `.env.local`、开发 PostgreSQL、LocalObjectStore | 用户本地长期状态，不是清理目标 |
| ignored 验收输出 | 未经用户逐项确认不删除；只确保不进入 Git |
| `drizzle-kit` / `drizzle.config.ts` | package script 未直接使用，但可能属于手工 Migration 开发流程；证据不足，不删除 |

## 推迟的高风险重构

| 候选 | 风险与前置条件 |
|---|---|
| `apps/web/src/api.ts` 拆分 | 先固定 transport/session/error 层和 API client contract tests，避免循环依赖 |
| Express `app.ts` 拆分 | 必须保持 middleware/route/auth 顺序并增加 route composition 回归 |
| 大型 Composition/Application Service | 需按 use case 和 transaction boundary 拆，不按行数机械切割 |
| `packages/contracts/src/gate*.ts` 合并 | 需 export/usage 图、兼容 re-export 和 wire format 保护 |
| `teacher-portal-data.ts` 拆分 | 先逐项区分 portal type、read-only updates、exam demo 和 agent demo |
| tenant/organization 全局更名 | 已进入 contracts、DB 和历史；需 ADR/compatibility migration |
| 七模块目录或 Schema 更名 | 状态所有权和测试已固化；不是仓库整理问题 |
| 历史 Migration 合并/重写 | 明确禁止 |
| 云 CI/部署、正式 OIDC、托管服务 | 需要独立仓库治理决定或 Gate 2.10B 授权 |
| 插件、多 Agent、MCP/Skill 框架 | 当前无产品需求，不建立空抽象 |

## 本地生成物处理

本轮不删除 `.env.local`、开发 Volume、`.demo/uploads/objects` 或用户验收输出。`node_modules`、`dist`、reports、`test-results`、`.playwright-cli` 和 `output/playwright` 均正确 ignored；它们是可再生或需用户判断的本地内容，不是“应提交但遗漏”的源码。

## 完成条件

- [x] 已确认低风险遗留文件无 import/route/script/test 消费者；
- [x] 产品不再依赖 test-only Fixture package；
- [x] 当前与历史 Markdown 分层，根目录只保留入口/治理文档；
- [x] 已记录大文件、Secret、忽略项和 GitHub 同步审计；
- [x] 已增加 Agent 指南和稳定命令；
- [ ] 完整 PostgreSQL、Playwright、Fake Ark、build、bundle、Demo Doctor 和 repo-sync 最终回归；
- [ ] 推送功能分支并创建 Draft PR；
- [ ] 用户人工审查后再决定合并；本轮不自动合并、不创建 Gate Tag。

最终同步结论见 [GITHUB_SYNC_AUDIT](GITHUB_SYNC_AUDIT.md)，目标结构和延期理由见 [TARGET_REPOSITORY_STRUCTURE](TARGET_REPOSITORY_STRUCTURE.md)。
