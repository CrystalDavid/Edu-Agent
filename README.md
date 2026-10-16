# Edu-Agent

面向教师的 AI 工作台，把备课、教学材料、作业批改、课堂观察与课后反思连接起来。教师可以围绕一节课与 Agent 连续协作，审阅生成内容，并将教学反馈带入下一次备课。

## 功能

- **课时工作台**：查看课程与课时，整理教学目标、备课任务和材料。
- **AI 备课**：多轮讨论教学方案，生成并修改教案，审阅批准后导出 DOCX。
- **教学材料**：围绕已批准的教案生成教案内容、PPT 大纲、课堂练习、板书设计和分层支持材料，逐项预览、重生成和下载。
- **作业与反馈**：管理作业、批改提交，查看学习证据，并据此调整下一课。
- **课堂与反思**：记录课堂实施和观察，生成反思草稿，选择后续备课、作业或待办行动。
- **日程与记忆**：管理 Todo 与 Calendar，恢复同一备课任务的对话，并在后续生成中使用教师确认的偏好。

## 快速启动

需要 **Node.js 24、Corepack 和 Docker Desktop**。项目通过 `packageManager` 固定 pnpm 版本。

```bash
git clone https://github.com/CrystalDavid/Edu-Agent.git
cd Edu-Agent
corepack pnpm install --frozen-lockfile
corepack pnpm app:doctor
corepack pnpm sample:dev
```

`sample:dev` 启动本地 PostgreSQL、执行迁移、载入匿名示例课程，并启动 API 和 Web。打开 [http://localhost:5173](http://localhost:5173)，按照登录页的本机登录流程进入教师工作空间。

已有工作空间可直接运行：

```bash
corepack pnpm app:dev
```

默认端口为 Web `5173`、API `3001`、PostgreSQL `55432`。结束前台进程后，执行 `corepack pnpm app:down` 可停止数据库容器并保留数据。

## 体验一次完整流程

1. 进入课程，选择一节课，查看目标与准备情况。
2. 在备课任务中描述要求，与 Agent 讨论并生成教学方案。
3. 审阅方案，批准教案后生成材料包，预览、调整并下载所需材料。
4. 创建作业，使用示例提交体验批改与学习证据。
5. 记录课堂观察，生成课后反思，并选择下一课行动。

## 连接模型

默认使用离线 Mock Provider，适合先体验工作流。调用火山方舟模型时，在根目录 `.env.local` 中设置：

```dotenv
MODEL_PROVIDER_MODE=ark
ARK_API_KEY=your_api_key_here
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL_ID=your_model_or_endpoint_id
```

重启应用后生效。登录、模型和本地数据配置详见 [运行指南](docs/operations/local-environment.md)。

## 技术与目录

React / Vite / Ant Design 前端，Express / TypeScript 服务端，PostgreSQL / Drizzle 数据层。服务端采用七模块的模块化单体，统一管理任务、模型运行、教学内容、文件和教师偏好。

| 路径 | 内容 |
| --- | --- |
| [apps/web](apps/web/README.md) | 教师门户、课时工作台与 API client |
| [apps/api](apps/api/README.md) | HTTP API、业务模块、Worker 和数据库迁移 |
| [packages](packages/README.md) | 共享类型、示例数据与测试构造器 |
| [infra/local](infra/local/README.md) | 本地 PostgreSQL 与运行环境 |
| [tests](tests/README.md) | 单元、架构、接口与浏览器测试 |

## 开发

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

更多命令见 [开发指南](docs/engineering/README.md) 和 [验证指南](docs/engineering/validation.md)。

当前版本面向本地教师工作流；材料中的 PPT 是内容大纲，文件使用本地存储。云部署、学生端、家长端与完整考试系统见 [后续计划](docs/roadmap.md)。

[文档](docs/README.md) · [架构](docs/architecture/README.md) · [详细功能](docs/capabilities.md) · [版本历史](docs/version-history.md)
