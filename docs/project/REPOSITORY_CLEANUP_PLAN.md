# Edu-Agent 仓库清理计划

> 状态：CURRENT PLAN（只调查，不在本轮执行高风险删除/重构）
> 核实基线：`gate-2-10a-verified`

## 1. 判定方法

候选项通过 Git 跟踪状态、`rg` import/route/script 引用、package scripts、测试引用、构建输出和现有文档交叉检查。零文本引用是证据之一，不等于可以自动删除；动态加载、公共 export、测试夹具和历史审计价值必须另行判断。

风险：`低` = 可重建或已证明无运行引用；`中` = 可能影响测试/演示/文档；`高` = 影响持久化、状态所有权、安全或外部兼容。

## 2. 候选清单

| 类别 | 文件或目录 | 当前用途 / 引用证据 | 风险 | 建议操作 | 可安全立即处理 | 建议阶段 |
|---|---|---|---|---|---|---|
| 1. 过时文档 | `docs/project/PROJECT_EVOLUTION_0_TO_1.md` | 调查基线停在 `43c8e03`，正文只更新至 Gate 2.5；有历史价值 | 低 | 保留，标为 `HISTORICAL / SUPERSEDED`，当前事实链接到 VERSION_HISTORY/CAPABILITIES | 是，仅改状态横幅 | 当前文档 PR |
| 1. 过时文档 | `docs/product/GATE_2_8_*`、`GATE_2_9_*` | 开头仍称“等待人工验收”，Git 已有 verified merge/tag | 低 | 修正状态与 merge/tag，不改历史设计正文 | 是 | 当前文档 PR |
| 2. 重复文档 | `CURRENT_STATE_AND_NEXT_STEP_OPTIONS.md` | 超过 1100 行，按 Gate 追加；前部状态与当前实现冲突，第 24 节才是 Gate2.10A | 中 | 保留决策历史，标为 append-only historical；让 CURRENT_CAPABILITIES 成为当前状态入口 | 是，仅加横幅 | 当前文档 PR；后续可拆 archive |
| 2. 重复文档 | 根目录 v0.3.1/v0.3.2/ADR/红队/第一轮计划 | 多次迭代描述相同架构，部分已被代码替代 | 中 | 不删除；在 docs 索引分为 HISTORICAL/SUPERSEDED，并指向 CURRENT_ARCHITECTURE | 是，仅索引 | 当前文档 PR |
| 3. 过时 README | `README.md` | 开头仍写 Gate2.9 verified、Gate2.10A 正在建设 | 低 | 改为 Gate2.10A verified、当前定位、文档入口和 Gate2.10B | 是 | 当前文档 PR |
| 4. 旧 UI 页面 | `apps/web/src/pages/{Assignments,Courses,Dashboard,Files,Schedule,Settings,Students,StyleGuide}Page.tsx` | 无 import/route；现行页面均为 `Teacher*`/workspace 版本 | 中 | 单独清理 PR 删除并跑 typecheck/build/Playwright；同时清理只为它们服务的模型 | 否，本轮只记录 | 仓库清理 Gate 1 |
| 4. 未路由组件 | `apps/web/src/components/InspectorPanel.tsx`、`portal/StudentComponents.tsx` | `rg` 未发现生产/测试 import；后者只 import demo arrays | 低—中 | 在独立 PR 删除，确认无动态引用与快照依赖 | 否 | 仓库清理 Gate 1 |
| 5. 旧 Mock 数据 | `apps/web/src/demo-read-model.ts` | 只被上述八个旧 Page 引用 | 中 | 与旧 Page 同批删除，避免留下孤立模型 | 否 | 仓库清理 Gate 1 |
| 5. 混合 Mock 数据 | `apps/web/src/teacher-portal-data.ts` | 仍被 Overview 的 READ_ONLY 动态、Agent mock、Exam workspace、Sidebar type 使用 | 高 | 不能整文件删除；先拆 `portal-types`、明确 demo fixture、Exam demo 和 read-only updates，再删除无引用数组 | 否 | 仓库清理 Gate 2 |
| 6. 内存产品代码 | Gate1A in-memory repositories 与 `test-container.ts` exports | 仅用于 isolation tests/internal test routes；Product Composition Root 不 import | 中 | 移到显式 `test-support`/internal namespace，保持 walking skeleton 测试；不要当 fallback | 否 | 架构清理专项 |
| 7. 测试/产品混放 | `packages/test-fixtures` | 大量测试使用；API Product Composition/seed 也 import 合成 demo refs | 高 | 拆为 `demo-fixtures`（可运行合成数据）与 `test-fixtures`（纯测试），逐步收窄产品依赖 | 否 | 架构清理专项 |
| 8. 重复 API Client | `apps/web/src/api.ts` | 当前不是重复，而是单一真值；但已达约 1689 行 | 中 | 按 auth/course/work/artifact 等拆内部文件，共享一个 transport/session/error layer；先加 contract tests | 否 | 前端维护性专项 |
| 9. 重复 DTO/Schema | `packages/contracts/src/gate*.ts` | Gate 增量文件造成相近 ref/status/error schema；尚未证明可直接合并 | 高 | 先生成 export/usage 图，提取稳定 common primitives，保留兼容 re-export；不得大规模改名 | 否 | Contracts 专项 |
| 10. 旧分支 | 14 条远程历史 feature 分支；本地额外 `feat/gate-2-5a-teacher-daily-workflow` alias | 所有产品提交已在 main；分支仍是审计/比较入口 | 低—中 | verified tag 和 VERSION_HISTORY 固化后，另提远程分支归档/删除清单；需用户逐项批准 | 否 | 文档 PR 合并后 |
| 10. 旧输出记录 | `output/`、`playwright-report*`、`test-results`、`.playwright-cli` | Git ignored、可重建，本机可能含验收证据 | 低 | 提供安全清理脚本，仅删除解析后的仓库内已知目录；保留用户需要的验收证据 | 否（需用户确认） | 本地维护 |
| 11. 无用依赖候选 | 根 `drizzle-kit`、`drizzle.config.ts` | package scripts/代码未引用 CLI；`drizzle-orm` 正式使用 | 中 | 先核对开发者手工 Migration 流程和 README；确认不用后删除 kit/config 并更新 lockfile | 否 | 依赖审计专项 |
| 12. 构建/临时目录 | `node_modules`、各 `dist`、reports、`.demo/e2e` | ignored/可重建；开发 ObjectStore `.demo/uploads/objects` 不可误删 | 低—高 | 只清理 build/test 产物；禁止把 `.demo/uploads/objects` 纳入通用删除 | 否 | 本地维护脚本 |
| 13. 过时脚本 | `scripts/demo/run-demo-fresh.mjs` | 无 package/test/docs 调用；脚本当前只抛错，防止旧版删除开发 DB | 低 | 文档记录替代命令后删除文件；保留 destructive reset 的 fail-closed guard tests | 可以，但本轮不删除 | 仓库清理 Gate 1 |
| 14. 命名不一致 | Gate2.5A 本地 alias、Gate2.5B/2.6A 时间次序、`tenantRef` 与 Organization ref | 历史名称已经出现在 Git/DB/contracts | 高 | 不改历史 Gate/commit；文档给严格时间序；新代码优先明确 organization/tenant 映射，改名需 ADR/compat layer | 否 | 渐进式专项 |
| 15. Bundle/延迟加载 | `jsx-runtime` chunk 约 333.9 KiB raw、Web API 146.5 KiB raw；多处 AntD Table/Select | Gate2.10A bundle 报告总计约 793.7 KiB raw / 256.3 KiB gzip；页面已 lazy | 中 | 建立预算趋势；核对 Vite chunk 归类和 AntD import/tree-shaking；按路由拆大型 workspace 与 API/contract chunks | 否 | 性能专项 / Gate2.10B 前 |
| 15. 大型服务文件 | API model invocation service 约 3648 行、`app.ts` 约 3248 行；多个 1700+ 行 service/client/page | 仍有大量测试，不能凭行数切分 | 高 | 按稳定职责提取 HTTP router、state transition、validation、read model，保持 transaction/API contract 不变 | 否 | 单独重构 Gate |

