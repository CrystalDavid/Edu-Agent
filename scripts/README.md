# Repository Scripts

脚本由根 `package.json` 提供稳定命令入口。开发者和 Agent 应优先调用 `corepack pnpm <script>`，不要根据文件名猜测参数或生命周期。

- `local/`：本机应用启动、诊断、准备和受保护重置；
- `testing/`：隔离 E2E、Playwright 和 ObjectStore 生命周期；
- `quality/`：Bundle 与质量分析；
- `postgres/`：开发数据库、Migration 和真实 PostgreSQL 测试编排；
- `security/`：Secret 扫描；
- 根脚本：静态断言、版本历史、Markdown 链接和仓库同步验证。

`db:clean`、`app:reset` 等破坏性入口必须保持显式授权和 fail-closed。普通测试不得重置长期开发 Volume，任何脚本都不得删除 `.local-data/object-store`。
