# Edu-Agent 文档入口

> 当前最新 Verified Gate：Gate 2.10A / `gate-2-10a-verified`
> 核实基线：`main` @ `bbba3428602bb148a3d73a201ad97fcb29181c1b`

状态标记：

- **CURRENT**：描述当前代码和当前决策，应优先使用；
- **HISTORICAL**：准确记录当时阶段，不代表当前完整能力；
- **SUPERSEDED**：后来已有更权威文档，保留用于审计；
- **DRAFT**：规划/差距分析，尚不是已交付能力。

## 1. 新开发者推荐阅读顺序

1. **CURRENT** — [根 README](../README.md)：定位、快速启动和验证命令；
2. **CURRENT** — [当前能力地图](project/CURRENT_CAPABILITIES.md)：页面与闭环的 REAL/PARTIAL/MOCK 状态；
3. **CURRENT** — [当前技术架构](project/CURRENT_ARCHITECTURE.md)：实际模块、Adapter、数据流与安全边界；
4. **CURRENT** — [仓库结构地图](project/REPOSITORY_MAP.md)：在哪里新增对象、Migration、Contract、页面和测试；
5. **CURRENT** — [完整版本历史](project/VERSION_HISTORY.md)：严格时间顺序、Commit、PR、Tag、Migration 与各 Gate；
6. **DRAFT** — [仓库清理计划](project/REPOSITORY_CLEANUP_PLAN.md)；
7. **DRAFT** — [Gate 2.10B 部署就绪差距](project/DEPLOYMENT_READINESS_GAPS.md)。

## 2. 项目现状

| 状态 | 文档 | 用途 |
|---|---|---|
| CURRENT | [CURRENT_CAPABILITIES](project/CURRENT_CAPABILITIES.md) | 当前页面和业务闭环能力 |
| CURRENT | [CURRENT_ARCHITECTURE](project/CURRENT_ARCHITECTURE.md) | 当前代码架构与数据流 |
| CURRENT | [REPOSITORY_MAP](project/REPOSITORY_MAP.md) | 仓库定位指南 |
| CURRENT | [VERSION_HISTORY](project/VERSION_HISTORY.md) | 0 → Gate 2.10A 完整历史 |
| SUPERSEDED / HISTORICAL | [CURRENT_STATE_AND_NEXT_STEP_OPTIONS](project/CURRENT_STATE_AND_NEXT_STEP_OPTIONS.md) | 从 Teacher Portal v1 开始的逐 Gate 决策日志；当前事实已被能力地图替代 |
| SUPERSEDED / HISTORICAL | [PROJECT_EVOLUTION_0_TO_1](project/PROJECT_EVOLUTION_0_TO_1.md) | 2026-07-30 的 0→1 调查与 Gate2.5 补记 |

## 3. 产品与 Gate 文档

以下文档均为 **HISTORICAL / VERIFIED**：它们冻结对应阶段语义；当前组合能力以能力地图为准。

| 实际时间顺序 | 文档 | Verified 入口 |
|---:|---|---|
| 1 | Gate 1A / 1B：见根目录[第一轮工程验证计划](../教育智能体平台第一轮工程验证计划.md)与版本历史 | `gate-1b-verified` |
| 2 | [Gate 2.4 — Copilot 正确性与可恢复性](product/GATE_2_4_COPILOT_CORRECTNESS.md) | `gate-2-4-verified` |
| 3 | [Gate 2.5 — 最小可恢复备课](product/GATE_2_5_RECOVERABLE_LESSON_PREPARATION.md) | `gate-2-5-verified` |
| 4 | [Gate 2.6A — Volcengine Ark Provider](product/GATE_2_6A_VOLCENGINE_ARK_PROVIDER.md) | `gate-2-6a-verified` |
| 5 | [Gate 2.5B — 文件与教学成果](product/GATE_2_5B_FILE_AND_TEACHING_ARTIFACTS.md) | `gate-2-5b-verified` |
| 6 | [Gate 2.5C — 产品稳定性矩阵](product/TEACHER_PRODUCT_STABILIZATION_MATRIX.md) | `gate-2-5c-verified` |
| 7 | [Gate 2.7 — 作业、Evidence 与调整下一课](product/GATE_2_7_ASSIGNMENT_LEARNING_EVIDENCE.md) | `gate-2-7-verified` |
| 8 | [Gate 2.8 — 教师工作台](product/GATE_2_8_TEACHER_WORKBENCH.md) | `gate-2-8-verified` |
| 9 | [Gate 2.9 — 课堂实施与反思](product/GATE_2_9_CLASSROOM_REFLECTION_LOOP.md) | `gate-2-9-verified` |
| 10 | [Gate 2.10A — 身份与学校组织](product/GATE_2_10A_IDENTITY_ORGANIZATION_FOUNDATION.md) | `gate-2-10a-verified` |

