# 开发脚本

所有命令从仓库根目录通过 `corepack pnpm <script>` 运行；完整定义见 [package.json](../package.json)。

| 目录 | 用途 | 常用命令 |
| --- | --- | --- |
| [local](local/) | 启动、准备与诊断 | `app:doctor`、`app:prepare`、`app:dev` |
| [postgres](postgres/) | 数据库与迁移 | `db:up`、`db:migrate`、`db:down` |
| [sample](sample/) | 载入示例数据 | `sample:seed`、`sample:dev` |
| [testing](testing/) | 隔离测试环境 | `test:playwright`、`test:ark-fake` |
| [quality](quality/) | 构建体积分析 | `analyze:bundle` |
| [security](security/) | 凭据检查 | `test:secrets` |

文档和仓库检查：

```bash
corepack pnpm verify:markdown-links
corepack pnpm verify:repo-sync
corepack pnpm verify:version-history
```

开发数据重置命令 `db:clean`、`app:reset` 的参数与数据影响见 [PostgreSQL 说明](../infra/local/postgres/README.md) 和 [运行指南](../docs/operations/local-environment.md)。
