# Edu-Agent UI Phase 2：Teaching Workspace 视觉重构报告

## 目标

本轮只调整教师端视觉层级与课程导航交互，不改变 Lesson Journey、TeachingPlan、Material Bundle、LessonDelivery、Reflection 或 Agent Runtime 的业务语义。

设计目标是让教师在课时页中：

1. 3 秒内识别当前课时和当前阶段；
2. 30 秒内理解下一步需要自己判断什么；
3. 再按需阅读教学洞察、方案、材料和历史信息。

## 信息层级

Teaching Workspace 采用五级文字层级：

| 层级 | 用途 | 当前实现 |
| --- | --- | --- |
| 核心任务 | 当前课时 | 30–38px / 700 |
| 决策标题 | 下一步动作 | 21px / 600 |
| 阶段标题 | 备课、上课、课下 | 22px / 600 |
| 内容标题 | 教学重点、材料名称 | 14–20px / 500–600 |
| 说明与辅助 | 来源、时间、状态 | 11–14px / 400–500 |

文字颜色统一为 Primary、Secondary、Muted 三层。关键内容不再只依赖加粗区分。

## 页面结构变化

课时页首屏顺序调整为：

1. 当前课时与状态；
2. 下一步决策；
3. 备课 / 上课 / 课下阶段进度；
4. 本课教学洞察；
5. 当前阶段的工作内容；
6. 历史、来源与版本信息。

下一步动作使用页面中唯一的强调型决策卡。普通说明、教学洞察和阶段内容回归页面流，不再层层套卡片。

## 课程树变化

- 课程面板由大块卡片列表调整为轻量导航；
- 单元支持明确的展开和收起；
- 课时改为紧凑行，当前课时使用浅蓝背景和左侧状态线；
- 课时序号、标题、时长和状态建立不同字号与颜色层级；
- 课程面板固定在视口内，长页面滚动时仍可快速切换课时；
- 当前教学与历史教学仍读取原有 CourseRun 数据，不新增状态副本。

## 教学洞察与阶段内容

- 教学重点和难点由卡片改为双栏信息流，仅保留轻量色线帮助扫描；
- 教学目标由灰色卡片改为可直接阅读的目标列表；
- 三阶段导航使用进度线、当前蓝色和完成绿色表达状态；
- 备课、上课和课下区域取消外围卡片，使用留白与细分隔线组织；
- 只有当前决策点、可操作候选等真正需要教师判断的内容继续使用卡片。

## Material Bundle

- 五项材料由五张独立卡片改为统一列表；
- 状态、版本说明和操作位于同一扫描行；
- 保留预览、确认、下载和局部重新生成能力；
- 不显示内部 artifact ref、revision ref 或 hash；
- 仍通过原 Artifact Application Service 写入 FileAsset / FileVersion。

## 数据与业务边界

本轮未修改：

- API Contract；
- 数据库 Schema 或 Migration；
- Lesson Journey 状态计算；
- TeachingPlan 审批；
- Material Bundle 版本语义；
- LessonDelivery、Observation 和 Reflection 确认边界；
- Agent Runtime、Skill、Context 或 Memory。

## 验证结果

- `corepack pnpm typecheck`：通过；
- `corepack pnpm test`：45 个测试文件、240 项测试全部通过；
- `corepack pnpm test:playwright`：23 项教师端端到端测试全部通过；
- `corepack pnpm test:ark-fake`：1 项 Fake Ark 恢复流程通过；
- `corepack pnpm build`：全部 workspace 构建通过；
- Playwright 隔离 PostgreSQL Volume 与 ObjectStore 均已清理，开发数据未改变。

浏览器人工验收覆盖默认桌面视口与 1440 × 900，检查了课时首屏、课程树展开/收起、教学洞察和材料决策列表。

## 当前限制

- 本轮没有重新设计作业、学生、文件或 Agent 页的信息架构；它们继续使用 UI Phase 1 的全局视觉基线；
- 课堂反馈与课后反思的表单结构没有改写，只继承新的字体、色彩和圆角体系；
- 当前课程数据只有一个学期示例时，历史教学区显示空状态；多学期和多班级仍由现有正式 API 数据驱动。
