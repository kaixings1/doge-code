---
name: release
description: 通用发布助手 — 分析仓库发布规则，缓存到 .omc/RELEASE_RULE.md，然后指导发布流程。
level: 3
---

# 发布技能

一个轻量、能感知仓库情况的发布助手。首次运行时，它会检查项目与 CI 来推导出发布规则，把这些规则存入 `.omc/RELEASE_RULE.md` 供以后使用，然后依据这些规则带你走完一次发布流程。

## 用法

```
/oh-my-claudecode:release [version]
```

- `version` 是可选的。如果省略，技能会主动询问。可接受 `patch`、`minor`、`major`，或像 `2.4.0` 这样明确的语义化版本号。
- 加上 `--refresh` 可以强制重新分析仓库，即使已经存在缓存的规则文件。

## 执行流程

### 第 0 步 — 加载或构建发布规则

检查 `.omc/RELEASE_RULE.md` 是否存在。

**如果它不存在（或者传入了 `--refresh`）：** 执行下面完整的仓库分析，并写入该文件。

**如果它确实存在：** 读取该文件。然后做一次快速的差异检查 — 扫描 `.github/workflows/`（或同等的 CI 目录：`.circleci/`、`.travis.yml`、`Jenkinsfile`、`bitbucket-pipelines.yml`、`gitlab-ci.yml`），看是否有任何文件的修改时间晚于规则文件里的 `last-analyzed` 时间戳。如果相关的工作流文件发生了改动，就重新执行这些部分的分析并更新该文件。报告发生了什么变化。

---

### 第 1 步 — 仓库分析（首次运行或 --refresh）

检查仓库并回答以下问题。把答案写入 `.omc/RELEASE_RULE.md`。

#### 1a. 版本来源

- 找出所有包含版本字符串的文件，这些字符串要与 `package.json` / `pyproject.toml` / `Cargo.toml` / `build.gradle` / `VERSION` 文件 / 等处的当前版本一致。
- 列出每个文件，以及用来定位版本号的字段或正则表达式模式。
- 检测是否存在发布自动化脚本（例如 `scripts/release.*`、`Makefile release` 目标、`bump2version`、`release-it`、`semantic-release`、`changesets`、`goreleaser`）。

#### 1b. 注册表 / 分发

- npm（`package.json` 带 `publishConfig`，或 CI 里的 `npm publish`）、PyPI（`pyproject.toml` + `twine`/`flit`）、Cargo（`Cargo.toml`）、Docker（`Dockerfile` + 推送步骤）、GitHub Packages、其它。
- 是否存在一个在推送标签时自动发布的 CI 步骤？是哪个工作流文件、哪个任务？

#### 1c. 发布触发方式

- 判断是什么启动了发布：推送标签（`v*`）、手动触发（`workflow_dispatch`）、合并到 main/master、合并发布分支、某种提交信息模式。

#### 1d. 测试门禁

- 判断测试命令是什么，以及它在 CI 中的哪个环节运行。
- 发布前是否要求测试必须通过？记录任何绕过用的标志。

#### 1e. 发布说明 / 变更日志

- 是否存在 `CHANGELOG.md` 或 `CHANGELOG.rst`？
- 使用哪种约定：Keep a Changelog、Conventional Commits、GitHub 自动生成，还是没有？
- 是否存在一个在打标签之前就已提交的发布正文文件（例如 `.github/release-body.md`）？

#### 1f. 首次使用检查

- `.github/workflows/`（或同等位置）中是否存在发布工作流？如果没有，请指出并主动提出生成一个脚手架。
- 是否有 `.gitignore` 条目阻止构建产物被提交？如果没有，请指出来。
- 是否在使用 git 标签？运行 `git tag --list` 来检查。如果没有任何标签，请指出来并解释最佳实践。

---

### 第 2 步 — 写入 `.omc/RELEASE_RULE.md`

按以下结构创建或覆盖该文件：

```markdown
# 发布规则
<!-- last-analyzed: YYYY-MM-DDTHH:MM:SSZ -->

## 版本来源
<!-- list of files + patterns -->

## 发布触发方式
<!-- what kicks off the release -->

## 测试门禁
<!-- command + CI job name -->

## 注册表 / 分发
<!-- npm, PyPI, Docker, etc. + CI job that publishes -->

## 发布说明策略
<!-- convention + files -->

## CI 工作流文件
<!-- paths to relevant workflow files -->

## 首次配置缺口
<!-- any missing pieces found during analysis, or "none" -->
```

---

### 第 3 步 — 确定版本号

