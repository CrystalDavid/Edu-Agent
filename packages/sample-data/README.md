# 示例数据

提供匿名示例学校、课程、课时和教学证据，用于本地体验和测试。数据使用稳定引用，支持重复载入。

从仓库根目录运行：

```bash
corepack pnpm app:prepare
corepack pnpm sample:seed
corepack pnpm app:dev
```

也可以用 `corepack pnpm sample:dev` 一次完成准备、载入与启动。

Seed 入口位于 [scripts/sample](../../scripts/sample/)。写入 PostgreSQL 后，页面通过正式 API 读取和编辑这些内容；存储中的 `synthetic` 标记用于标识示例来源。测试构造器位于独立的 [test-fixtures](../test-fixtures/) 包。
