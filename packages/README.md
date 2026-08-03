# Shared Packages

| Package | 允许内容 | 禁止内容 |
|---|---|---|
| `@edu-agent/contracts` | Web/API 共享 route、DTO、enum、Zod Schema | Repository、UI、数据库 SDK |
| `@edu-agent/test-fixtures` | Gate 1A/1B 等测试专用构造器 | 产品运行时依赖、正式应用入口 |

匿名样例位于 `environments/sample-data`，不属于产品共享包。依赖方向：`apps/*` 可依赖 contracts；API 的本机 Seed 可依赖 sample-data；tests 可依赖三者；sample-data 不依赖 test-fixtures，产品不得依赖 test-fixtures。
