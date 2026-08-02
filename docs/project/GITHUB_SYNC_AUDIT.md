# Edu-Agent 本地与 GitHub 同步审计

> 状态：CURRENT AUDIT — cleanup branch pre-PR
> 审计日期：2026-08-02（Asia/Shanghai）
> 正式目录：`D:\03_Edu-Agent`
> GitHub：`CrystalDavid/Edu-Agent`

本审计使用 Git 对象、index、工作树、`.gitignore`、文件系统和远程 refs 交叉核对，不只依赖 `git status`。最终推送后还必须以 `corepack pnpm verify:repo-sync` 证明当前 HEAD 等于远程跟踪分支。

## 1. 分支和基线

| 项目 | 审计结果 |
|---|---|
| PR #11 | 已由 Draft 标记 Ready，并以非 squash merge 合并；未 force push、未创建 Gate Tag |
| PR #11 Merge Commit | `7a30538d4717e886521658af4121286a1ad79cbd` |
| 文档分支最后修正 | `53b808145d4edfb74d85114ff06d482b16a54b05`（修正 Migration 路径） |
| 本地 `main` | `7a30538d4717e886521658af4121286a1ad79cbd` |
| `origin/main` | 审计 fetch 后与本地 `main` 相同 |
| 清理分支 | `chore/repository-cleanup-and-reorganization`，从上述最新 `main` 创建 |
| 清理分支起点 | `7a30538d4717e886521658af4121286a1ad79cbd` |
| 清理分支最终 HEAD/upstream | 完成最终提交和首次推送后更新；推送前无 upstream 是预期临时状态 |
| 最新产品基线 | `gate-2-10a-verified` → `bbba3428602bb148a3d73a201ad97fcb29181c1b` |

`main` 在 PR #11 合并后没有未推送 Commit。远程保留多条历史 feature 分支作为审计入口；本地 `feat/gate-2-8-teacher-workbench` 相对其旧 upstream 多出的 Commit 是已经进入 `origin/main` 的 merge commit，不是遗漏的独有产品工作。

## 2. 审计方法

本轮实际核对：

- `git ls-files`、`git ls-tree`、`git cat-file` 和 Git object size；
- `git ls-files --others --exclude-standard` 的未跟踪内容；
- `git ls-files --others --ignored --exclude-standard` 的 ignored 内容；
- `git check-ignore` 的必要文件规则；
- 本地/远程 branch、upstream、ahead/behind、`main` 与 `origin/main`；
- 当前树和完整 Git 历史的大 blob；
- 二进制扩展、Git LFS 属性和 GitHub 100 MiB 风险；
- `.env*`、Key/Token/Secret 模式和 `test:secrets`；
- apps、packages、contracts、Migration、infra、scripts、tests、docs、manifest、lockfile、Docker、字体许可证和正式静态资源；
- 生成物、数据库、本地 ObjectStore、报告和个人资料的位置。

## 3. 分类结论

### A. 已正确提交并存在于远程

PR #11 合并时，正式代码/文档基线已经 clean，所有 386 个跟踪文件均可由 `origin/main` 到达。已确认以下内容存在且没有被错误忽略：

- `apps/api`、`apps/web`；
- 七模块和 43 个 SQL Migration；
- `packages/contracts` 和当时的 `packages/test-fixtures`；
- `infra/docker`、`infra/postgres`；
- `scripts` 和所有 tests；
- `docs`、根 README、CHANGELOG；
- 根/应用/package manifests、`pnpm-lock.yaml`、`pnpm-workspace.yaml`；
- `.env.example` 和 `infra/docker/.env.example`；
- `compose.postgres.yml`、Vitest/Playwright/TypeScript/Drizzle 配置；
- HarmonyOS Sans SC、Chiron GoRound TC、Nunito 字体、Attribution 和三份许可证；
- 历史 UI PNG 等正式文档静态资源。

清理分支新增的治理文档、`demo-fixtures`、verifier 和结构调整属于本轮有意变更，不是此前遗漏。

### B. 应进入仓库但此前未提交或未推送

审计开始时没有非 ignored 的未跟踪文件，也没有只存在本机、应上传但遗漏的源码、Migration、Contract、配置、文档或正式静态资源。没有发现尚未推送的独有产品 Commit。

清理分支在第一次推送前会暂时显示“无 upstream/本地有新 Commit”；这不是历史遗漏。最终必须推送并由 `verify:repo-sync` 消除该状态。

### C. 正确被忽略的本地运行内容

初始文件系统审计约有 125,413 个 ignored 文件、1.48 GiB，主要是：

| 路径 | 初始规模（约） | 结论 |
|---|---:|---|
| `node_modules/` 及 workspace 安装树 | 109,907 文件 / 1.23 GiB | 安装产物，正确 ignored |
| apps/packages 中 `dist`、`node_modules`、`*.tsbuildinfo` | 14,742 文件 / 151.8 MiB | 构建产物，正确 ignored |
| `.playwright-cli/` | 623 文件 / 49.5 MiB | 浏览器临时状态，正确 ignored |
| `output/playwright/` | 113 文件 / 18.7 MiB | 本地验收截图，正确 ignored |
| `.demo/` | 21 个直接审计对象 / 约 1.1 MiB（不含安装链接） | 日志、报告和 LocalObjectStore，正确 ignored |
| `playwright-report*/`、`test-results/` | 约 1 MiB | 可再生测试报告，正确 ignored |
| `.env.local`、`infra/docker/.env.local` | 本机配置 | 正确 ignored，禁止上传 |

