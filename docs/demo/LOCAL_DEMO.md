# Gate 2 Teacher Copilot 本地演示

## 演示边界

本演示只使用合成的八年级数学“一次函数斜率与图像关系”数据和确定性 `MockModelProvider`。它不会调用 DeepSeek 或其他外部模型，不连接 CloudBase、Netlify 或其他云服务，也不会产生云费用。

## 前置条件

- Node.js 与 pnpm；
- Docker Desktop 已启动，Docker Engine 可用；
- 主机端口 `55432`、`3001` 和 `5173` 未被其他程序占用；
- 在正式项目目录 `D:\03_Edu-Agent` 中执行命令。

## 一条命令启动

```text
pnpm demo:dev
```

该命令会依次：

1. 创建被 Git 忽略的本地 PostgreSQL 凭证；
2. 启动官方 `postgres:18` Docker 容器；
3. 初始化七个 Schema、数据库角色和 migrations；
4. 幂等 Seed 全部合成数据；
5. 启动 Express API 和 Vite Web。

终端显示 API 与 Vite 已启动后，打开：

```text
http://localhost:5173
```

## 本地访问方式

第一轮没有登录页。页面固定使用：

- 合成租户：`tenant:demo-school`；
- 合成教师：`user:teacher-001`；
- 浏览器只发送固定的本地合成身份 Header，不包含真实凭证。

该访问方式不是身份认证，只适用于本机验收，不能用于公开部署。

## 推荐演示路径

1. 从“今日工作台”查看 CourseRun、Goal 和 Evidence 摘要；
2. 进入“学习证据”，展开来源、Assistance 和未知项；
3. 进入“Teacher Copilot”，生成两套策略；
4. 切换策略并查看结构化 TeachingPlan Diff；
5. 点击“修改字段”，修改支持策略或后续行动并保存；
6. 进入“TeachingPlan”查看新的 `in_review` Revision；
7. 进入“运行记录”查看 Contract、ContextManifest、授权、Mock 用量、Outbox 和 Audit。

## 重置合成数据

先用 `Ctrl+C` 停止 Web/API，再执行：

```text
pnpm demo:reset
```

该命令只删除 Compose 项目 `edu-agent-gate1b` 的本地测试容器和 volume，然后重新初始化并 Seed。它不会删除仓库文件、其他 Docker volume 或本机原生 PostgreSQL 数据。

重新启动页面：

```text
pnpm demo:dev
```

## 停止服务

1. 在运行 `demo:dev` 的终端按 `Ctrl+C` 停止 API 与 Web；
2. 停止 PostgreSQL 容器：

```text
pnpm demo:down
```

`demo:down` 保留本地合成数据 volume，便于下次继续演示。

## 常见故障

### Docker 命令不可用

确认 Docker Desktop 已启动，并在新终端运行 `docker version`。不要在项目配置中写入个人 Docker Registry 代理。

### 端口冲突

- PostgreSQL：检查 `55432`；
- API：检查 `3001`；
- Web：检查 `5173`。

停止占用程序后重新运行 `pnpm demo:dev`。

### 页面显示“合成数据尚未初始化”

停止开发进程，运行 `pnpm demo:reset`，再运行 `pnpm demo:dev`。

### 页面请求失败

确认终端同时显示 API 与 Vite 服务。浏览器只应访问 `http://localhost:5173`，由 Vite 将 `/api` 代理到本地 `3001`。

## 明确未使用的能力

- 无真实 DeepSeek API Key；
- 无真实模型调用；
- 无 CloudBase、Netlify、CVM；
- 无真实学校、教师、学生或家长数据；
- 无多 Agent；
- 无自动发布 TeachingPlan；
- 无外部通知或承诺。
