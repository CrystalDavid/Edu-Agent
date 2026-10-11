# Gate 2.10B 前部署就绪差距

> 状态：CURRENT GAP ANALYSIS
> 基线：`gate-2-10a-verified`
> 当前定位：普通教师端本地功能型 MVP，尚未达到云端学校试点生产条件。

本文按代码现状列出从“本地功能型 MVP”到“小范围教师试点”的缺口。它不是云供应商选择或部署授权；Gate 2.10B 仍需独立设计、环境和产品所有者决策。

## 1. Blocker — 没有这些不能接入真实教师/学校数据

| 差距 | 当前代码事实 | Gate 2.10B 最小交付 / 退出条件 |
|---|---|---|
| 正式 OIDC Provider | provider-neutral OIDC Adapter、PKCE/state 和 Session 已实现；本地使用合成 Local Identity | 选定受信 IdP；登记 redirect/logout URI；配置 issuer/client；验证 key rotation、失效、停用 Membership；生产缺配置继续 fail closed |
| 域名、HTTPS 与同源边界 | 当前只验证 localhost；Session production 要求 Secure cookie | 正式域名、TLS 自动续期、可信反向代理配置；明确 Web/API 同源或 CORS；验证 Origin/CSRF、callback 和 forwarded headers |
| Secret 管理 | `.env.local` 仅适合本机；Secret scan 禁止提交 | 使用云 Secret Manager/部署平台 Secret；最小权限、轮换、审计；Ark/OIDC/DB key 不进入 image、bundle、日志或 IaC state 明文 |
| 托管 PostgreSQL 与受限角色 | 当前 Docker PostgreSQL 18；已区分 app/worker/migration owner | 选定兼容版本；TLS 连接；独立 migration/app/worker roles；连接池上限；两所合成学校远程隔离测试；应用不使用超级用户 |
| 云 ObjectStore | 当前 Adapter 是本机 `.local-data/object-store` | 实现同一 ObjectStore Port 的云 Adapter；私有 bucket、tenant-scoped key、加密、授权下载、大小/MIME/hash、补偿和 orphan cleanup；迁移/回滚方案 |
| Migration 发布机制 | 43 个前向 Migration 在本地 CLI 执行 | 发布前备份；一次性受限 migration job；checksum/owner 验证；并发部署锁；失败停止与 forward-fix runbook；空库与升级库 staging 验证 |
| 备份与恢复 | 本地 Volume/文件没有生产 RPO/RTO | 定义 RPO/RTO；数据库 PITR/快照；ObjectStore versioning/retention；执行一次隔离恢复演练并验证 DB-object binding 一致性 |
| 安全日志、指标和告警 | 有业务 Audit、安全事件和安全模型摘要；无生产 metrics/alerting pipeline | 结构化脱敏日志、request/trace correlation、API/Worker/DB/ObjectStore/OIDC/Ark 指标；错误率、租约堆积、登录异常、预算告警；验证 Secret/content 不被采集 |
| 生产安全基线 | Express 禁用 x-powered-by、写请求校验 Origin/CSRF；未见统一 CSP/Helmet/rate limiter | CSP、安全 Header、HSTS、body/upload 限制、登录/API/下载/模型限流、依赖/镜像扫描、cookie/domain/proxy tests、错误页不泄漏内部信息 |
| 隐私与数据处理批准 | 代码有合成数据断言与治理请求记录，但无试点协议 | 明确数据类别、目的、保留、访问、模型传输、供应商 DPA、事件响应；试点仅使用获批数据；教师/学校确认使用范围 |

## 2. Required — 可上线前必须完成，但可与 Blocker 并行

