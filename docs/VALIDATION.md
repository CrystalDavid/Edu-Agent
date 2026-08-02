# Edu-Agent 验证指南

> 状态：CURRENT

不同测试证明不同边界。一次命令通过不能替代另一层证据；真实 PostgreSQL、浏览器和真实模型也必须保持不同隔离/授权语义。

## 验证层级

| 层级 | 命令 | 证明内容 | 不证明什么 |
|---|---|---|---|
| Secret | `test:secrets` | 跟踪文件中没有已知 Key/Token 模式 | Git 历史和外部系统没有泄漏 |
| TypeScript | `typecheck` | workspace 当前类型边界 | 运行时行为、SQL 或 UI |
| Unit/Contract | `test:unit` | 纯函数、配置、Contract 和 Provider 规则 | 真实 PostgreSQL/浏览器 |
| 默认 Vitest | `test` | unit、contract、architecture、HTTP skeleton、PGlite 等 | tests/postgres、live、Playwright |
| Architecture | `test:architecture` | 七模块、Schema ownership、Ingress、权限和关键不变量 | 所有业务交互 |
| Static | `test:static` | 固定源码/文件断言 | 动态数据库状态 |
| HTTP E2E | `test:e2e` | 无浏览器的 API walking skeleton | 完整 PostgreSQL 业务切片 |
| Node Smoke | `test:node-smoke` | Gate 1A Test Container 和原生 Node loader | Product Composition Root |
| PGlite | `test:migrations` | Migration registry 可在嵌入式 PostgreSQL 路径执行 | PostgreSQL role/Compose 行为完全等价 |
| PostgreSQL | `test:postgres` | 临时真实 PostgreSQL、角色、Repository、HTTP、Worker 和幂等性 | 浏览器 UI |
| Playwright | `test:playwright` | 默认 Mock Provider 下端到端教师流程 | 真实 Ark |
| Fake Ark | `test:ark-fake` | OpenAI-compatible transport、恢复和安全 UI | 真实供应商账号/用量 |
| Live Ark | `model:probe:live` / `test:model:live` | 显式配置的真实 Provider 能力 | 默认 CI 或生产就绪 |
| Build | `build` | workspace production compilation/bundle | 云运行环境 |
| Bundle | `analyze:bundle` | 初始静态图和最大 chunk 体积 | 浏览器实际 p75 性能 |
| Docs/History | `verify:markdown-links` / `verify:version-history` | 本地链接和 Git/Tag/Gate 证据 | 外部 URL 永久可用 |
| Repo sync | `verify:repo-sync` | 必需文件、忽略、禁止跟踪和当前分支远程一致 | GitHub PR checks/permissions |

## 推荐组合

### 文档或仓库整理

```powershell
corepack pnpm test:secrets
corepack pnpm verify:markdown-links
corepack pnpm verify:version-history
corepack pnpm verify:repo-sync
git diff --check
```

`verify:repo-sync` 在分支尚未第一次推送或存在未推送 Commit 时应失败；这是预期保护，不应通过降低检查规避。

### Web/Contract/API 改动

```powershell
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:architecture
corepack pnpm test:static
corepack pnpm build
```

再按影响运行 `test:postgres`、默认 Playwright 和 Fake Ark Playwright。

### Migration/Repository 改动

除上述外必须运行：

```powershell
corepack pnpm test:migrations
corepack pnpm test:postgres
```

同时比较历史 Migration tree，确保只新增文件而未修改旧文件。

## 测试隔离与清理

- 长期开发数据库使用稳定 Compose project/Volume；
- PostgreSQL integration 与 Playwright 创建带唯一名称的临时 project、端口和 Volume；
- 测试失败也应在 `finally` 清理临时容器/Volume；
- 默认 Playwright 只把截图写入被忽略的 `output/playwright/`，不会改写已跟踪文档图片；
- `.demo/uploads/objects` 是开发数据，不能被测试清理器删除；
- Fake Ark 只监听本地隔离端口，不可被误报为 live 验收；
- live tests 必须明确 opt-in，并对 Key、request ID 和内容脱敏。

## 完成前人工核对

- `git diff --name-status` 中没有历史 Migration；
- 没有 `.env.local`、数据库、ObjectStore、reports、截图或缓存进入跟踪；
- Web bundle 不包含 Secret 或服务端配置；
- Markdown 链接和根 README 命令有效；
- 开发数据库和上传文件仍存在；
- `git status` 最终干净，当前分支 HEAD 等于远程跟踪分支；
- Draft PR 列出所有通过/跳过的验证，不能把 skipped 写成 passed。
