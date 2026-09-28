# Merge 命令

完成分支上的工作：验证文档 + 工作区是干净的，合并到 main，清理。同时支持标准的 `git checkout -b` 分支和 `git worktree` 流程 —— 在预检时自动检测。

**来自用户的上下文：** $ARGUMENTS

---

## 理念

`/merge` 是一个**验证 + 交付**命令，而不是会话结束时的万事通清理。文档更新、提交和测试属于分支上的**工作会话**。当 `/merge` 运行时 —— 通常是在一个全新的 `claude` 会话中 —— 这些事应该已经做完了。此命令验证不变量、暴露违规，并在干净时交付。

经验法则：如果你想把某件事交给 `/merge` 静默修复，**停下来**，改为向用户暴露它。合并是半破坏性的；一个遗漏的文档更新或一个误提交的构建产物，事后要撤销会困难得多。

**两种场景，一个命令。** 当分支快进或在无冲突的情况下自动合并时，这就是纯粹的验证 + 交付。当 `main` 已经分叉且合并产生冲突时 —— 当重叠的分支触及相同文件时这是常态 —— 冲突解决就成了真正的工作（→ **步骤 4b**）。解决冲突**不是**"静默修复"：向用户暴露**方案决策**，然后在轨道上执行它并进行强制验证。

**最高指令（不可协商）：** 任何 `main` 已分叉的合并 —— 即 git 从双方**组合**出一棵新树时，**无论它是冲突还是在无冲突的情况下干净自动合并** —— 都必须在合并提交最终确定之前通过项目的构建/测试（→ **步骤 4c**）。最棘手的缺陷就是没有冲突标记的干净自动合并：某个引用其声明被另一方移动或删除，在各自父节点上都能编译，只在组合树中才断裂。只有构建组合树才能捕获它。（如果 `main` 已经是分支的祖先 —— 没有分叉 —— 合并树就等于分支树，已在分支上构建过；构建可跳过。）

---

## $ARGUMENTS 约定

`$ARGUMENTS` 有两种文档化的用法：

- `Verified: <context>` —— 作为 `Verified:` 行追加到合并提交中。可选加入；仅当用户传入时才包含。
  例如：`/merge Verified: integration tests pass + manual smoke check`
- `summary: <override>` —— 用作合并消息摘要，而非从 diff 合成。
  例如：`/merge summary: swap payment provider from Stripe to Adyen`

不要向用户索要验证备注。大多数合并不携带 `Verified:` 行，它是一个刻意的信号，而非勾选框。

---

## 预检

1. **检测模式。** 比较当前 git 目录与主 git 目录：
   ```bash
   git rev-parse --git-dir
   git rev-parse --git-common-dir
   ```
   - **相同** → **标准模式**（普通克隆，或本身就在主仓库中操作）。
   - **不同** → **worktree 模式**（当前目录是通过 `git worktree add` 创建的链接工作树）。

   记住这个模式 —— 它决定步骤 4（合并）和步骤 5（清理）的行为。

2. **验证分支。** 运行 `git branch --show-current`。
   - 分支是 `main` → 停止："You're on main — nothing to merge. Create a feature branch with `git checkout -b <name>` (standard mode) or run this from a worktree on the branch you want to merge (worktree mode)."
   - 否则 → 记录 `<branch>` = 当前分支名。

3. **仅 worktree 模式 —— 记录 `<main-repo-path>`：** `git worktree list` 中为分支 `main` 列出的路径。标准模式不需要这个（一切都在 cwd 中发生）。

4. **勘察分支：**
   ```bash
   git log main..HEAD --oneline
   git diff main --stat
   git log main..HEAD --name-only --format= | sort -u | cut -d/ -f1 | sort -u
   git status
   ```
   在 worktree 模式下，还要运行 `git -C <main-repo-path> status` 以发现主仓库中未提交的更改。

   第三条命令给出被触及的顶层目录 —— 这驱动步骤 2 的文档检查（以及步骤 4c 中可选的按模块构建/测试）。注意 `git diff main --stat` 的变更行数和文件数 —— 这驱动步骤 1 的分支。

