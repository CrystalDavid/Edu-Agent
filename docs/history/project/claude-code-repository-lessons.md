# Claude Code 仓库组织经验与 Edu-Agent 应用边界

> 状态：CURRENT RESEARCH NOTE
> 研究日期：2026-08-02（Asia/Shanghai）
> 参考报告：`C:\Users\David\Desktop\Claude-Code-repository-architecture-analysis.zh-CN.md`，SHA-256 `D7653447D449D4AD8ED50E54DC397A54511D4D7C068B68E729A2818BBCE90F83`
> 参考仓库：`CrystalDavid/Claude-Code` @ `bc71b10dbf4e7f31380d10e710eb6748e8554c5a`

本文把 Claude Code 快照作为“仓库组织和 Agent 工程体验”的研究材料，不把它当作 Edu-Agent 的业务架构模板。没有复制参考仓库源码、提示词、许可证文件或专有实现；参考仓库副本和桌面报告均位于 `D:\03_Edu-Agent` 之外，不进入本仓库。

## 1. 从报告和仓库确认的组织方式

### 1.1 先说明证据边界

本地报告已完整读取，并用本地只读克隆复核了固定提交。可以确认：

- 根目录只有 `README.md` 和 `src/`；`src/` 内有 1,902 个源码文件、35 个一级目录；
- 仓库没有 `package.json`、锁文件、`tsconfig.json`、`.github/`、测试目录、`LICENSE`、`CONTRIBUTING.md`、`AGENTS.md` 或 `CLAUDE.md`；
- 许多 `.tsx` 是带内联 source map 的发布物快照，报告通过 `sourcesContent` 还原后分析；
- 若干源码引用的文件在快照中不存在，因此它不是可独立构建、测试或发布的官方完整源码仓库；
- README 自己也声明这是研究快照，而不是 Anthropic 官方完整源码。

因此，可以从固定代码树研究运行时组织、工具注册、权限、Hook、MCP、Skill、插件、子 Agent、上下文和交互性能；不能从该快照证明官方 CI、测试、发布、开发环境或 Agent 指令文件的真实组织方式。对这些缺失项，本轮明确记录“无证据”，不根据目录名补全想象。

### 1.2 根入口很薄，核心行为有稳定聚合点

虽然快照根目录过于精简是发布物形态造成的，但 `src/` 内仍有几个很明确的查找入口：

| 问题 | 单一入口 | 作用 |
|---|---|---|
| 进程如何启动 | `main.tsx`、`setup.ts` | 组合运行模式、认证、插件、MCP、Hook 和 UI |
| 一轮 Agent 如何运行 | `QueryEngine.ts`、`query.ts` | 会话状态与显式 Agent 循环 |
| Tool 如何定义 | `Tool.ts` | Schema、执行、权限、并发、安全和渲染契约 |
| Tool 从哪里注册 | `tools.ts` | 内置、动态和 MCP Tool 的稳定聚合点 |
| Command 从哪里注册 | `commands.ts` | 内置命令、Skill 和插件命令的聚合点 |
| Task 从哪里注册 | `Task.ts`、`tasks.ts` | 后台任务契约和实现注册 |

真正降低查找成本的不是“目录很多”，而是同类能力有可预测的聚合点。开发者或 Agent 可以先读注册表，再进入一个功能叶子目录。

### 1.3 功能叶子共置，而不是按文件类型平铺

典型 Tool 目录把 Schema、Prompt、执行、权限、安全和局部 UI 放在同一功能目录。Command 也采用“一命令一叶子目录”，只负责用户意图和控制面，实际能力下沉到 Service 或 Tool。这样做有三个直接效果：

1. 新增或修改一个能力时，相关文件彼此靠近；
2. 简单能力只需少量文件，高风险能力才局部加深；
3. 公共调度器不需要知道每个能力的业务细节。

### 1.4 横切约束被写进契约和调度器

Tool 是否只读、是否可并发、是否具有破坏性、如何中断、如何授权、结果多大、如何渲染，不只是文档约定，而是契约字段和统一执行管线的一部分。执行层还维护以下协议不变量：

