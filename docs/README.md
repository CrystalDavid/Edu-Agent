# Edu-Agent 文档入口

根 [项目 README](../README.md) 是项目唯一首要入口。本文只负责说明“接下来读哪一份”和“新事实应该写在哪里”，不重复当前能力或架构正文。

> 最新产品 Verified Gate：Gate 2.10A / `gate-2-10a-verified`
> 当前定位：普通教师端本地功能型 MVP；尚未开始 Gate 2.10B 云部署。

## 推荐阅读顺序

### 新开发者或工程 Agent

1. [根 README](../README.md)：产品定位、闭环、启动和验收；
2. [Agent 指南](../AGENTS.md)：不可违反的边界、命令和最低验证；
3. [当前能力](capabilities.md)：当前哪些是 REAL、PARTIAL、MOCK；
4. [当前架构](architecture.md)：七模块、Schema、Composition Root 和数据流；
5. [开发指南](development.md)：目录、稳定命令和常见修改路径；
6. [验证指南](validation.md)：每类测试证明什么。

### 产品负责人或验收者

1. [根 README](../README.md)；
2. [当前能力](capabilities.md)；
3. [本地 Demo](demo/local-demo.md)；
4. [版本历史](version-history.md)；
5. [后续路线](roadmap.md)。

### 运维或 Gate 2.10B 规划

1. [运维指南](operations.md)；
2. [部署就绪差距](operations/deployment-readiness-gaps.md)；
3. [安全政策](../SECURITY.md)；
4. [后续路线](roadmap.md)。

## 当前权威文档

| 文档 | 唯一职责 | 不应放入 |
|---|---|---|
| [项目 README](../README.md) | 项目总览、启动、业务闭环和阅读入口 | 逐 Gate 历史细节 |
| [当前能力](capabilities.md) | 当前功能状态和限制 | 未来承诺、实现过程日志 |
| [当前架构](architecture.md) | 当前有效架构、状态所有权和数据流 | 已被替代的设计方案 |
| [版本历史](version-history.md) | Commit、PR、Tag、Migration 和阶段变化 | 未来 Roadmap |
| [后续路线](roadmap.md) | 尚未完成的未来计划 | 已完成能力的重复说明 |
| [开发指南](development.md) | 仓库定位、命令和开发路径 | 产品状态表 |
| [验证指南](validation.md) | 测试类型、隔离语义和证明范围 | 手工产品路线图 |
| [运维指南](operations.md) | 本地生命周期、运行数据和运维入口 | 云部署已经完成的暗示 |
| [变更日志](../CHANGELOG.md) | Verified stage 的面向人摘要 | 完整 Git 证据表 |

## 支持性当前资料

这些文档用于仓库治理或专项执行，不是第一阅读层：

- [仓库结构地图](project/repository-map.md)；
- [仓库清理计划](project/repository-cleanup-plan.md)；
- [GitHub 同步审计](project/github-sync-audit.md)；
- [目标仓库结构](project/target-repository-structure.md)；
- [Claude Code 仓库经验](project/claude-code-repository-lessons.md)；
- [部署就绪差距明细](operations/deployment-readiness-gaps.md)；
- [Migration ownership](../infra/postgres/migration-ownership.md)；
- [Docker/PostgreSQL](../infra/docker/README.md)。

## ADR 与历史资料

- [ADR 入口](adr/README.md)：长期架构决策；已有 v0.3.2 勘误与 ADR 包原样保留；
- [历史索引](history/README.md)：详细 Gate、早期研究和 UI 记录；
- `history/gates/`：Verified Gate 设计、功能矩阵和验收资料；
- `history/research/`：早期架构、红队审查、0→1 调查和追加式状态报告；
- `history/ui/`：历史 UI 规格和当时验收图片。

历史资料准确描述当时阶段，但不再作为当前事实入口。内容与当前代码冲突时，以 `CAPABILITIES`、`ARCHITECTURE`、`VERSION_HISTORY` 和自动化验证为准。

## 文档状态与维护规则

- `CURRENT`：描述当前代码或当前约束；修改相关代码时同步更新；
- `DRAFT` / `ROADMAP`：尚未交付，不得写成已完成；
- `HISTORICAL`：保留当时设计、验收或决策，不追改成当前说明；
- `SUPERSEDED`：已有权威替代文档，保留审计价值；
- 一个事实只指定一个权威入口，其他文档使用链接，不复制大段状态表；
- 新 Gate 完成后更新 `CAPABILITIES`、`ARCHITECTURE`（如有变化）、`VERSION_HISTORY` 和 `CHANGELOG`；
- Gate 详细设计/验收归档到 `history/gates/`，未来计划只写入 `ROADMAP`；
- 新的长期不可逆架构决策写独立 ADR，不改写旧 ADR；
- 文档移动后运行 `corepack pnpm verify:markdown-links` 和 `verify:version-history`。
