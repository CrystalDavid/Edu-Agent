# Edu-Agent 本地运行与运维入口

> 状态：CURRENT LOCAL OPERATIONS
> 范围：本地 synthetic Demo；不代表 Gate 2.10B 或生产部署。

## 本地服务

| 服务 | 默认地址/端口 | 生命周期 |
|---|---|---|
| Web | `http://localhost:5173` | `demo:dev` 前台进程 |
| API | `http://localhost:3001` | `demo:dev` 前台进程 |
| PostgreSQL | `127.0.0.1:55432` | Docker Compose，长期开发 Volume |
| LocalObjectStore | `apps/api/.demo/uploads/objects` | API package 下的本地目录，跨重启保留 |

完整操作和产品验收见 [LOCAL_DEMO](demo/LOCAL_DEMO.md)。

## 生命周期命令

```powershell
corepack pnpm demo:doctor  # 只读诊断
corepack pnpm demo:up      # DB + Migration + synthetic seed
corepack pnpm demo:dev     # 完整本地开发入口
corepack pnpm demo:down    # 关闭容器，保留 Volume
```

`demo:reset` / `db:clean` 会影响长期开发状态，必须显式理解保护变量后使用。普通测试、文档检查和仓库清理不能间接调用它们。

## 本地持久数据

必须保留，除非用户明确授权：

- 根 `.env.local`；
- `infra/docker/.env.local`；
- Docker Volume `edu-agent-dev-postgres-data`；
- `apps/api/.demo/uploads/objects`；
- 用户保留的验收输出。

可再生但默认仍不自动删除：`dist/`、`*.tsbuildinfo`、Playwright reports、`test-results/`、`.playwright-cli/` 和 `output/playwright/`。它们都不应提交 Git。

## 健康与诊断

- `demo:doctor` 检查运行时、Docker、Compose、端口和环境；
- `demo:dev` 等待 API/Web 健康后给出入口；
- `test:postgres` / Playwright 使用隔离资源，失败后检查是否残留 `edu-agent-e2e-*`；
- 模型问题先运行不含 Secret 的配置检查；只有明确授权时运行 `model:probe:live`；
- 仓库状态用 `verify:repo-sync`，文档用 `verify:markdown-links`。

## 备份与恢复现状

本地 Volume 和 LocalObjectStore 不是生产备份方案。当前没有正式 RPO/RTO、PITR、ObjectStore versioning、跨介质恢复或一致性演练。不要把复制 `.demo/` 或 Docker Volume 当作已验证的学校数据备份。

## Gate 2.10B 边界

云部署、正式 OIDC、托管 PostgreSQL/ObjectStore、Secret Manager、TLS、监控、告警、备份恢复、远程 E2E、容量和发布 Runbook 尚未开始。详细差距和退出条件见 [DEPLOYMENT_READINESS_GAPS](operations/DEPLOYMENT_READINESS_GAPS.md)，未来顺序见 [ROADMAP](ROADMAP.md)。
