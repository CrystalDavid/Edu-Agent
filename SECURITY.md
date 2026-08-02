# Security Policy

Edu-Agent 当前是普通教师端本地功能型 MVP，尚未完成生产云安全基线。不要用当前 `main` 或任何本地 Demo 处理真实学校、教师、学生或家长数据。

## 报告安全问题

请优先使用 GitHub 仓库的 Private Security Advisory，或直接联系仓库所有者。不要在公开 Issue、PR、截图、日志或聊天中披露：

- API Key、OIDC Client Secret、Token、Cookie、私钥或真实 DSN；
- 可识别的学校、教师、学生或家长资料；
- 未修复漏洞的完整利用步骤；
- 模型请求/响应中的敏感上下文。

报告应尽量包含受影响 Commit、环境、最小复现、影响范围和建议缓解方式，但使用合成数据并对 Secret/身份信息脱敏。

## Secret 管理

- Git 只跟踪 `.env.example` 和 `infra/docker/.env.example`；其中只能包含安全占位或空值。
- 本机 Secret 放在被忽略的 `.env.local`；Ark Key 不得作为命令参数或写入控制台。
- 不在 Web bundle、测试 Fixture、Migration、文档、截图、Audit detail 或 Git 历史中保存 Secret。
- 提交前运行 `corepack pnpm test:secrets`，并人工检查新增配置和二进制文件。
- 发现已提交 Secret 时，先撤销/轮换，再按批准的历史清理方案处理；仅从最新 Commit 删除文件并不能使 Secret 失效。

## 关键安全边界

- 浏览器只能通过服务端 Session 和类型化 API 访问状态；不能信任客户端传入的 tenant、actor 或 role。
- 跨学校访问 fail closed，并使用不泄漏资源存在性的响应。
- 正式状态由 owning module 写入；禁止跨 Schema 直接写。
- Agent 输出默认是 Proposal/Draft，不能自动批准、确认、实施或扩大权限。
- 每次运行重新授权上下文；Audit、Authorization、Revision 和 Evidence 来源不可绕过。
- Production 缺少 OIDC、Secure Cookie 或 Provider 配置时必须拒绝启动，不能静默回 Local/Mock/Demo。
- 上传文件受大小、类型、hash、tenant key 和授权下载边界约束；当前 LocalObjectStore 仅用于本地 synthetic Demo。

更完整的当前架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，生产前差距见 [docs/operations/DEPLOYMENT_READINESS_GAPS.md](docs/operations/DEPLOYMENT_READINESS_GAPS.md)。

## 本地数据和测试隔离

- `apps/api/.demo/uploads/objects` 是长期开发 LocalObjectStore，不属于通用缓存清理目标。
- PostgreSQL 开发 Volume 与 E2E 临时 Volume 必须使用不同 Compose project/name。
- 普通测试不得调用 `db:clean` 或 `demo:reset`；破坏性重置要求显式授权保护。
- Playwright 截图、reports、database dumps 和 live model reports 默认被忽略，不作为 Secret 的安全存储位置。
- 只使用 synthetic 数据；测试结束后清理隔离的 E2E 容器、Volume 和临时对象。

## 生产支持状态

当前没有受支持的生产版本。Gate 2.10B 至少需要正式 OIDC、域名/TLS、Secret Manager、托管 PostgreSQL/ObjectStore、最小权限、备份恢复、监控告警、限流/CSP、远程 E2E、供应商/DPA 与事件响应流程。未经这些验收，不得宣称适合真实学校试点。
