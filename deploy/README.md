# Deployment

此目录是正式部署资源的唯一入口。当前仓库尚未提交任何声称可直接用于学校生产环境的云配置。

进入 Gate 2.10B 后，OIDC、托管 PostgreSQL、云 ObjectStore、Secret 管理、HTTPS、备份恢复、监控告警和远程验收配置应在此目录按环境分层；不得复用 `environments/local/` 的凭据、Volume 或样例数据。

