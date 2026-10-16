# 测试

从仓库根目录运行：

```bash
corepack pnpm test
```

默认运行单元、协议、架构、HTTP 和 PGlite 测试。数据库、浏览器和真实模型测试分别提供独立入口：

| 范围 | 目录 | 命令 |
| --- | --- | --- |
| 单元与协议 | `unit/`、`gate2/` | `test:unit` |
| 模块与状态所有权 | `architecture/` | `test:architecture` |
| HTTP 流程 | `e2e/` | `test:e2e` |
| 数据库迁移 | `integration/` | `test:migrations` |
| Node smoke | `node/` | `test:node-smoke` |
| PostgreSQL 集成 | `postgres/` | `test:postgres` |
| 浏览器业务流程 | `playwright/` | `test:playwright` |
| Fake Ark 模型流程 | `playwright/`、`support/` | `test:ark-fake` |
| 已配置的真实模型 | `live/` | `test:model:live` |

PostgreSQL 和浏览器测试使用独立的临时数据库与文件目录。Playwright 输出位置可通过 `EDU_AGENT_TEST_OUTPUT_ROOT` 指定；默认路径和测试组合见 [验证指南](../docs/engineering/validation.md)。

专用配置位于 [config](config/)，场景数据与辅助代码位于 [fixtures](fixtures/) 和 [support](support/)。