## 3. 可以安全立即处理的项目

本轮仅处理不改变产品行为的内容：

1. 把 Gate 2.8、2.9、2.10A 和功能矩阵状态修正为真实 verified 基线；
2. 给旧调查文档添加历史/被替代标记；
3. 用 `docs/README.md` 建立 CURRENT/HISTORICAL/SUPERSEDED/DRAFT 入口；
4. 更新根 README 和错误链接；
5. 新增离线版本/链接验证，防止下次状态漂移。

`run-demo-fresh.mjs` 和零引用页面虽风险较低，本轮仍不删除：文档 PR 的目标是建立可审查清单，而不是把“看起来无用”直接变成不可逆修改。

## 4. 必须单独重构的项目

- `teacher-portal-data.ts` 拆分：它同时承载必要类型、明确演示区和可删除旧 Mock；
- `test-fixtures` 产品依赖拆分：涉及 seed、composition、测试 ref 稳定性；
- Contracts 与 Web API client 分层：涉及全部页面和 HTTP tests；
- Gate1A test support 内聚：涉及架构测试与内部路由；
- 大型 API/Application Service 分解：涉及事务、幂等、租约和安全错误；
- tenant → organization 命名渐进迁移：涉及数据库历史与公共 contracts；
- bundle 优化：必须用基准和 Playwright 验证，不能只按 chunk 名猜测。

## 5. 推荐清理顺序

1. **Cleanup 1（低风险）**：删除已证明零引用的旧 Page/组件、`demo-read-model.ts`、失效脚本；跑全套前端/Playwright。
2. **Cleanup 2（演示边界）**：拆 `teacher-portal-data.ts`，对每个剩余 Mock 在功能矩阵中保持显式标识。
3. **Cleanup 3（包边界）**：拆 demo/test fixtures，收紧 Product Composition 依赖和 architecture tests。
4. **Cleanup 4（维护性）**：拆 Web API client、Contracts common schema 和 Express route groups。
5. **Cleanup 5（性能）**：建立 bundle budget、route-level 性能基线后做按需加载。

每批都应独立 PR、保留行为回归证据；不要与 Gate 2.10B 云资源变更混在一个发布单元。
