# Edu-Agent Tests

测试按证明范围分层：

- `unit/`、`gate2/`：纯逻辑与 Contract；
- `architecture/`：模块、Schema、Ingress、安全与产品不变量；
- `e2e/`：无浏览器 HTTP walking skeleton；
- `integration/`：PGlite Migration；
- `node/`：Gate 1A Test Container 的原生 Node smoke；
- `postgres/`：隔离真实 PostgreSQL、角色、Repository、HTTP 和 Worker；
- `playwright/`：隔离浏览器业务回归；
- `live/`：显式 opt-in 的真实 Provider；
- `fixtures/`、`support/`：测试数据、Fake Ark 和 loader，不属于产品运行时。

默认 `pnpm test` 排除 `postgres/` 和 `live/`；Playwright 也需单独运行。测试截图只写入被忽略的 `output/playwright/`。完整矩阵见 [docs/VALIDATION.md](../docs/VALIDATION.md)。
