# Edu-Agent Web

React、Vite 和 Ant Design 构建的教师门户，包含课时工作台、备课对话、作业、日程、文件和教师偏好设置。

从仓库根目录运行 `corepack pnpm app:dev`，打开 [http://localhost:5173](http://localhost:5173)。首次体验可使用 `corepack pnpm sample:dev` 载入示例课程。

| 入口 | 作用 |
| --- | --- |
| [src/main.tsx](src/main.tsx)、[src/App.tsx](src/App.tsx) | 应用入口与页面装配 |
| [src/route.ts](src/route.ts) | History 路由 |
| [src/pages](src/pages/) | 教师页面与 Workspace |
| [src/api.ts](src/api.ts)、[src/api-url.ts](src/api-url.ts) | 类型化 API client 与地址配置 |
| [contracts](../../packages/contracts/) | 前后端共享协议 |

业务数据通过 API 读写，组件管理页面交互状态。样式和组件规格见 [UI 设计](../../docs/ui/README.md)，开发与验证命令见 [开发指南](../../docs/engineering/README.md)。
