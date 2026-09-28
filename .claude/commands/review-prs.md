# 审查 PR 命令

并行地对新到的拉取请求做分诊：决定哪些值得合并、准备干净的已 rebase 工作树、修复阻塞项，并把它们交回来供人工合并。

## 参数

- `$ARGUMENTS` —— 可选。可以是：
  - 以空格或逗号分隔的 PR 编号 / URL 列表，**或**
  - GitHub 搜索限定符（`is:open`、`author:foo`、`label:bug`、`draft:false`……）和/或相对时间窗口，如 `3d`、`2w`、`12h`。

如果没有传入任何 PR 和标志，默认处理**过去 3 天内创建的所有未关闭 PR**。

## 步骤

### 1. 确定 PR 集合

解析 `$ARGUMENTS`。

- 如果给出了明确的 PR 编号/URL，原样使用。
- 否则调用 `github` 工具，`op: search_prs`。默认（无参数）：

  ```
  github { op: "search_prs", query: "is:open", since: "3d", limit: 50 }
  ```

  用户提供的限定符原样通过 `query` 传递（如果尚未包含 `is:open`，则与之组合）。用 `since` 指定时间窗口（`3d`、`2w`、`12h`、ISO 日期 —— 见 `github` 工具文档）；仅当用户明确要求最近被修改过的 PR 时，才把默认的 `created` 改为 `dateField: "updated"`。

在分派前打印确定下来的集合，以便用户确认范围。

### 2. 每个 PR 分派一个子代理

使用 **`task` 并行子代理** —— 每个 PR 一个任务。把 PR 编号、head ref、作者以及下面的工作流传下去作为任务。每个子代理在隔离环境中工作；仅当 PR A 上的修复会明显与 PR B 冲突时，才通过 `irc` 协调。

每个子代理**必须**严格遵循此工作流：

#### a. 阅读并决策

1. 读取 `pr://<N>`（默认含评论；追加 `?comments=0` 可跳过）以及 `pr://<N>/diff` 获取变更文件列表 —— 需要完整统一 diff 时用 `pr://<N>/diff/all`，或 `pr://<N>/diff/<i>` 获取单个文件切片。
2. 检查 `git log origin/main` 和 `gh search prs`，看同样的变更是否已经落地。
3. 归入以下类别之一：
   - **slop** —— AI 生成的噪音、损坏、偏离规格，或净负面。丢弃，写 1-2 行理由，不检出。
   - **superseded** —— 已在 main 中或由更新的 PR 修复/合并。丢弃并给出指向。
   - **worthy** —— 继续处理。

任何含糊不清的都默认为 `worthy` —— 让人类在真实分支上决定。

#### b. 检出到 worktree

```bash
gh_PR=<NUMBER>
# pr_checkout creates ~/.omp/wt/<encoded-repo>/pr-<N>/ and configures push remote
```

使用 `github pr_checkout` 工具，**不是**原生的 `gh pr checkout`。前者会给出一个专用 worktree，并为后续的 `pr_push` 接好线。

#### c. 符号链接构建产物（跳过原生重新编译）

从新 worktree 内部，把主检出的重构建输出链接过来，以便 `bun check` / `cargo build` / 原生加载器不必重新编译：

```bash
MAIN="<absolute path to main worktree, e.g. ~/Projects/pi>"
WT="$(pwd)"

# Rust target dir + JS deps (root-level in this monorepo)
ln -snf "$MAIN/target"        "$WT/target"
ln -snf "$MAIN/node_modules"  "$WT/node_modules"

# Prebuilt native addon (avoids 30s+ napi-rs rebuild). Link only the .node
# binaries — the rest of packages/natives/native/ is tracked by git, so
# folder-level symlinks would shadow PR-modified files and break review.
for f in "$MAIN"/packages/natives/native/*.node; do
  [ -e "$f" ] && ln -snf "$f" "$WT/packages/natives/native/"
done
```

在 `pr_checkout` 之前从原始 cwd 解析 `$MAIN`（`git rev-parse --show-toplevel`）。符号链接中使用绝对路径；worktree 位于主仓库之外，相对路径会失效。

#### d. Rebase 到 main 上

```bash
git fetch origin main
git rebase origin/main
```

如果 rebase 出现冲突：
- 解决纯机械性的冲突（格式、导入顺序、相邻行编辑）并继续。
- 任何语义性的 → 中止 rebase，在最终报告里留一条备注，不提交。

#### e. 审查并修复关键问题

在 worktree 内部，以下述视角审查 diff：正确性、安全性、回归、破坏性变更影响、新路径的测试覆盖。

只修复**阻塞合并**的东西：构建/测试破损、PR 引入的明显 bug、PR 自身目标所要求的边界情况处理缺失。**不要**出于审美重写、重构无关代码或扩大范围。

对每个修复：
- 先阅读既有模式；匹配仓库约定（见 `AGENTS.md`）。
- 为实际行为变更添加或更新测试。
- 只运行受影响区域的定向测试文件。子代理不得运行项目级测试。

最后对你编辑过的文件集合运行 `bun fmt` 做格式/lint。

#### f. 提交

在已 rebase 的 PR 分支之上，每个逻辑修复一个约定式提交：

```bash
git add -A
git commit -m "fix(<scope>): <what & why>

Addresses review feedback on #<PR>."
```

**不要** amend PR 作者的提交。**不要**推送 —— 由人类合并。

#### g. 上报

每个子代理返回一份简短的结构化报告：

```
PR #<N>  <title>
Decision: worthy | slop | superseded
Worktree: ~/.omp/wt/.../pr-<N>   (or: not checked out)
Rebase:   clean | conflicts (resolved | aborted: <reason>)
Fixes:    <commit shas + one-liners>   (or: none needed)
Blockers: <anything the human must decide>
```

### 3. 汇总

所有子代理完成后，打印一张汇总表：

```
| PR | Title | Decision | Rebase | Fixes | Blockers |
|----|-------|----------|--------|-------|----------|
```

随后按决策分组列出 worktree 路径，以便用户一次性 `cd` 并合并。

## 规则

- **必须**使用并行子代理 —— 每个 PR 一个 —— 而非串行循环。
- **必须**使用 `github pr_checkout`（携带推送元数据）—— 而非原生的 `gh pr checkout`。
- **必须**在 worktree 中运行任何构建/测试之前，符号链接 `target`、`node_modules` 和原生 `*.node` 二进制。**绝不可**符号链接整个 `packages/natives/native/` 目录，那会遮蔽被跟踪的 PR 变更。
- **绝不**推送或合并。由人类审查并合并。
- **绝不**扩大范围：修复仅限于此 PR diff 上的合并阻塞项。
- **绝不**对 PR 作者的历史做强制推送。
- 如果 PR 是 `slop`/`superseded`，完全跳过检出 —— 只记录决策。