`apps/api/.demo/uploads/objects` 是长期开发 ObjectStore，不属于通用缓存；本轮未删除。`output/playwright` 可能包含用户验收资料，虽然可再生且不上传，本轮也未擅自删除。

### D. 可疑地被忽略、需人工判断

在排除 node_modules、dist、reports、`.demo`、环境文件和已知缓存后，没有发现被忽略的 `.ts`、`.tsx`、`.sql`、`.md`、配置或正式静态资源。

需要人工知道但不是“.gitignore 错误”的两点：

- 仓库没有 `.github/`，因此当前没有 GitHub Actions、CODEOWNERS、Issue/PR template 或 Dependabot 配置；本轮记录缺口，不擅自启用会触发外部执行的 CI；
- `drizzle-kit` 和 `drizzle.config.ts` 没有 package script 直接调用，但可能服务手工 Migration 开发；证据不足，保留并列入后续依赖审计。

### E. 错误进入仓库的生成物、缓存、Secret 或本地状态

没有发现被跟踪的 `.env.local`、数据库数据、`.demo`、ObjectStore blob、node_modules、dist、reports、测试截图、日志、dump 或 Secret。`git ls-files -ci --exclude-standard` 为空，说明没有“已经跟踪但现在被 ignore”的遗留文件。

四张历史 UI PNG 和字体二进制是有 Attribution/历史文档用途的正式资源，不是运行缓存。默认 Playwright 原先会覆写其中一张历史图片；本轮已停止该行为，测试截图只写 ignored `output/playwright/`。

### F. 本地存在但不应上传的个人分析资料

- `C:\Users\David\Desktop\Claude-Code-repository-architecture-analysis.zh-CN.md`；
- `C:\Users\David\Documents\Codex\2026-08-02\crystaldavid-claude-code-git-https-github\work\Claude-Code` 参考仓库副本。

两者均位于 `D:\03_Edu-Agent` 外，只读用于研究；没有复制进 Edu-Agent，也不会被当前 Git 工作树发现或提交。

## 4. 大文件、二进制和 Git LFS

- 当前树最大文件是 `apps/web/public/fonts/harmonyos-sans-sc/HarmonyOS_Sans_SC.ttf`：20,617,156 bytes（约 19.7 MiB）；
- 当前树没有其他达到 10 MiB 的文件；没有达到 50 MiB 或 GitHub 100 MiB hard limit 的对象；
- 完整 Git 历史也没有达到 50/100 MiB 的 blob；
- 跟踪二进制仅为正式字体和四张历史 UI PNG；
- `.gitattributes` 没有 `filter=lfs`，当前没有必须使用 Git LFS 的文件；
- HarmonyOS 字体是唯一需要持续观察的 Git 体积项，已有 Attribution、许可证说明和 hash 记录，不应在未审查许可证/渲染影响时删除或替换。

结论：当前没有 LFS 或 GitHub 大文件阻塞；新增字体、视频、模型、数据库 dump 或大截图前必须重新评估。

## 5. Secret 检查

- 跟踪文件名中仅有安全模板 `.env.example`、字体/设计 token 名称和 Secret scanner 本身；
- 根与 Docker env example 中 Key/Client Secret 保持空值或安全占位；
- `corepack pnpm test:secrets` 在 PR #11 合并前通过（386 个跟踪文件）；
- 最终分支需在所有新文档和脚本提交后再次通过 Secret scan；
- Web bundle 仍需在 production build 后人工/脚本确认不含服务端 Secret。

## 6. 最终同步判定标准

以下条件同时满足才将清理分支判定为“已同步”：

1. 工作树无 tracked/untracked 变更；
2. 所有必要源码、文档和配置均被跟踪；
3. 没有 forbidden runtime/generated path 被跟踪；
4. 43 个 `gate-2-10a-verified` 历史 Migration 的 index blob 与 Tag 完全相同；
5. 本地 `main` 等于 `origin/main`；
6. 清理分支已有 upstream 且本地 HEAD 等于远程分支 HEAD；
7. Secret、Markdown link、version history 和 repo-sync verifier 全部通过；
8. Draft PR 已创建，未自动合并，未创建新 Gate Tag。

## 7. 当前结论

基线审计没有发现“应该上传但遗漏”的既有项目文件，也没有发现错误提交或错误忽略的源码/文档。主要仓库治理缺口是此前文档入口混乱、产品运行时依赖 test-fixtures、失效 Web 文件、测试覆写历史图片、缺少 Agent/安全/贡献指南、缺少 repo-sync verifier，以及 `.github/` 尚未建立。

本轮已处理其中所有低风险仓库内问题；`.github/`、大文件专项优化、Drizzle 工具依赖和大型代码拆分保留为后续独立审查。最终 HEAD、upstream 和 Draft PR 在推送完成后回填本节。
