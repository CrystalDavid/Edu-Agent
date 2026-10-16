# 本地运行与运维

## 服务

| 服务 | 默认地址或位置 |
| --- | --- |
| Web | `http://localhost:5173` |
| API | `http://localhost:3001` |
| PostgreSQL | `127.0.0.1:55432` |
| 文件存储 | `.local-data/object-store/` |

## 启动与停止

从仓库根目录运行：

```bash
corepack pnpm app:doctor
corepack pnpm app:prepare
corepack pnpm app:dev
```

首次体验可以使用 `corepack pnpm sample:dev` 载入匿名示例课程。结束前台进程后，运行 `corepack pnpm app:down` 停止数据库容器，Volume 中的数据会保留。

应用配置位于根 `.env.local`，数据库配置位于 `infra/local/postgres/.env.local`。完整配置、登录方式和模型接入见 [本机运行指南](local-environment.md)。

## 诊断

- 启动问题：`app:doctor` 检查 Node、pnpm、Docker、Compose 和端口。
- 模型问题：核对 `.env.local` 中的 Provider、模型 ID 与凭据；`model:probe:live` 可测试已配置的真实模型，会发起模型请求。
- 文档问题：`verify:markdown-links` 检查本地链接。
- 仓库问题：`verify:repo-sync` 检查文件、忽略规则与远端同步。

数据库重置与临时测试资源见 [PostgreSQL 说明](../../infra/local/postgres/README.md)，浏览器输出目录见 [验证指南](../engineering/validation.md)。

## 部署

当前运行方案是本地 PostgreSQL 与 LocalObjectStore。正式部署所需的 OIDC、托管存储、域名、监控和备份配置见 [部署准备](deployment-readiness-gaps.md)，后续安排见 [路线图](../roadmap.md)。