5. **检测分叉、预测冲突、扫描搭便车提交**（只读 —— 在任何合并之前执行；它决定步骤 4 的走向）：
   ```bash
   # Divergence? FALSE = main composed a new tree → MANDATORY build/test (Step 4c).
   git merge-base --is-ancestor main HEAD && echo "no divergence (ff-equivalent)" || echo "DIVERGED — build/test the composed tree"
   # Dry-run the merge: see the conflict set without touching anything.
   git merge-tree --write-tree --name-only main HEAD   # exit 0 = clean → 4a; exit 1 = conflicts → 4b
   ```
   - `merge-base --is-ancestor` 成功（退出码 0）→ main 已是祖先 → **无分叉**（等价于快进）；4c 中的构建可跳过。失败（退出码 1）→ **已分叉** → 4c 为强制项。
   - `merge-tree` 退出码 **0** → 无冲突（步骤 4a）。退出码 **1** → 首行（tree-OID）之后的行就是冲突路径（步骤 4b）。
   - 预检步骤 4 的 `git log main..HEAD --oneline` 已列出**本次合并引入的每一个提交**。扫描其中的**搭便车者** —— 搭在分支上的无关提交（合并一个分支会合并它的**所有**提交）。如果你看到超出该分支既定目的的工作，在合并前向用户标记，并在步骤 6 报告中说明。

---

## 步骤 1：形成心智模型

你没有隐含的会话上下文（全新会话）。在起草任何内容之前先阅读该分支。

- **小型 diff**（变更 <200 行 **且** <10 个文件）：直接内联 `git diff main`。
- **大型 diff**（>200 行 **或** >10 个文件）：委派给 `Explore` 子代理（Sonnet）以保持上下文干净。

  ```
  Agent({
    description: "Summarize <branch> vs main",
    subagent_type: "Explore",
    prompt: "Summarize what branch <branch> does relative to main. Focus on: which systems/areas it touches, what new capabilities or changes it introduces, and risk areas (migrations, auth, infra). Under 300 words."
  })
  ```

用该摘要和 diff stat 在步骤 4 起草合并消息。如果 `$ARGUMENTS` 包含 `summary: <override>`，则使用它并跳过合成。

---

## 步骤 2：文档最新性护栏

从被触及的顶层目录（预检步骤 4 命令）映射到可能需要更新的文档：

| 被触及的顶层目录 | 需考虑的文档 |
|---|---|
| 任何代码目录 | `docs/ai-context/*.md`、根 `CLAUDE.md` |
| `assets/`（如果存在） | `assets/CLAUDE.md` |
| 其他顶层目录 | 它们的本地 `CLAUDE.md`（如果存在） |

对于按产品划分子目录的 monorepo（例如 `ProductA/`、`ProductB/`），把每个被触及的产品目录映射到它自己的 `<product>/docs/ai-context/` 和 `<product>/CLAUDE.md`。

**决策流程：**

1. **应用跳过标准**（来自 `.claude/skills/update-docs/SKILL.md` 的 "When to Skip" 一节）：bug 修复、小重构、代码清理、UI 微调、在既有模式内的单文件新增、无架构影响的性能优化、注释/格式变更。如果分支符合这些 → 静默跳过，进入步骤 3。

2. **检查此分支上文档是否已被触及：**
   ```bash
   git log main..HEAD --name-only --format= | grep -E 'docs/ai-context/|CLAUDE\.md'
   ```
   如果是 → 文档已在工作会话中处理过。静默跳过，进入步骤 3。

3. **如果是实质性 diff 且分支上没有触及文档** → 停止。列出可能需要关注的具体文件，然后给出三个选项：
   - **(a)** 中止合并，让用户在当前或其他会话中调用 `/update-docs` 技能。
   - **(b)** 仍然继续（用户明确接受文档漂移 —— 在步骤 6 中记录这一点）。
   - **(c)** 完全取消。

   **等待用户选择。不要自动调用 `/update-docs`。** 合并是半破坏性的；这是对通常"跳过冗余确认"偏好的刻意例外。

