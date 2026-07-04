---
name: accesslint-diff
description: "将实时页面的无障碍违规与基线进行差异比较 — 默认比较未提交的更改（基于 stash），或传递 --branch [名称] 来比较分支。仅报告新增的违规、已修复的违规和预先存在的计数。使用 `scan` 进行无差异比较的完整审计。"
risk: safe
source: "https://github.com/AccessLint/skills"
date_added: "2026-06-02"
---

默认分支：!`git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null | sed 's|.*/||' || echo main`

仅报告变更内容。定位问题；不要修复。如果 `$ARGUMENTS` 中没有 URL，请询问。

解析 `$ARGUMENTS`：如果存在 `--branch <名称>` 则剥离 → 分支模式。如果 `--branch` 没有值，则使用上面的默认分支。剩余部分是 URL。

## 何时使用
- 当任务与此描述匹配时使用此技能：将实时页面的无障碍违规与基线进行差异比较 — 默认比较未提交的更改（基于 stash），或传递 --branch [<名称>] 来比较分支。仅报告新增的违规、已修复的违规和预先存在的计数。使用 `scan` 进行无差异比较的完整审计。

## 1. 审计

```bash
PORT=$(npx -y @accesslint/chrome@latest ensure | node -e 'process.stdin.on("data",d=>process.stdout.write(""+JSON.parse(d).port))')
```

**Stash 模式**（默认 — 未提交的更改）。首先告知用户："正在运行差异模式 — 将暂存你的更改以捕获基线，然后恢复。你的工作树将被完全恢复。" 如果 `git stash push` 失败，警告并退出。

```bash
git stash push -u -m "accesslint-diff-baseline"
npx -y @accesslint/cli@latest "<url>" --port "$PORT" --snapshot accesslint-diff --snapshot-dir /tmp --update-snapshot
git stash pop && sleep 2
npx -y @accesslint/cli@latest "<url>" --port "$PORT" --snapshot accesslint-diff --snapshot-dir /tmp --format json
```

**分支模式**（`--branch <名称>`）。首先告知用户："正在与 `<名称>` 进行差异比较 — 检出该分支以捕获基线，然后恢复。你的工作树将被完全恢复。"

分支切换会触发重建但不会重新加载浏览器 — CLI 每次都打开新标签页，因此始终读取当前构建。使用 `--wait-for "<选择器>"` 来在重建准备好之前阻止审计；如果没有它，警告用户慢速构建可能产生过时的基线。

将分支值保留在下面引用的 `branch` 变量中；永远不要将分支名称粘贴或求值为 shell 语法。

```bash
git diff --quiet && git diff --cached --quiet || git stash push -u -m "accesslint-diff-branch"
branch="<branch>"
git check-ref-format --branch "$branch" >/dev/null
case "$branch" in -*) echo "Refusing option-like branch name: $branch" >&2; exit 1 ;; esac
git rev-parse --verify --quiet "$branch^{commit}" >/dev/null
git switch "$branch"
npx -y @accesslint/cli@latest "<url>" --port "$PORT" --snapshot accesslint-diff --snapshot-dir /tmp --update-snapshot [--wait-for "<selector>"]
git switch - && git stash pop 2>/dev/null
npx -y @accesslint/cli@latest "<url>" --port "$PORT" --snapshot accesslint-diff --snapshot-dir /tmp --format json [--wait-for "<selector>"]
```

将 `--selector`、`--include-aaa` 传递给**两次**运行。

## 2. 报告

```
Accessibility diff — http://localhost:3000/ vs main (94 rules, live DOM)
2 new · 1 fixed · 4 pre-existing hidden

新增 — 严重
- color-contrast — 2.1:1 (needs 4.5:1), #bbb on #fff
    where: main > p.subtitle   fix: darken to #767676
已修复
- img-alt — <img src="old.jpg"> (no longer present)
```

每个新增违规：**位置**（选择器原文 + `file:line (symbol)` 如果存在 `source` — 绝不编造），**证据**，**修复**（机械变更或 `NEEDS HUMAN`）。

不要编辑。对于修复：应用机械修复然后重新运行 `accesslint:diff` 验证；批量工作移交给 `accesslint:audit`。

## 3. 清理

```bash
npx -y @accesslint/chrome@latest stop --all  # 如果 ensure 报告 "managed":false 则跳过
```

## 注意事项

- `ensure` 始终决定端口 — 永远不要硬编码 9222。
- CLI exit 2 = URL 错误或页面从未加载；检查 dev server。
- Stash 模式：`sleep 2` 覆盖大多数 HMR 情况；如果基线看起来与当前相同，添加 `--wait-for "<selector>"`。
- 分支模式：无 HMR — CLI 每次运行打开新标签页。`--wait-for` 是重建门控。
- 运行之间的大量 DOM 变更会导致选择器漂移 — 用 `accesslint:scan` 重新运行以获得全貌。

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
