# Edu-Agent 本地运行与运维入口

> 状态：CURRENT LOCAL OPERATIONS
> 范围：本机运行、开发数据与验证；正式部署资源单独进入 `deploy/`。

## 本地服务

| 服务 | 默认地址/端口 | 生命周期 |
|---|---|---|
| Web | `http://localhost:5173` | `app:dev` 前台进程 |
| API | `http://localhost:3001` | `app:dev` 前台进程 |
| PostgreSQL | `127.0.0.1:55432` | Docker Compose，长期开发 Volume |
| LocalObjectStore | `.local-data/object-store` | 仓库根部的 Git ignored 本机目录，跨重启保留 |

完整操作和产品验收见 [本机运行指南](operations/local-environment.md)。

## 生命周期命令

```powershell
corepack pnpm app:doctor   # 只读诊断
corepack pnpm app:prepare  # DB + Migration，不写入示例数据
corepack pnpm app:dev      # 启动已有工作空间
corepack pnpm sample:dev   # 首次体验时载入匿名示例数据并启动
corepack pnpm app:down     # 关闭容器，保留 Volume
```

`app:reset` / `db:clean` 会影响长期开发状态，必须显式理解保护变量后使用。普通测试、文档检查和仓库清理不能间接调用它们。

## 本地持久数据

必须保留，除非用户明确授权：

- 根 `.env.local`；
- `environments/local/postgres/.env.local`；
- Docker Volume `edu-agent-dev-postgres-data`；
- `.local-data/object-store`；
- 用户保留的验收输出。

`dist/` 和 `*.tsbuildinfo` 是可再生构建产物。Playwright 报告、结果、Trace、Video、截图和浏览器临时状态不得写入仓库根目录：Windows 优先写入 `C:\Code\test\edu-agent\playwright`，其他环境写入系统临时目录，也可用 `EDU_AGENT_TEST_OUTPUT_ROOT` 覆盖。

## 健康与诊断

- `app:doctor` 检查运行时、Docker、Compose、端口和环境；
- `app:dev` 等待 API/Web 健康后给出入口；
- `test:postgres` / Playwright 使用隔离资源，失败后检查是否残留 `edu-agent-e2e-*`；
- 模型问题先运行不含 Secret 的配置检查；只有明确授权时运行 `model:probe:live`；
- 仓库状态用 `verify:repo-sync`，文档用 `verify:markdown-links`。

## 备份与恢复现状

本地 Volume 和 LocalObjectStore 不是生产备份方案。当前没有正式 RPO/RTO、PITR、ObjectStore versioning、跨介质恢复或一致性演练。不要把复制 `.local-data/` 或 Docker Volume 当作已验证的学校数据备份。

## Gate 2.10B 边界

云部署、正式 OIDC、托管 PostgreSQL/ObjectStore、Secret Manager、TLS、监控、告警、备份恢复、远程 E2E、容量和发布 Runbook 尚未开始。详细差距和退出条件见 [部署准备差距](operations/deployment-readiness-gaps.md)，未来顺序见 [后续路线](roadmap.md)。
