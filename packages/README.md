# Shared Packages

| Package | 允许内容 | 禁止内容 |
|---|---|---|
| `@edu-agent/contracts` | Web/API 共享 route、DTO、enum、Zod Schema | Repository、UI、数据库 SDK |
| `@edu-agent/demo-fixtures` | 本地产品 Demo 和测试共用的 stable synthetic refs/data | 断言、Fake Provider、测试 runner、真实数据 |
| `@edu-agent/test-fixtures` | Gate 1A/1B 等测试专用构造器 | 产品运行时依赖、Demo 正式入口 |

依赖方向：`apps/*` 可依赖 contracts；API 的 local demo 可依赖 demo-fixtures；tests 可依赖三者；demo-fixtures 不依赖 test-fixtures，产品不得依赖 test-fixtures。