---

## 步骤 3：干净工作区护栏

- **干净工作区**（`git status` 无输出）→ 静默进入步骤 4。
- **脏工作区** → 停止。显示：
  - `git status` output
  - `git diff --stat` summary
  - 一行分类提示（"看起来像构建产物 / 生成文件" vs "看起来像代码变更"）

  让用户选择：
  - **(a)** 提交指定的具名文件 —— 由用户命名。遵循仓库的提交风格（约定式 `feat:`/`fix:`/`chore:` 前缀、HEREDOC 消息、`Co-Authored-By: Claude <noreply@anthropic.com>` trailer）。
  - **(b)** 丢弃未提交的更改。
  - **(c)** 中止合并。

**绝不 `git add -A` 或 `git add .`。** 绝不在用户未指定文件的情况下自动提交。一个悄悄吞掉重新生成的构建输出或过期 `.DS_Store` 的合并提交，事后撤销会很痛苦。

---

## 步骤 4：合并到 main

两件事决定这一步的走向：
- **模式**（预检步骤 1）—— 标准 vs worktree —— 决定合并**在哪里**运行。
- **分叉**（预检步骤 5）—— 决定合并**如何**运行：
  - **无分叉** → 简单的单命令合并（步骤 4a，快路径）。
  - **已分叉** → 两阶段合并：用 `--no-commit` 暂存，验证组合树（步骤 4c），**然后**提交。这就是最高指令 —— 干净的自动合并仍可能破坏构建。
  - **预测有冲突** → 步骤 4b。

自始至终，两种模式唯一的差别是 git 调用的前缀：
- **标准模式：** 先 `git checkout main` 一次，然后在 cwd 中运行合并命令。
- **worktree 模式：** 你无法在 worktree 内部 `git checkout main`（main 已在主仓库中检出）。对**所有**合并操作使用 `git -C <main-repo-path>` —— 绝不要 `cd` 进 worktree 的 main。

在下面的命令中，`<merge-git>` 代表 `git`（标准模式，在 `git checkout main` 之后）或 `git -C <main-repo-path>`（worktree 模式）。替换成正确的那个。

### 步骤 4a：合并

1. 确认存在提交：
   ```bash
   git log main..HEAD --oneline
   ```
   如果为空 → 询问用户是否只运行步骤 5 的清理（零提交边界情况；该分支没有工作）。

2. **仅标准模式：** 先在 cwd 中检出 main：
   ```bash
   git checkout main
   ```

3. **快路径 —— 无分叉**（预检：`merge-base --is-ancestor` 成功）。合并树等于分支树，已在分支上构建过。一次性合并：
   ```bash
   <merge-git> merge <branch> --no-ff -m "$(cat <<'EOF'
   Merge branch '<branch>' — <short summary>

   [optional Verified: line ONLY if provided via $ARGUMENTS]

   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   ```
   然后做完整性检查（下面的第 7 点）—— 跳过第 6 点，提交已完成 —— 并进入**步骤 5：清理**。

4. **两阶段路径 —— 已分叉**（预检：`merge-base --is-ancestor` 失败）。**不提交**地暂存合并，以便在最终确定前验证组合树：
   ```bash
   <merge-git> merge <branch> --no-ff --no-commit
   ```
   - **有冲突**（预检已预测到）→ 进入**步骤 4b**。**不要**清理分支/worktree。
   - **无冲突** → 继续到下面的第 5 点（验证组合树）。

5. **验证组合树** → 现在运行**步骤 4c**。干净的自动合并仍可能破坏构建。

6. **最终确定提交**（仅在 4c 通过后）：
   ```bash
   <merge-git> commit -m "$(cat <<'EOF'
   Merge branch '<branch>' — <short summary>

   [optional Verified: line ONLY if provided via $ARGUMENTS]

   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   ```

7. **完整性检查** HEAD 是否如期移动：
   ```bash
   <merge-git> log -1 --oneline
   ```

