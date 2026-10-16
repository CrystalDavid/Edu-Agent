# 共享包

| Package | 用途 | 使用方 |
| --- | --- | --- |
| [@edu-agent/contracts](contracts/) | 路由、DTO、枚举和 Zod Schema | Web、API 与测试 |
| [@edu-agent/sample-data](sample-data/README.md) | 匿名学校、课程、课时与稳定引用 | 示例 Seed 与测试 |
| [@edu-agent/test-fixtures](test-fixtures/) | 测试场景构造器 | 自动化测试 |

在仓库根目录执行 `corepack pnpm install --frozen-lockfile` 安装 workspace 依赖，执行 `corepack pnpm build` 构建各包。

应用共享协议集中在 `contracts`；样例载入由 `scripts/sample` 组织，测试场景由测试代码创建。详细依赖关系见 [架构](../docs/architecture/README.md)。
