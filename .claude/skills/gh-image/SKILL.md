---
name: gh-image
description: "将本地图像上传到 GitHub 并获取规范的 user-attachments 嵌入 URL；当被要求将截图附加到 PR、Issue 或评论，或想在 README 中嵌入前后对比图时使用。"
category: developer-tools
risk: safe
source: community
source_type: community
source_repo: drogers0/gh-image
date_added: "2026-06-25"
author: drogers0
license: MIT
license_source: "https://github.com/drogers0/gh-image/blob/main/LICENSE"
tags:
  - github
  - images
  - screenshots
  - gh-extension
  - cli
tools:
  - claude-code
  - codex-cli
  - 游标
  - gemini-cli
---

# 上传图像到 GitHub (gh-image)

GitHub has **no public API** for image uploads — the web UI uses an internal
端点 that mints `user-attachments` URLs scoped to the repo's visibility.
[`gh-image`](https://github.com/drogers0/gh-image) (MIT, © drogers0) replicates
that flow as a `gh` CLI extension, so an agent can upload a local image from the
terminal and get a ready-to-embed Markdown image line back.

## 概述

This skill drives `gh-image` to turn a local image file into a hosted GitHub
`user-attachments` URL, then embeds that URL into a pull 请求, issue, or
comment. It is the missing "attach a screenshot" capability for terminal agents.

## 何时使用此技能

当被要求以下操作时使用此技能：

- "将截图附加到 PR"或"将图像添加到 PR 描述"
- "将此图像放入议题"/"用这些截图评论"
- "在 PR 中显示测试结果/前后对比"
- Embed any local image into GitHub Markdown without leaving the terminal

## 工作原理

### 步骤 1：验证前提条件

```bash
gh auth status                                   # gh installed & authenticated
gh extension list | grep -q 'drogers0/gh-image' \
  || gh extension install drogers0/gh-image      # idempotent install
```

`gh-image` does **not** use the `gh` 令牌 for the upload (that 端点 rejects
tokens). It needs a GitHub `user_session` cookie, resolved in this order:
`--令牌 <value>` flag → `GH_SESSION_TOKEN` env var (use in CI/headless) → a
logged-in browser's cookie store (default for local use).

### 步骤 2：上传

```bash
# Use an absolute path; --repo is optional inside a repo working dir.
gh image "/abs/path/screenshot.png" --repo <owner>/<repo>
```

`gh image` prints Markdown to **stdout**, one line per image:

```
![screenshot.png](https://github.com/user-attachments/assets/<uuid>)
```

Capture that output — it is the embeddable reference.

### 步骤 3：嵌入到 PR / issue / 评论中

```bash
MD="$(gh image "/abs/path/shot.png" --repo owner/repo)"
BODY="$(gh pr view <pr> --repo owner/repo --json body -q .body)"
printf '%s\n\n## Screenshots\n\n%s\n' "$BODY" "$MD" \
  | gh pr edit <pr> --repo owner/repo --body-file -
```

Use `gh pr comment`, `gh issue edit`, or `gh issue comment` with `--body-file -`
for other targets. Always pass `--body-file -` (not inline `--body`) so multi-line
bodies and special characters can't break shell quoting.

### 步骤 4：验证

```bash
gh pr view <pr> --repo owner/repo --json body -q .body   # confirm URL present
```

## 示例

- **Attach a CleanShot screenshot to PR #42:** upload the file, append it under a
  `## Screenshots` heading in the PR body.
- **Embed before/after images in a README:** upload both, paste the two Markdown
  lines into the README at the relevant section.

## 最佳实践

- Resolve globs to absolute paths first; quote paths with spaces/Unicode.
- For display sizing, embed an HTML tag instead of bare Markdown:
  `<img width="800" src="https://github.com/user-attachments/assets/<uuid>" />`.
- In CI, set `GH_SESSION_TOKEN` from a dedicated bot account.

## 限制

- **会话 cookie required.** A `user_session` cookie grants full account access
  (not scoped like a PAT) — treat it like a password; use a bot account in CI.
- **Write access to the target repo is required**; orgs that enforce SAML SSO need
  the 会话 authorized at `https://github.com/orgs/<org>/sso` first.
- **Private-repo images stay private:** the `user-attachments` URL inherits repo
  visibility, so an anonymous fetch on a private repo returns 404/403 by design.
- **Windows + Chrome 127+** cannot read cookies (library limitation) — use another
  browser or `GH_SESSION_TOKEN`.
- The skill embeds the Markdown itself; `gh-image` only prints the URL.
