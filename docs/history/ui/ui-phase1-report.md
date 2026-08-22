# Edu-Agent UI Phase 1 实施报告

## 1. 本阶段范围

本阶段只调整教师端全局视觉系统、主导航和教师可见信息的表达方式。未修改 Teaching Workspace 的业务状态机、API Contract、数据库 Schema、Migration 或教师审批边界。

## 2. Design System 变化

| 类别 | 统一规则 |
| --- | --- |
| 品牌色 | `#3370FF`，选中态使用浅蓝背景，不使用重阴影 |
| 页面标题 | 28px / 700 / 1.35 |
| 模块标题 | 20px / 600–700 / 1.4 |
| 正文 | 15px / 1.6；表单与普通内容保持在 14–16px |
| 辅助信息 | 13px / 1.5；不再让重要信息依赖 12px 灰字 |
| 按钮 | 14px，圆角 12px |
| 间距 | 4px 网格：4 / 8 / 12 / 16 / 20 / 24 / 32px |
| 页面留白 | 桌面 28px × 24–32px；紧凑宽度 24px × 20px |
| 卡片 | 常规 20px，大型工作区 24px |
| Pill | 999px |
| 阴影 | 卡片仅保留轻边界阴影；浮层使用单独的 raised shadow |

Token 统一维护在 `apps/web/src/design-tokens.ts`，Ant Design 主题与教师门户 CSS 共用同一组尺寸和圆角语义。

## 3. Sidebar 变化

- 桌面宽度统一为 224px；窄桌面降为 204px，仍保持完整文字导航。
- 导航项高度 44px、图标 18px、文字 15px、图文间距 12px。
- 头像调整为 40px，身份区和导航区使用相同的 4px 间距网格。
- 所有主导航继续使用同一套单色线性图标，stroke 统一为 1.75。
- Active 状态使用浅蓝背景、蓝色文字和 12px 圆角，不使用投影。
- Hover、设置入口和用户菜单使用同一视觉语言。

## 4. 教师页面隐藏的技术信息

以下内容不再直接展示给教师：

- Material Bundle 中的原始 `artifact revision ref`；
- Lesson Brief 中的 source ref，改为“本课信息 / 教学目标 / 已授权学习证据 / 已批准教学方案 / 已确认教学偏好”；
- 课堂反馈中的 AgentRun、ContextManifest 和 manifest hash；
- 课后反思上下文中的内部来源标识；
- Evidence 卡片中的原始 source ref；
- 待办进入 Agent 时的内部 todo ref fallback；
- 文本材料预览中的 `schema / lesson / teachingPlanRevision / skill / agentRun / hash` 文件头。

文本材料的原文件与版本没有被修改；过滤只发生在教师预览呈现层。Runs / 系统诊断等受限技术页面仍可保留可追溯标识。

## 5. 页面验收

在 1440 × 900 桌面视口下，用真实本地会话逐页检查了概览、日程、教学、学生、文件、Agent 和设置。侧边栏尺寸、字体、按钮、卡片圆角和 Active 状态保持一致。

### 概览

![概览](assets/ui-phase1/overview.png)

### 日程

![日程](assets/ui-phase1/schedule.png)

### 教学工作台

![教学工作台](assets/ui-phase1/teaching.png)

### 学生

![学生](assets/ui-phase1/students.png)

### 文件（技术文件头已隐藏）

![文件](assets/ui-phase1/files.png)

### Agent

![Agent](assets/ui-phase1/agent.png)

### 设置

![设置](assets/ui-phase1/settings.png)

## 6. 自动化保护

- 架构测试固定 Sidebar、Button、Card 和 Large radius Token；
- Playwright 的 Sidebar 宽度断言同步为 224px；
- 新增文本材料预览测试，禁止教师预览出现 artifact revision、agent run 和 schema 文件头；
- 将两条过时 Playwright 断言更新为当前中文产品文案与可递增版本语义，未放宽业务边界。

## 7. 验证结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm typecheck` | 通过 |
| `corepack pnpm test` | 45 个测试文件、240 项测试全部通过 |
| `corepack pnpm test:playwright` | 23 项完整教师流程全部通过；独立 PostgreSQL Volume 和 ObjectStore 已清理 |
| `corepack pnpm build` | 通过；Web 生产构建完成 |
| `git diff --check` | 通过 |

生产构建中 CSS 为 145.41 kB（gzip 25.47 kB）；本阶段没有把图片或技术配置打入运行 Bundle。

## 8. 环境边界

- `.npmrc` 保持 `store-dir=.pnpm-store`；`pnpm store path` 为 `D:\03_Edu-Agent\.pnpm-store\v11`。
- Playwright 与测试产物位于仓库内 `.local-data` / `output`，均为 ignored 运行内容。
- 未创建 `D:\.pnpm-store`、`D:\playwright-report`、`D:\test-results` 或 `D:\.local-data`。

## 9. 未改变内容

- Lesson Journey、Lesson Brief、TeachingPlan、Material Bundle、Delivery、Reflection 和 Next Lesson 的业务逻辑未修改；
- API Contract、数据库、Migration、Runtime、Skill、Context 和 Memory 未修改；
- 技术标识仍保留在正式数据、Audit 与受限诊断链路中，仅从普通教师界面隐藏。