| 差距 | 当前代码事实 | 最小退出条件 |
|---|---|---|
| 邮件邀请 / 首次进入 | 有预配置成员、external subject binding 和 invitation foundation；无邮件基础设施 | 最小一次性 invitation delivery、到期/撤销/审计；不允许客户端选择提权角色；或试点期明确采用管理员预配置且形成操作 runbook |
| 数据导出和去标识 Worker | Governance 仅记录 request | 审批、租约 Worker、跨模块清单、不可删除历史规则、导出加密/过期、安全下载、失败重试和完成 Audit |
| 远程 E2E | Playwright/PostgreSQL/Fake OIDC 在本机隔离环境运行 | staging 域名上跑登录、workspace、跨校隔离、备课、文件、作业、反思、Todo；测试租户与 ObjectStore 独立且可清理 |
| 发布/回滚 Runbook | 当前命令面向本地 demo | 版本化 artifact/image、健康检查、migration 先后顺序、worker drain、回滚限制、forward fix、状态页和负责人 |
| 支持与问题处理 | 无试点支持流程 | 试点联系人、严重度、响应目标、脱敏诊断收集、身份/文件/模型/数据事件升级路径 |
| 容量与性能基线 | 只有 bundle analysis 和功能测试 | 定义试点用户/课程/文件/模型并发；API p95、Worker lag、DB pool、upload/download、Ark timeout/预算压测；记录上限与降级行为 |
| 供应商/网络失败降级 | 模型失败可恢复；本地存储/DB 单机 | 远程验证 OIDC、Ark、DB、ObjectStore 故障；业务事实先提交；教师能看到安全原因、重试/恢复；不静默回 Mock |
| 生产配置校验 | Ark/OIDC/local guards 已有，但无统一部署 manifest | 启动前 schema 校验所有必需变量；environment matrix；禁止 demo bypass/debug content/insecure cookie；配置摘要不含值 |

## 3. Recommended — 小范围试点可控后尽快完成

| 差距 | 建议 |
|---|---|
| 可观测性仪表盘 | 建 API latency/error、DB pool、Outbox lag、ModelExecution 状态/成本、ObjectStore error、auth deny/session 指标面板 |
| 自动依赖与容器更新 | lockfile 审计、SBOM、Dependabot/Renovate 等价机制、镜像 CVE 阈值和升级验证 |
| CSP 报告与前端错误采集 | 先 report-only 校准，再 enforce；浏览器错误只采 refs/stack/hash，不采教师内容或 token |
| 数据保留任务 | 对 Session/OIDC state/live debug/report/orphan object 制定过期；业务/Audit/Evidence 依据政策保留 |
| 管理员操作保护 | 高风险成员停用、角色/Course access 变更增加确认、原因和变更通知；持续验证 school scope |
| Bundle 与首屏 | 建立 gzip/brotli 预算、分路由 chunk 和真实网络性能基线；当前约 256 KiB gzip 只是构建快照 |
| 可访问性和浏览器矩阵 | 对登录、工作台、文件下载、作业批改等关键链做键盘/对比度/屏幕阅读器与受支持浏览器验证 |
| 试点数据 Seed/导入 | 设计受审计的最小学校/CourseRun 初始化；禁止把开发合成 seed 当正式导入工具 |

## 4. Later — 不阻塞首个受控教师试点

- 多区域容灾与主动—主动；
- 企业级 SCIM、MFA 策略中心和多 IdP；
- 完整学校组织树、排课、人事与管理员后台；
- 外部 Google/Outlook/学校日历；
- 云端多供应商模型路由；
- 正式学生/家长身份与独立门户；
- 完整考试系统、计费、跨校集团管理；
- OCR、多模态文件/课堂分析。

## 5. Gate 2.10B 推荐最小范围

Gate 2.10B 应聚焦“受控的单环境小范围教师试点”，不增加业务模块：

1. 选定一个 OIDC、一个托管 PostgreSQL、一个私有 ObjectStore 和一个部署运行平台；
2. 配置域名/HTTPS/Secret/受限角色和 migration job；
3. 完成生产配置 fail-closed、安全 headers/限流、日志/指标/告警；
4. 完成数据库与对象备份恢复演练；
5. 实现/验证数据治理 request worker 和试点支持 runbook；
6. 在 staging 用两所合成学校跑完整远程 E2E；
7. 完成容量基线、安全检查和试点准入评审后，才允许极小范围真实教师使用。

## 6. 明确不是 Gate 2.10B Blocker 的产品扩展

考试闭环、学生/家长端、多模态、第二模型、外部日历、完整组织树和多 Agent 都不应为了“云部署”顺带加入。它们会扩大数据、权限与运维面，应在试点基线稳定后独立决策。
