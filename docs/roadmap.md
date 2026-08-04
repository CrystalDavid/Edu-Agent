# Edu-Agent Roadmap

> 状态：CURRENT ROADMAP
> 产品基线：Gate 2.10A / `gate-2-10a-verified`

本文只描述尚未完成的未来工作。当前已经具备的能力以 [当前能力](capabilities.md) 为准，历史阶段以 [版本历史](version-history.md) 为准。

## 近期：完成仓库治理审查

- 人工审查仓库清理、文档重组、Demo/Test Fixture 分离和稳定命令入口；
- 确认 43 个历史 Migration、业务流程、开发数据库和 LocalObjectStore 均未被改变；
- 合并清理 PR 后保持 `main`、文档和 GitHub 同步；
- 这项工作不是产品 Gate，不创建 Verified Gate Tag。

## 下一产品阶段：Gate 2.10B 云部署与小范围试点

Gate 2.10B 尚未开始。进入实施前需要产品所有者确认试点范围、云平台、Identity Provider、数据类别、供应商与运维责任。最小方向包括：

1. 正式 OIDC、域名、HTTPS、Cookie/Origin/CSRF 与反向代理边界；
2. 云 Secret 管理、轮换和最小权限；
3. 托管 PostgreSQL、独立 migration/app/worker role、备份与恢复演练；
4. ObjectStore Port 的云 Adapter、私有 bucket、tenant key、加密与 orphan cleanup；
5. 一次性 Migration job、发布锁、forward-fix 和升级库验证；
6. 结构化脱敏日志、指标、告警、trace correlation 和预算监控；
7. CSP、安全 Header、限流、依赖/镜像扫描和错误信息控制；
8. staging 远程 E2E、容量/延迟基线、故障降级和发布/回滚 Runbook；
9. 试点隐私、DPA、保留、访问、支持和事件响应流程。

完整 blocker/required 清单见 [部署就绪差距](operations/deployment-readiness-gaps.md)。该文档是规划输入，不是部署授权。

## Gate 2.10B 之后的候选方向

候选方向需要重新排序和独立 Gate，不因目录或已有 Mock 自动进入实施：

- 学生端真实身份、提交与反馈闭环；
- 家长端最小信息边界；
- 完整考试、题库和教师评测流程；
- 多模态文件理解、OCR 和受控文件入模；
- 第二模型 Provider、Provider routing 和故障切换；
- Phase 6 已建立 MemoryCandidate、过期/拒绝/撤销和教师确认边界；在试点启用前仍需前向 Migration、PostgreSQL Adapter、明确同意交互和数据治理；
- 更完整 school admin、邀请、MFA/SCIM 和治理 Worker。

## 明确不做的“捷径”

- 不把本地 Demo 直接暴露到公网；
- 不在 production 缺配置时回退 Local Identity、Mock Model 或 Demo bypass；
- 不用跨 Schema SQL 加速产品开发；
- 不合并或重写历史 Migration；
- 不在没有产品需求时预建插件、多 Agent 或永久 learner profile；
- 不把页面高保真或 synthetic 数据解释为真实试点完成。