**合并消息摘要风格：** 一个以破折号分隔的子句，概括该分支达成了什么。从步骤 1 的心智模型合成，或使用 `$ARGUMENTS` 中的 `summary:` 覆盖。好的摘要子句示例：
- "auth middleware rewrite for compliance — drops session-token storage"
- "swap payment provider from Stripe to Adyen"
- "feature flag for new onboarding flow + telemetry plumbing"

---

## 步骤 4b：解决冲突

当并行分支触及重叠文件时，冲突密集的合并是常态 —— 这是真实的工作流，不是失败。但它高度依赖判断且半破坏性，所以要在轨道上运行。**绝不自动解决。**

1. **呈现 + 决策。** 向用户显示冲突路径集合（来自预检中的 `merge-tree`）和正在合并的提交，然后询问如何继续：
   - **(a) 现在解决** —— 在这个 `--no-commit` 合并中解决，验证（4c），然后最终确定。
   - **(b) 先 rebase** —— 把分支 rebase 到 main 上，在那里解决，然后快进合并（线性历史；会重写分支）。
   - **(c) 中止** —— `<merge-git> merge --abort`；留给专门的会话处理。

   等待选择 —— 绝不自动挑选。

2. **按意图解决每个 hunk，而非机械地保留双方：**
   ```bash
   <merge-git> diff --name-only --diff-filter=U   # conflicted paths
   ```
   - **双方新增**（各方添加了不同成员）→ 通常保留两者。
   - **删除 vs 保留**（一方删除了另一方仍保留的代码）→ 通常删除胜出，但保留代码前要**验证**意图（见下面的考古）。如果某分支只是**继承**了另一方**刻意**删除的代码，则采用删除 —— 保留它会复活已移除的行为。
   - **修改/删除** → 按意图决定；用 `<merge-git> rm <path>` 接受删除。
   - **文档** → 合并双方的叙述，但要对照现实重新核验每一个事实**主张**（测试数、文件数、版本号）—— 分叉的分支会断言不同的数字（4c 度量真相）。

3. **（可选）冲突考古 —— 选择性加入的高级路径。** 当仅从冲突本身看不出意图时，从历史中重建它。把它作为选项呈现给用户；不要默认对每个 hunk 都运行。
   ```bash
   MB=$(git merge-base main <branch>)
   git show $MB:<path>                            # the file as it was at the common ancestor
   git show $MB:<path> | grep -n <symbol>         # was the symbol present in the base?
   git log $MB..main --diff-filter=D --oneline -- <path>  # did main delete it on purpose?
   ```
   阅读 merge-base 版本（`git show <merge-base>:<path>`）能告诉你**双方**从什么开始，因此你能区分刻意的删除和意外的继承。这是只读调查 —— 它从不为您解决任何问题。

4. **（可选）并行化分析，绝不并行化解决。** 对于大型冲突集（约 5 个以上文件，或需要考古的冲突），你**可以**分派 `Explore` 子代理 —— 每个文件或每簇一个 —— 各自针对每个冲突报告：各方**意图**什么、merge-base 考古、推荐的解决方案 + 风险。主代理**自己**综合并应用每一个解决方案 —— 跨文件不变量（一个决策横跨多个文件）对逐文件代理是不可见的。子代理只读；它们绝不编辑。

5. **按名称暂存已解决的文件**（绝不 `git add -A`）；确认 `<merge-git> diff --name-only --diff-filter=U` 为空。

6. **验证 + 最终确定** → 运行**步骤 4c**，然后 `<merge-git> commit`（进行中的合并会拾取已暂存的解决方案；使用步骤 4a 的消息模板，并加一行说明冲突了什么以及你如何决定）。对 HEAD 做完整性检查。

---

## 步骤 4c：验证组合树（main 分叉时强制）

最高指令。每当 git 组合出新树时（分叉为 TRUE）—— 无论冲突还是干净自动合并 —— 都在最终确定合并提交**之前**运行。

