# Environments

此目录只放运行环境与样例数据，不放产品领域代码。

- `local/`：本机 PostgreSQL、环境检查和本地运行约定；
- `sample-data/`：可选的匿名示例课程与稳定引用，用于首次体验和自动化验证。

正式产品代码位于 `apps/` 与 `packages/`。生产部署资源位于 `deploy/`；本机运行状态统一写入仓库根目录、被 Git 忽略的 `.local-data/`。

