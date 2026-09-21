# 修复 Issue 命令

并行地诊断、复现并（在可复现时）修复未关闭的 GitHub issue —— 每个都在自己干净的 worktree 中进行，构建产物通过符号链接复用，因此无需重新编译。

## 参数

- `$ARGUMENTS` —— 可选。可以是：
  - 以空格或逗号分隔的 issue 编号 / URL 列表，**或**
  - GitHub 搜索限定符（`is:open`、`label:bug`、`author:foo`……）和/或相对时间窗口，如 `3d`、`2w`、`12h`。

如果没有传入任何 issue 和标志，默认处理**过去 3 天内创建的所有未关闭 issue**。

## 步骤

### 1. 确定 issue 集合

解析 `$ARGUMENTS`。

- 如果给出了明确的 issue 编号/URL，原样使用。
- 否则调用 `github` 工具，`op: search_issues`。默认（无参数）：

  ```
  github { op: "search_issues", query: "is:open", since: "3d", limit: 50 }
  ```

  用户提供的限定符原样通过 `query` 传递（如果尚未包含 `is:open`，则与之组合）。用 `since` 指定时间窗口（`3d`、`2w`、`12h`、ISO 日期 —— 见 `github` 工具文档）；仅当用户明确要求最近被修改过的 issue 时，才把默认的 `created` 改为 `dateField: "updated"`。

在分派前打印确定下来的集合，以便用户确认范围。

### 2. 每个 issue 分派一个子代理

使用 **`task` 并行子代理** —— 每个 issue 一个任务。把 issue 编号、标题、正文摘要以及下面的工作流传下去作为任务。子代理在隔离环境中工作；仅当两个 issue 明显触及同一文件时才通过 `irc` 协调。

每个子代理**必须**严格遵循此工作流：

#### a. 阅读全部内容

1. 读取 `issue://<N>`（跨仓库时用 `issue://<owner>/<repo>/<N>`）—— 拉取 issue 正文和评论；评论往往包含真正的复现步骤和修复线索。仅当你明确想跳过评论时才追加 `?comments=0`。
2. 用 `gh search prs` 搜索该 issue 编号，看是否已有修复在推进中。
   - 如果已存在 PR 且看起来合理 → 切换轨道：按 `.omp/commands/review-prs.md` 审查该 PR，并以 `existing-pr` 上报。**不要**开启一个竞争的修复。

#### b. 诊断并尝试复现 —— **在当前 cwd，基于 `main`**

在触碰任何 worktree **之前**，先在**这里**复现。目的是在投入修复分支之前，确认该 bug 在当前 main 上确实存在。

1. 在此检出中阅读相关源码路径。对失败形成一个具体的假设（一两句话）。
2. 在 bug 所在的包下写一个聚焦的测试文件。命名：`repro-issue-<N>-<slug>.test.ts`（或 `.rs` 等）—— 唯一、可 grep、可删除。
3. **只运行该测试文件**，而非整个测试套件。确认它因 issue 中所述的原因而失败。

结果：
- **已复现** → 继续到 (c)。
- **未复现** → 停止。删除测试文件。以 `unreproduced` 上报：尝试过的假设、它未失败的证据，以及需要什么信息才能推进（版本、OS、配置、作者的复现片段）。**不要**创建 worktree 或提交。
- **超出范围 / 不是 bug**（例如用户配置错误、预期行为、重复）→ 停止。以 `not-a-bug` 上报，并给出适合发布到该 issue 的解释。

#### c. 基于 main 创建 worktree

仅在确认本地复现之后：

```bash
MAIN="$(git rev-parse --show-toplevel)"
ENC="$(printf '%s' "$MAIN" | sed 's|[/\\:]|-|g')"
WT="$HOME/.omp/wt/${ENC}/fix-issue-<N>"

git -C "$MAIN" fetch origin main
git -C "$MAIN" worktree add -B "fix/issue-<N>" "$WT" origin/main
```

