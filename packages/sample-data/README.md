# Sample data

此 workspace 包只提供匿名、可重复写入的示例学校、课程、课时和教学证据。它不包含测试断言、Fake Provider 或产品业务服务。

示例数据通过 `corepack pnpm sample:seed` 显式载入。正式部署不得自动执行该命令；生产身份和学校数据由部署环境独立配置。`apps/api` 和 `apps/web` 不得导入本 package；Seed 组合只存在于 `scripts/sample`，写入后所有读取与写入均走正式 API 和 PostgreSQL。

数据在存储层继续保留 `synthetic` 标记，以阻止它被误当作真实学校或学生数据发送给外部服务。教师界面不会显示这些工程标记。