- Tool 可并发完成，但结果按模型调用顺序提交；
- 每个 `tool_use` 都必须得到一个 `tool_result`，拒绝、失败和取消也不例外；
- 输入、Tool Schema 和注册顺序尽量稳定，以保护 transcript、缓存和可重放性；
- 权限不只存在于 UI，还分布在可见性、Schema、Tool 检查、路径解析、Hook 和审计层；
- 后台任务必须有 owner、取消、清理和可观察状态。

这类“可执行的不变量”比口头工程规范更能帮助 Agent 安全地扩展项目。

### 1.5 快路径、慢路径和失败策略显式化

启动与运行代码反复区分：

- 首轮必须完成 / 首帧后可延迟；
- cold load / cache-only warm load；
- interactive / headless；
- 安全可并发 / 必须串行；
- 可失败降级 / 必须 fail closed；
- 信任前只读取 / 信任后才执行。

模型尚未结束输出时，完整 Tool block 就可以开始执行；MCP、Skill、插件和非关键上下文也尽量预取或晚到。这是 Agent 运行流畅的主要原因之一：延迟、安全和生命周期被明确建模，而不是散落在偶然的异步调用中。

### 1.6 扩展点边界清楚

快照把三类扩展区分开：

- MCP：连接运行中的外部能力提供者；
- Plugin：安装包含 Command、Agent、Skill、Hook、MCP、LSP 等组件的扩展包；
- Skill：按需发现和载入的领域行为说明与资源。

扩展加载强调策略门、缓存、失败隔离和清理。这个思想适用于未来需要扩展的 Agent 平台，但 Edu-Agent 当前并没有同等需求，不能为了目录对称提前建立空插件系统。

### 1.7 上下文是分级预算，不是无限消息列表

上下文处理区分大 Tool 结果清理、微压缩、部分压缩、完整摘要和压缩后恢复，并给文件、Skill、记忆和附件分别设预算。子 Agent 也按用途重新组装 Tool、权限、上下文和取消边界。这说明高效 Agent 需要回答：

- 每份上下文从哪里来；
- 是否可重建；
- 最晚何时需要；
- 优先级和 token 成本是多少；
- 过期、压缩和恢复策略是什么。

### 1.8 快照本身也暴露了不可忽视的架构债务

- `main.tsx` 和 `screens/REPL.tsx` 是数千行组合文件；
- `utils/` 占源码约三分之一，已容纳权限、插件、swarm、设置等完整领域；
- 多层存在反向 import 和动态 `require`；
- 编译期 feature flag 和缺失模块增加理解成本；
- 生成/变换源码与 source map 没有在研究快照中良好隔离；
- 没有构建、测试、CI、发布或许可证文件可供仓库工程纪律研究。

因此，“看起来井然有序”主要来自稳定入口、局部共置和运行时契约，不代表每一处目录和依赖方向都值得复制。

## 2. 可应用于 Edu-Agent 的原则

### 2.1 本轮直接应用

| 原则 | Edu-Agent 的具体动作 |
|---|---|
| 根目录保持简洁 | 根目录只保留项目入口、治理文件、workspace/config；把五份早期架构资料移入 `docs/history/research/` |
| 唯一首要入口 | 重写根 `README.md`，让产品、开发、验收和文档阅读顺序从同一处开始 |
| Agent 快速获得上下文 | 新增根 `AGENTS.md`，只放可执行不变量、目录、命令和权威文档链接 |
| 当前事实与历史分离 | 当前文档固定为 `docs/architecture.md`、`capabilities.md`、`version-history.md` 等；Gate/UI/研究记录进入 `docs/history/` |
| 稳定命令入口 | 以根 `package.json` 作为命令注册表，补齐 `test:unit`、`test:ark-fake`、`verify:repo-sync`、Markdown 链接检查等可预测名称 |
| 正式源码与生成物隔离 | 保持 `.local-data/`、ObjectStore、测试报告、截图、构建缓存和本地环境被忽略；增加 Git 同步验证脚本 |
| 功能边界名称表达真实用途 | 把匿名样例数据独立为 `packages/sample-data`，让产品不再依赖 `test-fixtures` |
| 复杂区域有局部指南 | 为 API、Web、packages、scripts 和 tests 增加短 README，只解释所有权、入口与禁止事项 |
| 约束可执行 | 保留并强化 architecture/static/secret/version/repo-sync 验证，不把关键边界只写在文档中 |
| 高风险工作显式延期 | API、Express app、Contracts、模型服务和七模块目录不因文件大而机械拆分，先记录后续验证条件 |