分支命名：`fix/issue-<N>`（如果要开多个则用 `fix/issue-<N>-<slug>`）。路径位于 `~/.omp/wt/<encoded-main-path>/...` 下，与 `pr_checkout` 使用的约定一致。

#### d. 符号链接构建产物

从新 worktree 中，把 `$MAIN` 的构建输出链接过来，以便 `bun check` / `cargo build` / 原生加载器跳过重新构建：

```bash
cd "$WT"
ln -snf "$MAIN/target"       "$WT/target"
ln -snf "$MAIN/node_modules" "$WT/node_modules"

# Only the .node binaries are expensive to rebuild. The rest of
# packages/natives/native/ is tracked by git, so folder-level symlinks would
# shadow real source files and break the fix.
for f in "$MAIN"/packages/natives/native/*.node; do
  [ -e "$f" ] && ln -snf "$f" "$WT/packages/natives/native/"
done
```

使用绝对路径 —— worktree 位于主检出之外。

#### e. 移入复现测试并修复

1. 把失败的测试文件从主检出**移动**（而非复制）到 worktree 内的相同路径。从 main 中删除它，让原始 cwd 保持干净。
2. 确认它在 worktree 中的当前分支上仍然失败。
3. 在源码中实现修复。匹配既有模式（见 `AGENTS.md`）；在源头修复，而非修复表象；不要在产品代码中添加桩或 mock。
4. 反复运行复现测试直到通过。
5. 当修复改变了真实契约（而非仅仅是管道）时，添加或调整相邻的单元/契约测试。**只**运行受影响的测试文件；子代理不得运行完整测试套件。
6. 对所有编辑过的文件运行 `bun fmt`。

#### f. 提交

约定式提交，每个提交一个逻辑变更，并包含 `Fixes #<N>`：

```bash
git add -A
git commit -m "fix(<scope>): <one-line summary>

<short body explaining root cause and the fix>

Fixes #<N>."
```

**不要**推送。由人类推送 / 开启 PR。

#### g. 上报

每个子代理返回一份简短的结构化报告：

```
Issue #<N>  <title>
Status:    fixed | unreproduced | not-a-bug | existing-pr (#<M>)
Repro:     <test path inside worktree>            (if applicable)
Worktree:  ~/.omp/wt/.../fix-issue-<N>            (if created)
Branch:    fix/issue-<N>                          (if created)
Commits:   <shas + one-liners>                    (if any)
Notes:     <root cause in one sentence; or what info is missing>
```

### 3. 汇总

所有子代理完成后，打印一张汇总表：

```
| # | Title | Status | Branch / Notes |
|---|-------|--------|----------------|
```

按状态分组列出 worktree 路径（`fixed` 在前），以便用户一次性 `cd` 并推送已就绪的那些。

## 规则

- **必须**在创建任何 worktree **之前**，在当前 cwd 基于 `main` 复现。未确认复现前不得创建 worktree。
- **必须**使用并行子代理 —— 每个 issue 一个。
- **必须**先检查是否已有 PR；如果已存在且合理，转向 `review-prs` 流程，而不是重复劳动。
- **必须**在 worktree 中运行任何构建/测试之前，符号链接 `target`、`node_modules` 和原生 `*.node` 二进制。**绝不可**符号链接整个 `packages/natives/native/` 目录，那会遮蔽被 git 跟踪的源文件。
- **必须**使用约定式提交，并在正文中包含 `Fixes #<N>`。
- **绝不**推送、开启 PR 或评论 issue。交付由人类处理。
- **绝不**把桩、mock 当作产品代码，或 "TODO: implement" 占位符作为修复交付。
- **绝不**扩大范围：修复所报告的 bug，而非相邻的代码坏味道。
- 如果复现失败，在结束前从 cwd 删除临时测试文件 —— 保持原始检出干净。