1. **发现项目的构建/测试命令 —— 不要硬编码它。** 按顺序查找此仓库已经在用的东西：
   - 在项目配置中声明的测试/构建运行器（例如 `package.json` scripts、`Makefile` targets、`justfile`、`pyproject.toml`、`Cargo.toml`、`.github/workflows/` 下的 CI 工作流，或封装构建的项目技能/命令）。
   - 仓库自己的 `CLAUDE.md` 或 `docs/ai-context/*.md`，它们往往记录了规范的构建/测试调用方式。
   - 如果存在项目的 `deploy` 或构建技能，复用它的发现逻辑，而不是重新发明。

   <!-- e.g. `npm test` / `make check` / `cargo test` / `pytest` / `go build ./...` — discover, don't assume -->

   如果你确实找不到，**停下来**询问用户如何构建/测试此仓库，而不是猜测。

2. **限定范围（可选 —— 默认是整个项目）。** 默认构建/测试**整个项目**：这是最安全的，且本工具包假定每个仓库一个项目。*可选地*，如果项目很大且分区清晰，你**可以**收窄到 diff 触及的**模块/组件** —— 按文件路径检测（预检步骤 4 的顶层目录），且仅当构建系统支持低成本地针对该子集时才这样做。有疑问时，构建整个项目。

3. **先构建，再测试。** 运行发现到的构建；如果它有 diff 触及的平台/目标变体，构建每一个受影响的变体（被某次构建排除在外的目标对它不可见）。然后，如果受影响的代码有测试覆盖，运行测试套件。

4. **修复合并产生的每一个错误**（自动合并孤儿 —— 某个使用其声明被另一方移除 —— 就住在这里），然后重新构建至通过。如果修复不平凡或改变了行为，向用户暴露它，而非猜测。

5. **核对文档主张。** 如果你在冲突解决期间更正了任何文档中的测试数 / 文件数 / 版本号，把它们设为本次构建/测试运行**实测**的值。

6. 只有通过后才 → 回到步骤 4a/4b 提交。

---

## 步骤 5：清理

仅在步骤 4 中**成功**合并之后。

### 标准模式

你已经在 main 上且分支已合并。只需删除分支引用：

```bash
git branch -d <branch>
```

`-d`（小写）会拒绝删除未合并的分支 —— 自带检查。如果报错，向用户暴露它；**不要**升级为 `-D`。

### Worktree 模式

1. 移除 worktree 目录：
   - 如果此 worktree 是**本会话**由 `EnterWorktree` 创建的，使用 `ExitWorktree` 工具（`action: "remove"`, `discard_changes: true`）。它会警告"未合并的提交"（它检查的是 worktree 分支，而非 main）—— 但步骤 4 之后这些提交**确实**在 main 上。
   - 否则 —— 已有的 `git worktree add` —— 使用：
     ```bash
     git -C <main-repo-path> worktree remove <worktree-path>
     ```
     如果 worktree 是脏的它会拒绝；这里它是干净的（所有工作都在 main 上）。当前 shell 的 cwd 可能就在 worktree 内，所以它可能被从你脚下删除 —— 之后继续使用绝对路径 / `git -C <main-repo-path>`。

2. 删除分支引用。否则分支会停留在其合并前的顶端；之后匹配同名分支的 `git worktree add` 会复用这个陈旧分支，而不是从当前 main 分出新分支。
   ```bash
   git -C <main-repo-path> branch -d <branch>
   ```
   `-d`（小写）会拒绝删除未合并的分支。如果报错，暴露它；**不要**升级为 `-D`。

---

## 步骤 6：确认

向用户报告：
- 分支名 + 已合并的提交数
- 文件/行数摘要（来自预检 stat）
- 一行的交付摘要（来自步骤 1 的心智模型或 `$ARGUMENTS` 覆盖）
- **如果解决了冲突（4b）：** 哪些文件 + 关键的解决决策
- **如果树是组合出来的（分叉 —— 4c 运行了）：** 构建/测试结果
- **任何搭便车而来的提交**（预检步骤 5）—— 点名它们，以便用户在不需要时可以回退
- 任何被沿用的标记（例如"文档被标记为可能过时，但你选择继续"）
- "Back on main." —— 如果你处于 worktree 模式，追加 "(worktree removed)"。