Gate 2、UI redesign v1/v2 和 Teacher Portal UI v1 没有独立 PR/Tag；见版本历史。**Gate 2.6B 没有实施**，不存在产品文档、分支、PR 或 Tag。

## 4. 当前功能矩阵

- **CURRENT** — [普通教师端功能矩阵](product/TEACHER_PORTAL_FUNCTION_MATRIX.md)：逐交互 REAL/MOCK/READ_ONLY/DISABLED/DEAD；
- **HISTORICAL / VERIFIED** — [Gate 2.5C 稳定性矩阵](product/TEACHER_PRODUCT_STABILIZATION_MATRIX.md)：P0/P1/P2/P3 问题、根因和回归证据。

## 5. UI 历史

以下文档为 **HISTORICAL**，用于解释当前门户视觉演进，不是当前业务真值：

- [Gate 2 UI redesign v1](ui/GATE2_UI_REDESIGN.md)；
- [Gate 2 UI redesign v2](ui/GATE2_UI_REDESIGN_V2.md)；
- [Teacher Portal UI v1](ui/TEACHER_PORTAL_UI_V1.md)；
- `docs/ui/images/`：当时的对比/验收图。

## 6. Demo、测试与验收

- **CURRENT** — [本地 Demo](demo/LOCAL_DEMO.md)：数据库、身份、模型、ObjectStore、启动和人工验收；
- **HISTORICAL / VERIFIED** — [Gate 2.6A Live Acceptance](verification/GATE_2_6A_LIVE_ACCEPTANCE.md)：脱敏真实 Ark 验收摘要；
- **CURRENT** — 根 README 的验证命令；
- **CURRENT** — `tests/` 和 `scripts/` 位置见仓库结构地图；
- **CURRENT** — `corepack pnpm verify:version-history`：离线核对 Commit、Merge、Tag、Gate 文档和本地链接。

## 7. 部署

- **DRAFT** — [DEPLOYMENT_READINESS_GAPS](project/DEPLOYMENT_READINESS_GAPS.md)：Gate2.10B 的 Blocker/Required/Recommended/Later；
- 当前没有生产部署手册或受支持云环境；本地 Docker 配置不能当作学校试点生产方案。

## 8. 早期架构资料

根目录五份中文文档保留历史价值：

| 状态 | 文档 |
|---|---|
| HISTORICAL | [架构红队审查与 v0.3 建议](../教育智能体平台架构红队审查与v0.3建议.md) |
| SUPERSEDED | [v0.3.1 架构修订](../教育智能体平台v0.3.1架构修订.md) |
| HISTORICAL | [v0.3.2 架构修订](../教育智能体平台v0.3.2架构修订.md) |
| HISTORICAL | [v0.3.2 勘误与 ADR 包](../教育智能体平台v0.3.2勘误与ADR包.md) |
| HISTORICAL / VERIFIED BASELINE | [第一轮工程验证计划](../教育智能体平台第一轮工程验证计划.md) |

这些文件不应被删除或改写 Git 历史；涉及当前实现时，请转到 CURRENT_ARCHITECTURE。

## 9. 维护约定

每个 verified Gate 固化时应同步：

1. 更新 VERSION_HISTORY、CHANGELOG、CURRENT_CAPABILITIES 和功能矩阵；
2. 把 Gate 文档状态从待验收改为 verified，并记录 PR/Merge/Tag；
3. 运行 `corepack pnpm verify:version-history`；
4. 如架构、仓库位置或部署差距改变，同步对应 CURRENT 文档；
5. 未来计划必须标 DRAFT，不能在 CURRENT 能力中写成已实现。
