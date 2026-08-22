# Shared Packages

| Package | 允许内容 | 禁止内容 |
|---|---|---|
| `@edu-agent/contracts` | Web/API 共享 route、DTO、enum、Zod Schema | Repository、UI、数据库 SDK |
| `@edu-agent/sample-data` | 显式 Seed 和测试可复用的匿名稳定 refs/data | 产品运行时、测试断言、Fake behavior、生产数据 |
| `@edu-agent/test-fixtures` | Gate 1A/1B 等测试专用构造器 | 产品运行时依赖、正式应用入口 |

依赖方向：`apps/*` 只依赖正式 contracts 和产品 SDK；`scripts/sample` 与 tests 可以依赖 sample-data；tests 可以依赖 test-fixtures。sample-data 不依赖 test-fixtures，产品应用不得依赖两种 fixture package。
