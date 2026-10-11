# Edu-Agent 文档入口

> 状态：CURRENT
>
> 原则：当前事实与历史记录严格分离。日常开发和产品修改不得把 `history/` 当作设计输入。

根 [README](../README.md) 是产品总入口，[AGENTS.md](../AGENTS.md) 是工程 Agent 的强制边界。本目录只保留仍需日常维护的当前文档；阶段报告、旧方案和实施证据统一归档到 `history/`。

## 默认阅读顺序

工程 Agent 默认只读取以下内容：

1. [项目 README](../README.md)
2. [Agent 工作指南](../AGENTS.md)
3. [当前能力](capabilities.md)
4. [当前架构](architecture/README.md)
5. [开发指南](engineering/README.md)
6. 与本次任务直接相关的当前目录说明

除非用户明确要求追溯历史、核对旧决策，或当前文档明确链接到一项历史证据，否则**不要扫描、总结或引用 `docs/history/`**。

## 当前目录结构

| 目录或文档 | 唯一职责 |
|---|---|
| [当前能力](capabilities.md) | REAL / PARTIAL / MOCK 能力、限制和真实产品状态 |
| [当前架构](architecture/README.md) | 七模块、状态所有权、数据流和安全边界 |
| [架构边界规则](architecture/module-boundary-rules.md) | 跨模块写入、Port、Runtime 与领域状态的强约束 |
| [架构决策](architecture/decisions/README.md) | 新增长期、不可逆架构决策的入口 |
| [当前 UI](ui/README.md) | 当前视觉系统、字体方案 B、导航和交互原则 |
| [开发指南](engineering/README.md) | 目录、命令和常见修改路径 |
| [仓库地图](engineering/repository-map.md) | 当前代码应放在哪里 |
| [验证指南](engineering/validation.md) | 测试类型、隔离语义和最低验证要求 |
| [运维入口](operations/README.md) | 本地生命周期和当前运维边界 |
| [Roadmap](roadmap.md) | 尚未完成的未来工作 |
| [版本历史](version-history.md) | 已完成阶段的 Commit、PR、Tag 和 Migration 时间线 |
| [历史资料](history/README.md) | 只在明确追溯历史时使用的归档索引 |

## 文档维护规则

- 当前事实只能在一个当前权威文档中维护，其他位置只链接，不复制。
- 架构更新直接替换 `architecture/` 中的当前说明；旧设计若有审计价值，移动到 `history/architecture/`。
- UI 更新直接修改 `ui/README.md`；截图报告、阶段复盘和已被推翻的方案进入 `history/ui/`。
- 已完成的阶段报告进入 `history/`；待评审草稿、临时审计和已经失效且无追溯价值的计划直接删除。
- 不新增 `phase-*`、`*-draft.md`、`*-audit.md` 或一次性实施计划到当前目录。
- 新的长期架构决策写入 `architecture/decisions/`，不要修改旧历史文档来伪装当前事实。
- 文档移动或删除后必须运行 `corepack pnpm verify:markdown-links` 和 `corepack pnpm verify:repo-sync`。