### 2.2 对后续 Agent 开发的工作方式

新的工程 Agent 应按以下顺序获取上下文：

1. 读根 `AGENTS.md`，确认不变量、禁止项和最低验证；
2. 读根 `README.md`，理解产品定位和业务闭环；
3. 按任务读取一个权威文档，而不是搜索多份 Gate 状态报告；
4. 从 package script 或领域 Composition Root 找稳定入口；
5. 修改前用 `rg` 核对 import、路由、脚本、测试和文档链接；
6. 只在所属模块写正式状态，跨模块通过 Port/Application Service；
7. 完成后运行与风险对应的测试，并更新唯一权威文档。

### 2.3 与 Edu-Agent 现有架构的对应关系

Edu-Agent 已经具备一些与参考原则一致的基础，不需要重新发明：

- `apps/api/src/composition/` 是服务端组合根；
- `apps/api/src/modules/` 与七个 PostgreSQL Schema 明确状态所有权；
- `packages/contracts` 是 Web/API 的共享协议入口；
- Migration registry、architecture tests、static assertions、secret scan 和版本历史验证把关键边界变成可执行检查；
- Proposal、TeachingPlan、Evidence、授权上下文和 Outbox 已有明确的不变量；
- Demo、PostgreSQL、Playwright 和模型探测已由根命令编排。

本轮的重点不是改变七模块业务架构，而是让这些既有入口更容易被人和 Agent 找到。

## 3. 不适合 Edu-Agent、不能照搬的部分

1. **不能把快照当官方完整源码或构建模板。** 缺失的构建、测试、CI、许可证和 Agent 指令意味着这些方面没有可迁移证据。
2. **不能复制单包 `src/` 的 35 个一级技术目录。** Edu-Agent 的首要边界是七个领域/能力模块和状态所有权，不是 CLI、TUI、Tool、Command 的同构目录。
3. **不能建立没有当前需求的插件、MCP、Skill 或多 Agent 框架。** 显式扩展点是好原则，但空抽象会增加维护成本。
4. **不能复制大组合文件和庞大 `utils/`。** Edu-Agent 应继续约束依赖方向，并在有契约测试时渐进拆分大文件。
5. **不能照搬终端 UI 微优化。** Edu-Agent 是 React Web + Express；性能工作应依据 bundle、浏览器渲染和 API 指标。
6. **不能为了“相似目录名”移动七模块、Schema 或历史 Migration。** 这些是已验证的领域边界和审计历史。
7. **不能复制参考源码、Prompt 或专有实现。** 本文只记录通用工程原则；若未来评估实现复用，必须先独立完成许可证与来源审查。
8. **不能把 source-map 生成物混放当作优点。** Edu-Agent 应继续让 `dist/`、报告、截图和本地状态默认不进入 Git。
9. **不能把运行流畅归因于文件夹命名。** 真正有效的是稳定入口、协议不变量、失败策略、确定性并发和上下文预算；只有业务需要时才应在 Edu-Agent Agent Runtime 中逐步实现。

## 结论

对 Edu-Agent 最有价值的迁移不是重做业务目录，而是建立一条低成本认知路径：根 README → AGENTS → 权威当前文档 → 稳定命令 → 所属模块/组合根 → 可执行验证。这个路径能直接降低后续 Agent 的搜索、猜测和误改成本，同时保持七模块模块化单体、43 个历史 Migration 和现有业务语义不变。
