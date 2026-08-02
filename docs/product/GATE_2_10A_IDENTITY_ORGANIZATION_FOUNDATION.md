# Gate 2.10A — 正式身份、学校组织与权限基线

## 1. 目标与边界

Gate 2.10A 将产品请求从浏览器提交的演示身份 Header 迁移到服务端认证会话。外部身份供应商只证明稳定的 external subject；Edu-Agent 的 Governance 模块拥有用户、学校、成员关系、角色、CourseRun 授权、会话、安全事件和数据治理请求。

本 Gate 提供可运行的本地身份 Adapter、测试用 Fake 身份路径和 provider-neutral OIDC Adapter。正式云身份供应商、邮件发送、MFA、SCIM 和生产部署留到 Gate 2.10B。

## 2. 实施裁决

1. 浏览器不再发送 `tenantRef`、`actorRef` 或角色。产品 Web 只携带服务端设置的 HttpOnly Session Cookie。
2. Session 使用随机不透明 Token；数据库只保存 SHA-256，不保存 Cookie 值、OIDC Token 或 Refresh Token。
3. 每个产品请求都重新读取 Session、Organization、Membership、RoleAssignment 和 CourseRunAccess。Membership 或学校停用后，既有 Session 立即失去产品访问权。
4. ActingContext 由服务端解析结果创建，认证方法明确区分 `server-session`、`local-identity`、`oidc`、`demo-bypass` 和隔离测试身份。
5. `x-demo-*` 仅存在于显式测试 Adapter；生产和普通产品路径不读取它。Demo bypass 默认关闭，只能在 local/demo 显式开启，并继续写 `DemoIdentityInjection` Audit。
6. 本地身份 Adapter 不实现密码。它只在 local/demo/test 中绑定预置的合成 external subject；production 缺少完整 OIDC 配置时启动失败。
7. OIDC 使用 Authorization Code + PKCE + state。短期 login state 存在 Governance Schema；Token 交换完成后只保留稳定 subject 和最小 profile，不保存 access/refresh/id token。
8. 写请求使用会话绑定的 CSRF Token；Cookie 在 production 使用 `Secure`，所有环境使用 `HttpOnly`、`SameSite=Lax`、`Path=/`。
9. Organization ref 继续作为现有业务数据的 tenant ref，使既有 Gate 数据无需改写主键即可前向映射。
10. ordinary teacher 只能进入被授权 CourseRun 范围；school admin 只拥有成员、角色、CourseRun 授权和安全 Audit 的最小管理能力，不因此取得修改教学事实的权限。

## 3. 状态所有者

| 能力 | 所有者 | 正式真值 |
|---|---|---|
| User、ExternalIdentityLink | Governance | PostgreSQL `governance` |
| School / Organization | Governance | PostgreSQL `governance` |
| Membership、RoleAssignment、CourseRunAccess | Governance | PostgreSQL `governance` |
| Session、OIDC Login State、安全事件 | Governance | PostgreSQL `governance` |
| 数据导出、删除或去标识请求 | Governance | PostgreSQL `governance` |
| CourseRun、Lesson、Assignment、Evidence | Education | 既有正式表，不复制到 Governance |
| File、Task、TeachingPlan、Reflection、Run | 各既有 owning module | 既有正式表，不建立身份副本 |

## 4. 请求链路

```text
HttpOnly Session Cookie
→ token hash lookup
→ active Session
→ active User + Organization + Membership
→ RoleAssignment + CourseRunAccess
→ server-owned TenantContext / ActingContext
→ authorization policy
→ existing owning Application Service
→ PostgreSQL / Audit / Outbox
```

跨学校资源仍由各 Repository 的 tenant 条件 fail closed；统一身份层额外检查当前 CourseRun 授权。对外不泄漏另一学校资源是否存在。

## 5. 身份 Provider

`IdentityProvider` Port 只暴露可用性、授权请求和回调后的最小身份：provider、subject、display name、email（可选）。

- `LocalIdentityProvider`：只允许合成预置身份，用于本地演示和自动化。
- `OidcIdentityProvider`：基于 `openid-client`，通过 Discovery、Authorization Code、PKCE 和 state 对接标准 OIDC。
- Fake 测试覆盖成功、无效 state、过期、供应商不可用和无成员关系；普通测试不访问公网。

## 6. 会话与工作空间

Session 保存 user、当前 membership、认证方法、到期时间、撤销时间、CSRF hash 和最小客户端安全摘要。多学校用户登录后选择 Membership；切换工作空间只更新当前 Session，并重新返回该学校的角色和 CourseRun 授权。刷新与 API 重启通过数据库会话恢复。

所有已认证写请求（包括 refresh、workspace switch 和 logout）必须同时携带允许的 Origin 与 `x-csrf-token`；服务端不使用 Cookie 值替代该 Header。Session/CSRF Cookie 必须成对且哈希匹配，畸形 Cookie 被忽略并 fail closed。

会话过期、撤销、学校停用、Membership 停用或 external identity 解绑均返回结构化 401/403。登出只撤销当前 Session，并清除 Cookie。

## 7. 演示数据迁移

前向 Seed 将 `tenant:demo-school` 映射为 School A，将 `user:teacher-001` 映射为正式 User 和 active Membership，并分配 `ordinary_teacher` 及现有 CourseRun 权限。另建立 School B、独立教师和隔离业务 Fixture；多学校合成用户拥有两个独立 Membership。既有业务 refs 保持有效，不修改已应用 Migration。

## 8. 最小管理员能力

多用户读取同时采用组织、CourseRun 和请求所有者边界：CourseRun 白名单为空时 bootstrap/TeachingPlan fail closed；Proposal 与 Runs 还必须匹配创建该请求的教师。Reflection Worker 从已封存的 ModelDataManifest 恢复 tenant，不复用 School A 常量。管理员成员写入在同一事务内保存正式 AuthorizationDecision、决策 Audit 与成员写 Audit。