如果用户提供了版本号参数，就用它。否则：

1. 显示当前版本（取自主要的版本文件）。
2. 显示 `patch`、`minor` 和 `major` 分别会得到什么版本号。
3. 询问用户要用哪一个。

校验所选版本号是合法的语义化版本字符串。

---

### 第 4 步 — 发布前检查清单

展示一份依据发布规则推导出的检查清单。至少包括：

- [ ] 本次发布计划包含的所有改动都已提交并推送
- [ ] 目标分支上的 CI 是绿色通过状态
- [ ] 本地测试通过（运行测试门禁命令）
- [ ] 版本号已更新到所有版本来源文件
- [ ] 发布说明 / 变更日志已准备好（见第 5 步）

在继续之前请用户确认，或者如果用户说“继续吧”，就逐项执行每一步。

---

### 第 5 步 — 发布说明指导

帮助用户写出好的发布说明。按仓库使用的约定来执行。当没有检测到任何约定时，使用以下默认指导：

**什么样的发布说明才算好：**
- 开头先讲**用户能感知到的变化**，而不是内部实现细节。
- 按类型分组：`New Features`、`Bug Fixes`、`Breaking Changes`、`Deprecations`、`Internal / Chores`。
- 每个条目：一句话，附上 PR 或 issue 链接，如果贡献者来自外部就注明其姓名。
- **破坏性变更**要放在最前面，并且必须包含迁移方案。
- 省略用户永远看不到的改动（重构、CI 调整、仅测试相关的改动），除非它们影响构建的可复现性。

**条目格式示例：**
```
### 缺陷修复
- 修复令牌过期时会话掉线的问题（#123）— @contributor
```

如果仓库使用 Conventional Commits，就用 `git log <prev-tag>..HEAD --no-merges --format="%s"` 按提交类型分组生成一份变更日志草稿。把它展示给用户，让他们编辑。

---

### 第 6 步 — 执行发布

依据发现的规则，逐步执行：

1. **更新版本号** — 应用到每个版本来源文件。
2. **运行测试** — 执行测试门禁命令。
3. **提交** — `git add <version files> CHANGELOG.md`，并用 `chore(release): bump version to vX.Y.Z` 作为提交信息提交。
4. **打标签** — `git tag -a vX.Y.Z -m "vX.Y.Z"`（推荐使用附注标签，而不是轻量标签）。
5. **推送** — `git push origin <branch> && git push origin vX.Y.Z`。
6. **CI 接手** — 如果发布触发方式是推送标签，提醒用户后续由 CI 处理（发布、创建 GitHub Release）。展示预期的 CI 工作流文件。
7. **手动发布** — 如果不存在任何 CI 自动化，列出手动发布命令（例如 `npm publish --access public`、`twine upload dist/*`）。

---

### 第 7 步 — 首次配置建议

如果在第 1f 步发现了缺口，提供具体的帮助：

**没有发布工作流：**
> 你的仓库没有发布 CI 工作流。在推送 `v*` 标签时触发的 GitHub Actions 工作流是最常见的最佳实践。它可以：
> - 运行测试
> - 发布到 npm/PyPI/等
> - 用你的发布说明创建 GitHub Release
>
> 要我按你的技术栈生成一个 `.github/workflows/release.yml` 脚手架吗？

**没有 git 标签：**
> 这看起来是第一次发布。git 标签能让 GitHub、npm 和其它工具理解你的版本历史。我们会在第 6 步创建你的第一个标签。

**构建产物未加入 gitignore：**
> 构建产物存在于 git 历史中，或者未被 gitignore 忽略。这会撑大仓库体积并造成合并冲突。要我把它们加进 `.gitignore` 吗？

---

### 第 8 步 — 验证

推送之后：
- 检查 CI 状态：`gh run list --workflow=<release workflow> --limit=3`（如果 `gh` 可用）。
- 过几分钟后到注册表（npm、PyPI）检查新版本。
- 确认 GitHub Release 已创建：`gh release view vX.Y.Z`。

报告成功，或指出任何失败。

---

## 注意事项

- 本技能**不会**硬编码任何项目专属的版本文件或命令。一切都通过检查仓库推导得出。
- `.omc/RELEASE_RULE.md` 是本地缓存。如果你想和团队共享推导出的规则，就把它提交到仓库；如果你希望它只留在本地，就把它加进 `.gitignore`。
- 对于复杂的 monorepo 或多包工作区，本技能会检测工作区模式（npm workspaces、pnpm workspaces、Cargo workspace）并相应调整。
