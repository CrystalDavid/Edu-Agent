# Edu-Agent Web

`apps/web` 是 React/Vite 普通教师门户。

- 入口和当前路由渲染：`src/main.tsx`、`src/App.tsx`、`src/route.ts`；
- 页面：`src/pages/`，当前路由使用 `Teacher*Page` 或 Workspace 页面；
- API client：`src/api.ts`，共享 URL 在 `src/api-url.ts`；
- 当前仍使用的显式 Demo/READ_ONLY 数据：`src/teacher-portal-data.ts`；
- 正式 Contract：`@edu-agent/contracts`。

Web 不直接连接数据库、模型、ObjectStore 或身份供应商，也不能通过本地 state 宣称正式业务写入成功。修改路由/Page/API client 后运行 typecheck、默认 tests、production build 和相关 Playwright。