School admin 可以读取当前学校、成员、角色、CourseRun 授权和安全事件；可以预配置成员及 external subject、激活/停用成员、分配允许角色并授予已有 CourseRun。所有命令使用 expected version、幂等键和 Audit。普通教师看不到或调用不了管理员命令。

本 Gate 采用“管理员预配置成员 + external subject 绑定”的首次进入方式；邮件邀请 Token 和发送基础设施推迟到 Gate 2.10B。

## 9. 数据生命周期

Governance 记录 export、de-identification 和 deletion 请求。请求不会直接删除跨模块历史：Audit、Evidence、TeachingPlan、Assignment、Reflection 和 GradeDecision 需保留引用完整性；管理员审批后由后续受控流程导出或去标识。Session 与短期 OIDC state 可按保留期清理。

| 数据 | 可导出 | 可去标识/删除 | Gate 2.10A 处理方式 |
|---|---|---|---|
| User profile、Membership、Role、Course access | 是 | Membership 可停用；profile 去标识需审批 | 登记 request，不自动执行破坏性操作 |
| Session、OIDC state | 仅安全摘要 | 可按保留期清理或立即撤销 | Token 永不入库，state 一次性使用 |
| TeachingPlan、Assignment、GradeDecision、Evidence、Reflection | 可按授权范围导出 | 不直接删除；可在保持来源链后去标识 actor | 保留教学历史和引用完整性 |
| Audit、安全事件 | 可导出安全摘要 | 依法定/学校策略保留，不由普通用户删除 | 不保存 Token、Secret 或完整 Provider payload |

## 10. API 与 Contracts

所有 DTO 使用 `packages/contracts/src/identity.ts` 的 Zod Schema，路由集中在 `apiRoutes`：

- Authentication：provider availability、session status/refresh、local login、OIDC start/callback、logout、workspace switch、active sessions、session revoke；
- Organization/Admin：current school、members、member status、roles、CourseRun access、security events；
- User governance：data export/de-identification/deletion requests。

产品 Web 统一 `credentials: include`，CSRF 值只保存在页面进程内存并与 Session hash 校验；长期 Token 不进入 localStorage、sessionStorage、URL 或 React 业务状态。

## 11. Migration

- Governance `0005_gate2_10a_identity_organization.sql`：Organization、UserAccount、ExternalIdentityLink、Membership、RoleAssignment、CourseRunAccess、AuthenticationSession、OIDC Login State、SecurityEvent、DataGovernanceRequest 和 IdentityCommand；
- Governance `0006_gate2_10a_model_data_scope.sql`：补齐 ModelDataManifest 的 organization/synthetic scope；
- 两个 Migration 均有 owner/checksum，空 Volume 可执行；旧 School A tenant/actor 通过前向 Seed 映射，既有 CourseRun、Lesson、Assignment、File、Task 和 Reflection ref 不变；
- 应用仍使用非超级用户数据库角色，未修改任何已应用 Migration。

## 12. 配置

本地：

```text
IDENTITY_PROVIDER_MODE=local
LOCAL_IDENTITY_PROVIDER_ENABLED=true
AUTH_SESSION_TTL_MINUTES=480
AUTH_SESSION_SECURE=false
WEB_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ALLOW_TEST_IDENTITY_HEADERS=false
DEMO_AUTH_BYPASS=false
```

生产必须使用 `IDENTITY_PROVIDER_MODE=oidc`，并配置 `OIDC_ISSUER_URL`、`OIDC_CLIENT_ID`、可选 `OIDC_CLIENT_SECRET`、`OIDC_REDIRECT_URI` 和 `OIDC_SCOPES`。production 自动要求 Secure Cookie，并拒绝 local identity、Demo bypass 和 test headers。

## 13. 自动化证据

- Unit：身份配置、production fail-closed、Cookie/Origin/CSRF 边界；
- PostgreSQL/HTTP：Session 创建/刷新/过期/撤销、OIDC success/state replay/invalid callback/provider unavailable/unknown subject、工作空间选择、管理员角色/CourseRun 管理、停用即时撤销和跨学校 404；
- Architecture/static：Web 不依赖 OIDC SDK、不发送 identity headers，业务模块不接触 Provider token，Product Route 只使用 server session ActingContext；
- Playwright：登录/刷新/登出、多学校选择、School B 隔离、管理员预配置/停用/启用，以及全套既有教师闭环在真实 HttpOnly local Session 下回归；
- 所有普通测试使用隔离 PostgreSQL/ObjectStore 和 Fake/Local Provider，不访问公网。

## 14. 人工验收

1. `corepack pnpm demo:dev`，未登录打开 `/overview` 应显示登录页；
2. 用普通教师登录，刷新后仍登录，侧边栏显示真实姓名、学校和角色；
3. 登出后产品 API 返回 401；重新登录后既有 Gate 数据仍存在；
4. 用多学校身份分别进入 School A/B，确认数据完全隔离且当前工作空间刷新恢复；
5. 用 School Admin 预配置合成成员、分配角色与 CourseRun、停用/启用；普通教师无管理能力；
6. 撤销另一 active Session，确认被撤销浏览器立即失效；
7. 以正式 Session 完成备课、Proposal/审批、文件下载、批改、Reflection、Todo/日历中的任一主流程；
8. 提交 export/de-identification request，确认只登记审核，不破坏历史。

## 15. 非目标

本 Gate 不实现最终云身份供应商配置、邮件或短信、MFA、SCIM、正式学生/家长身份、完整组织树、完整学校后台、云 ObjectStore、生产监控备份、计费和云部署。
