---
description: 通过 GitHub Actions 工作流将 oh-my-opencode 发布到 npm
argument-hint: <patch|minor|major>
---

你是 oh-my-opencode 的发布经理。从头到尾执行**完整**发布工作流。

## 关键：发布即交付 —— 直奔工作流

`origin/dev` 已经过把关：每个 PR 和 push 都跑过 CI（在 3 个操作系统上的 test/typecheck/codex-compatibility），且发布工作流在发布任何东西之前会重新运行同样的关卡。

- **绝不**把 `/pre-publish-review`、`/review-work` 或任何代码重审作为发布请求的一部分运行。**只有**用户明确要求审查时才运行它们。
- **绝不**在发布期间"修复"代码、开 PR，或进入修复并重审的循环。如果工作流失败或看起来哪里坏了，报告它并**停止** —— 发布不是修树的场合。
- 带 bump 类型的发布请求会在几分钟内从步骤 0 走到步骤 3（触发）。唯一需要人类规模的工作是发布说明，在 CI 运行时起草。

## 关键：完整工作流意味着三个发布面

只有所有发布面都验证过后，发布才算完成：

| 发布层 | 面 | 所需证据 |
|---|---|---|
| `omo pure components` | 已发布包载荷内的 Core/MCP/shared-skill 变更 | 发布说明需点出该层专属的版本影响（来自工作流 changelog，或用户请求时的 `/get-unpublished-changes`）。 |
| `omo opencode` | `oh-my-opencode` 和 `oh-my-openagent` npm 包以及平台包 | 所选 bump 对应的 npm 版本和 GitHub release 均存在。 |
| `omo codex` | `lazycodex-ai`、Codex 插件元数据，以及 `code-yeongyu/lazycodex` marketplace release | Codex 插件元数据已盖印发布版本，`lazycodex-ai` 已发布，且当 marketplace 载荷变化时 LazyCodex 仓库的 release 已创建。 |

只要 `oh-my-opencode`、`oh-my-openagent`、`lazycodex-ai` 或 `code-yeongyu/lazycodex` 中任何一个的验证尚未解决，就不得报告发布工作流已完成。

## 关键：完整工作流也意味着 Discord

在 Discord 发布公告被尝试之前，发布不算完成。

- **不要在创建 GitHub release 后就停下。**
- **不要在起草或应用发布说明后就停下。**
- **如果用户已确认发布，不要再等第二次用户确认。**
- 发布说明定稿后，立即运行步骤 7.5 并发布到 Discord。
- 如果 Discord 发布在认证/重试后仍失败，清楚报告失败并继续剩余的验证步骤。跳过 Discord 步骤即视为工作流失败。

## 关键：触发后不得提早结束回合（完成契约）

一旦 `gh workflow run publish` 成功，发布就**尚未**完成。此前某个会话忘了这一点：它触发了工作流就结束了回合，导致 release 未验证、增强摘要未撰写、Discord 公告未发送。这个错误就是本节存在的原因。

在步骤 3（触发）之后，你**必须**推动该次运行走到终态结论，**并且**在结束回合前完成每一个触发后步骤。以下任何一项未解决时，你**不得**结束回合、交接，或就此收工：

1. **运行结论** —— `gh run view <id> --json conclusion` 必须返回 `success`（起草说明时轮询；绝不要空闲 sleep）。
2. **Release 存在** —— 步骤 5：`gh release view v${NEW_VERSION}` 能解析出结果。
3. **增强摘要已应用** —— 步骤 6 + 步骤 7：起草（patch/minor/major 均强制）**且**已执行 `gh release edit --notes-file`。"patch 是可选的"是错的；patch 摘要**强制**。
4. **Discord 已公告** —— 步骤 7.5：已尝试 `agent-discordbot message send`；要么记录了消息 id，要么向用户报告了明确的失败。跳过 Discord 步骤即视为工作流失败。
5. **npm 已验证** —— 步骤 8：`npm view oh-my-opencode version`（以及 oh-my-openagent、lazycodex-ai）显示 `${NEW_VERSION}`。

只有全部五项变绿后，你才可以结束回合。如果运行失败，执行 `gh run view <id> --log-failed`，报告它，并**停止**（不要在发布中途修树）。如果某个触发后步骤因外部原因失败（npm 传播、Discord 认证），清楚报告并继续剩余步骤 —— 不要让一次失败中止其余部分。

此契约同样适用于斜杠命令副本（`.agents/command/publish.md`、`.opencode/command/publish.md`）；按 `.agents/AGENTS.md` 的漂移规则，它们与本文档保持逐字节一致。

## 关键：参数要求

**你必须从用户处收到版本 bump 类型。** 有效选项：
- `patch`：bug 修复，向后兼容（1.1.7 → 1.1.8）
- `minor`：新功能，向后兼容（1.1.7 → 1.2.0）
- `major`：破坏性变更（1.1.7 → 2.0.0）

**如果用户没有提供 bump 类型参数，立即停止并询问：**
> "To proceed with deployment, please specify a version bump type: `patch`, `minor`, or `major`"

**未获得用户对 bump 类型的明确确认，不得继续。**

---

## 步骤 0：注册 TODO 清单（强制的首个动作）

**在做任何其他事之前**，用 TodoWrite 创建一份详细的 todo 清单：

```
[
  { "id": "confirm-bump", "content": "Confirm version bump type with user (patch/minor/major)", "status": "in_progress", "priority": "high" },
  { "id": "check-uncommitted", "content": "Check for uncommitted changes and commit if needed", "status": "pending", "priority": "high" },
  { "id": "sync-remote", "content": "Sync with remote (pull --rebase && push if unpushed commits)", "status": "pending", "priority": "high" },
  { "id": "run-workflow", "content": "Trigger GitHub Actions publish workflow", "status": "pending", "priority": "high" },
  { "id": "wait-workflow", "content": "Wait for workflow completion (poll every 30s)", "status": "pending", "priority": "high" },
  { "id": "verify-and-preview", "content": "Verify release created + preview auto-generated changelog & contributor thanks", "status": "pending", "priority": "high" },
  { "id": "draft-summary", "content": "Draft enhanced release summary (mandatory for all release types)", "status": "pending", "priority": "high" },
  { "id": "apply-summary", "content": "Prepend enhanced summary to release", "status": "pending", "priority": "high" },
  { "id": "discord-announce", "content": "MANDATORY: post release announcement to Discord channel immediately after release notes are finalized", "status": "pending", "priority": "high" },
  { "id": "verify-npm", "content": "Verify npm package published successfully", "status": "pending", "priority": "high" },
  { "id": "verify-lazycodex", "content": "Verify lazycodex-ai publish, Codex plugin metadata version stamp, and code-yeongyu/lazycodex release/sync", "status": "pending", "priority": "high" },
  { "id": "verify-platform-binaries", "content": "Spot-check platform binary packages on npm", "status": "pending", "priority": "high" },
  { "id": "final-confirmation", "content": "Final confirmation to user with links", "status": "pending", "priority": "low" }
]
```

**在开始时把每个 todo 标记为 `in_progress`，完成时标记为 `completed`。一次一个。**

---

## 步骤 1：确认 BUMP 类型

如果用户已经指明了 bump 类型（参数或消息中），那**就是**确认 —— 陈述它并立即继续。仅当未给出 bump 类型时才询问并等待。

---

## 步骤 2：检查未提交的更改

运行：`git status --porcelain`

- 如果有未提交的更改，警告用户并询问他们是否要先提交
- 如果干净，继续

---

## 步骤 2.5：与远端同步（强制）

检查是否有未推送的提交：
```bash
git log @{u}..HEAD --oneline
```

**如果有未推送的提交，你必须在触发工作流之前同步：**
```bash
git pull --rebase && git push
```

这确保 GitHub Actions 工作流在包含所有本地提交的最新代码上运行。

---

## 步骤 3：触发 GitHub ACTIONS 工作流

运行发布工作流：
```bash
gh workflow run publish -f bump={bump_type}
```

等待 3 秒，然后获取 run ID：
```bash
gh run list --workflow=publish --limit=1 --json databaseId,status --jq '.[0]'
```

---

## 步骤 4：等待工作流完成

发布运行是一个带顺序阶段的单一工作流。预期时间线（来自近期真实运行，总计约 30 分钟）：

| 阶段（job） | 作用 | 典型耗时 |
|---|---|---|
| `test` / `typecheck` / `codex-compatibility`（3 个 OS） | 在发布源上重跑 CI 关卡 | 4–8 分钟（Windows 是长板） |
| `prepare-release-state` | 盖印版本、开启并自动合并 `release: vX.Y.Z` PR、等待该 PR 所需的 CI 检查 | 10–15 分钟（占主导阶段） |
| `publish-platform`（build + publish，12 个目标） | 构建并发布两个平台包家族 | 3–4 分钟 |
| `publish-main` → `release` | 发布 `oh-my-opencode` / `oh-my-openagent` / `lazycodex-ai`，创建 GitHub release，同步 `code-yeongyu/lazycodex` | 4–6 分钟 |

每 30 秒轮询 job 级状态，并向用户报告阶段转换：
```bash
gh run view {run_id} --json status,conclusion,jobs --jq '{status, conclusion, stage: ([.jobs[] | select(.status=="in_progress") | .name] | join(", "))}'
```

**重要：使用轮询循环，而不是 sleep 命令。** 利用等待时间起草增强发布摘要（步骤 6）—— 不要干等，也不要启动任何审查活动。

如果 conclusion 为 `failure`，显示错误并停止：
```bash
gh run view {run_id} --log-failed
```

---

## 步骤 5：验证 RELEASE 并预览自动生成的内容

两个目标：确认 release 存在，然后向用户展示工作流已经生成了什么。

```bash
# Pull latest (workflow committed version bump)
git pull --rebase
NEW_VERSION=$(node -p "require('./package.json').version")

# Verify release exists on GitHub
gh release view "v${NEW_VERSION}" --json tagName,url --jq '{tag: .tagName, url: .url}'
```

**验证之后，生成自动生成内容的本地预览：**

```bash
bun run script/generate-changelog.ts
```

<agent-instruction>
运行预览后，向用户呈现输出并说：

> **The following content is ALREADY included in the release automatically:**
> - Commit changelog (grouped by feat/fix/refactor)
> - Contributor thank-you messages (for non-team contributors)
>
> You do NOT need to write any of this. It's handled.
>
> **For all release types**, an enhanced summary is **required** — I'll draft one in the next step.

**批准关卡（单一、二值）：** 用户最初带具名 bump 类型的发布请求**就是**本工作流所需的唯一批准。**不要**在这里等待单独的确认。呈现预览，然后**立即**进入步骤 6。唯一例外：如果用户明确说"让我先看 changelog 再继续"（或等价表述），则停下等待。否则继续，不要结束回合。
</agent-instruction>

---

## 步骤 6：起草增强发布摘要

<decision-gate>

| 发布类型 | 动作 |
|-------------|--------|
| **patch** | 强制。起草简洁的 bug 修复 / 变更摘要。没有它不得继续。 |
| **minor** | 强制。起草简洁的功能摘要。没有它不得继续。 |
| **major** | 强制。起草完整的发布叙述，如有需要附迁移说明。没有它不得继续。 |

</decision-gate>

### OMO 原生 CLI 公开发布前的最后一次发布

当用户指出这是 OmO 原生 CLI 公开发布前的最后一次发布时，GitHub 摘要**必须**以此专用标题开头，且 Discord 公告**必须**在 `@here` 之后立即以专用标题重复它：

`## LAST RELEASE BEFORE THE OMO NATIVE CLI PUBLIC RELEASE`

### 你在写什么（以及你不写什么）

你在写**标题层** —— 位于自动生成提交日志**之上**的产品公告。想象成"发布博客文章"，而不是 "git log"。

<rules>
- **绝不**重复提交消息。自动生成章节已经列出了每个提交。
- **绝不**写"Various bug fixes and improvements"或"Several enhancements"这类泛泛填充。
- **始终**聚焦**用户影响**：用户现在能做什么以前做不到的事？
- **始终**按**主题**或**能力**分组，而非按提交类型（feat/fix/refactor）。
- **始终**使用具体语言："You can now do X"，而不是 "Added X feature"。
- **绝不**在任一发布说明变体中包含匹配 `senpi`、`omo-senpi`、`senpi-task`、`pi-goal` 或 `pi-webfetch` 的内部适配器变更。
</rules>

<examples>
<bad title="Commit regurgitation — DO NOT do this">
## What's New
- feat(auth): add JWT refresh token rotation
- fix(auth): handle expired token edge case
- refactor(auth): extract middleware
</bad>

<good title="User-impact narrative — DO this">
## 🔐 Smarter Authentication

Token refresh is now automatic and seamless. Sessions no longer expire mid-task — the system silently rotates credentials in the background. If you've been frustrated by random logouts, this release fixes that.
</good>

<bad title="Vague filler — DO NOT do this">
## Improvements
- Various performance improvements
- Bug fixes and stability enhancements
</bad>

<good title="Specific and measurable — DO this">
## ⚡ 3x Faster Rule Parsing

Rules are now cached by file modification time. If your project has 50+ rule files, you'll notice startup is noticeably faster — we measured a 3x improvement in our test suite.
</good>
</examples>

**关于示例**：上面的 `bad` / `good` 示例保持英文 —— 它们是**发布说明的输出样例**，展示目标文案风格，需与最终发布内容一致。

### 起草流程

1. **分析**步骤 5 预览中的提交列表。识别 2-5 个对用户重要的主题。
2. **写**摘要到 `/tmp/release-summary-v${NEW_VERSION}.md`。
3. **呈现**草稿给用户，供其在应用前审阅和批准。

```bash
# Write your draft here
cat > /tmp/release-summary-v${NEW_VERSION}.md << 'SUMMARY_EOF'
{your_enhanced_summary}
SUMMARY_EOF

cat /tmp/release-summary-v${NEW_VERSION}.md
```

<agent-instruction>
向用户呈现草稿：
> "Here's the release summary I drafted. This will appear AT THE TOP of the release notes, above the auto-generated commit changelog and contributor thanks."

**批准关卡（同一个单一关卡）：** 最初的发布确认也覆盖此步骤。呈现草稿，然后**立即**进入步骤 7（应用）和步骤 7.5（Discord）。**不要**停下来等批准，除非用户在发布开始前明确要求了发布说明审阅保留。Discord 公告（步骤 7.5）是强制的，且不得被一个从未被请求的审阅保留所阻塞。
</agent-instruction>

---

## 步骤 7：将增强摘要应用到 RELEASE

此步骤**强制**。步骤 6 的增强摘要必须始终被应用。

<architecture>
最终的发布说明结构：

```
┌─────────────────────────────────────┐
│  Enhanced Summary (from Step 6)     │  ← You wrote this
│  - Theme-based, user-impact focused │
├─────────────────────────────────────┤
│  ---  (separator)                   │
├─────────────────────────────────────┤
│  Auto-generated Commit Changelog    │  ← Workflow wrote this
│  - feat/fix/refactor grouped        │
│  - Contributor thank-you messages   │
└─────────────────────────────────────┘
```
</architecture>

<zero-content-loss-policy>
- **先**获取现有的 release 正文
- 把你的摘要**前置**到它上面
- 现有自动生成内容必须保持 **100% 完整**
- 现有内容**一个字符都不得**被删除或修改
</zero-content-loss-policy>

```bash
# 1. Fetch existing auto-generated body
EXISTING_BODY=$(gh release view "v${NEW_VERSION}" --json body --jq '.body')

# 2. Combine: enhanced summary on top, auto-generated below
{
  cat /tmp/release-summary-v${NEW_VERSION}.md
  echo ""
  echo "---"
  echo ""
  echo "$EXISTING_BODY"
} > /tmp/final-release-v${NEW_VERSION}.md

# 3. Update the release (additive only)
gh release edit "v${NEW_VERSION}" --notes-file /tmp/final-release-v${NEW_VERSION}.md

# 4. Confirm
echo "✅ Release v${NEW_VERSION} updated with enhanced summary."
gh release view "v${NEW_VERSION}" --json url --jq '.url'
```

---

## 步骤 7.5：将发布说明发布到 DISCORD

发布说明定稿后，把它们发布到 Discord 频道。此步骤对每次发布运行都是强制的。

<hard-gate>
在此步骤满足以下之一之前，工作流不算完成：
1. 成功发送了一条 Discord 消息并记录了消息 ID，**或**
2. 在 `agent-discordbot auth status` 加一次发送重试之后仍然失败，并向用户报告了 Jobdori bot-token 失败。

绝不因为发布摘要还在等待批准就跳过此步骤。如果用户已经确认发布，就在停止前继续走完 Discord。
</hard-gate>

<agent-discord-instruction>
1. 通过 `agent-discordbot` 使用 Jobdori bot token 发布发布公告。这是必需的发布路径；除非 bot 路径不可用且用户明确批准回退，否则不要使用个人 `agent-discord` token。固定 bot id，以便即使本地 `agent-discordbot` 当前 bot 变化，发布消息仍以 Jobdori bot 发出。
```bash
JOBDORI_BOT_ID=1486173823354146917
agent-discordbot auth status --bot "$JOBDORI_BOT_ID"
```

2. **读取频道中的近期消息**以匹配既有公告风格：
```bash
JOBDORI_BOT_ID=1486173823354146917
agent-discordbot message list 1454708427392680067 --bot "$JOBDORI_BOT_ID" --limit 5
```

3. 如果 `agent-discordbot` 不可用或未授权，停止并报告 Jobdori token 路径失败。只有到那时，人类才可以决定是否使用 `agent-discord`。

4. 把发布公告发布到频道 `1454708427392680067`，匹配此前公告的风格。消息应遵循此结构：
```
@here

🎉 **oh-my-opencode v{VERSION} — {Short Tagline}**

**Feature 1** — one-line description.

**Feature 2** — one-line description.

**Feature 3** — one-line description.

Plus {summary of remaining changes}.

📦 Install / upgrade:
`bun i -g oh-my-opencode@{VERSION}`  (or `npm`)

📝 Full release notes: {RELEASE_URL}
```

```bash
JOBDORI_BOT_ID=1486173823354146917
RELEASE_URL=$(gh release view "v${NEW_VERSION}" --json url --jq '.url')
agent-discordbot message send 1454708427392680067 "{your message following the style above}" --bot "$JOBDORI_BOT_ID"
```

如果消息发送失败，警告用户并继续 —— **不要**因 Discord 错误阻塞发布工作流。
</agent-discord-instruction>

---

## 步骤 8：验证 NPM 发布

轮询 npm registry 直到新版本出现：
```bash
npm view oh-my-opencode version
```

与预期版本比对。如果 2 分钟后仍不匹配，就 npm 传播延迟警告用户。

---

## 步骤 8.5：抽查平台二进制包

平台包由**同一次**发布运行中的 `publish-platform` job 构建并发布 —— 没有单独的工作流需要等待，且 `publish-main` 在设计上会拒绝发布，除非匹配的平台二进制存在。抽查一个有代表性的样本：

```bash
for PKG in oh-my-opencode-darwin-arm64 oh-my-openagent-linux-x64 oh-my-opencode-windows-x64; do
  npm view "$PKG" version
done
```

每个都应显示 `${NEW_VERSION}`。不匹配时，警告用户并指向该次运行中的 `publish-platform` job —— 你自己不要重跑任何东西。

---

## 步骤 9：最终确认

向用户报告成功，包含：
- 新版本号
- GitHub release URL：https://github.com/code-yeongyu/oh-my-opencode/releases/tag/v{version}
- npm 包 URL：https://www.npmjs.com/package/oh-my-opencode
- 平台包状态：抽查的平台包版本

---

## 错误处理

- **工作流失败**：显示失败日志，建议检查 Actions 标签页
- **找不到 release**：等待并重试，可能是传播延迟
- **npm 未更新**：npm 可能需要 1-5 分钟传播，告知用户
- **权限被拒**：用户可能需要用 `gh auth login` 重新认证
- **平台 job 失败**：显示同一次运行中 `publish-platform` job 的日志，点名失败的 target，并停止 —— `publish-main` 在设计上会被阻塞直到它们通过

## 语言

用英文回复用户。

```
┌─────────────────────────────────────┐
│  Enhanced Summary (from Step 6)     │  ← You wrote this
│  - Theme-based, user-impact focused │
├─────────────────────────────────────┤
│  ---  (separator)                   │
├─────────────────────────────────────┤
│  Auto-generated Commit Changelog    │  ← Workflow wrote this
│  - feat/fix/refactor grouped        │
│  - Contributor thank-you messages   │
└─────────────────────────────────────┘
```
</architecture>

<zero-content-loss-policy>
- Fetch the existing release body FIRST
- PREPEND your summary above it
- The existing auto-generated content must remain 100% INTACT
- NOT A SINGLE CHARACTER of existing content may be removed or modified
</zero-content-loss-policy>

```bash
# 1. Fetch existing auto-generated body
EXISTING_BODY=$(gh release view "v${NEW_VERSION}" --json body --jq '.body')

# 2. Combine: enhanced summary on top, auto-generated below
{
  cat /tmp/release-summary-v${NEW_VERSION}.md
  echo ""
  echo "---"
  echo ""
  echo "$EXISTING_BODY"
} > /tmp/final-release-v${NEW_VERSION}.md

# 3. Update the release (additive only)
gh release edit "v${NEW_VERSION}" --notes-file /tmp/final-release-v${NEW_VERSION}.md

# 4. Confirm
echo "✅ Release v${NEW_VERSION} updated with enhanced summary."
gh release view "v${NEW_VERSION}" --json url --jq '.url'
```

---

## STEP 7.5: POST RELEASE NOTES TO DISCORD

After the release notes are finalized, post them to the Discord channel. This step is mandatory for every publish run.

<hard-gate>
The workflow is not complete until this step has either:
1. Sent a Discord message successfully and recorded the message ID, or
2. Failed after `agent-discordbot auth status` plus one send retry, with the Jobdori bot-token failure reported to the user.

Never skip this step because the release summary was awaiting approval. If the user already confirmed the publish, continue through Discord before stopping.
</hard-gate>

<agent-discord-instruction>
1. Use the Jobdori bot token through `agent-discordbot` for release announcements. This is the required release path; do not use the personal `agent-discord` token unless the bot path is unavailable and the user explicitly approves the fallback. Pin the bot id so release messages go out as the Jobdori bot even if the local `agent-discordbot` current bot changes.
```bash
JOBDORI_BOT_ID=1486173823354146917
agent-discordbot auth status --bot "$JOBDORI_BOT_ID"
```

2. **Read recent messages** in the channel to match the existing announcement style:
```bash
JOBDORI_BOT_ID=1486173823354146917
agent-discordbot message list 1454708427392680067 --bot "$JOBDORI_BOT_ID" --limit 5
```

3. If `agent-discordbot` is unavailable or unauthorized, stop and report that the Jobdori token path failed. Only then may a human decide whether to use `agent-discord`.

4. Post the release announcement to channel `1454708427392680067` matching the style of previous announcements. The message should follow this structure:
```
@here

🎉 **oh-my-opencode v{VERSION} — {Short Tagline}**

**Feature 1** — one-line description.

**Feature 2** — one-line description.

**Feature 3** — one-line description.

Plus {summary of remaining changes}.

📦 Install / upgrade:
`bun i -g oh-my-opencode@{VERSION}`  (or `npm`)

📝 Full release notes: {RELEASE_URL}
```

```bash
JOBDORI_BOT_ID=1486173823354146917
RELEASE_URL=$(gh release view "v${NEW_VERSION}" --json url --jq '.url')
agent-discordbot message send 1454708427392680067 "{your message following the style above}" --bot "$JOBDORI_BOT_ID"
```

If the message fails to send, warn the user and continue — do NOT block the publish workflow on Discord errors.
</agent-discord-instruction>

---

## STEP 8: VERIFY NPM PUBLICATION

Poll npm registry until the new version appears:
```bash
npm view oh-my-opencode version
```

Compare with expected version. If not matching after 2 minutes, warn user about npm propagation delay.

---

## STEP 8.5: SPOT-CHECK PLATFORM BINARY PACKAGES

Platform packages are built and published by the `publish-platform` jobs INSIDE the same publish run — there is no separate workflow to wait for, and `publish-main` already refuses to publish unless matching platform binaries exist. Spot-check a representative sample:

```bash
for PKG in oh-my-opencode-darwin-arm64 oh-my-openagent-linux-x64 oh-my-opencode-windows-x64; do
  npm view "$PKG" version
done
```

Each should show `${NEW_VERSION}`. On mismatch, warn the user and point at the `publish-platform` jobs in the run — do not re-run anything yourself.

---

## STEP 9: FINAL CONFIRMATION

Report success to user with:
- New version number
- GitHub release URL: https://github.com/code-yeongyu/oh-my-opencode/releases/tag/v{version}
- npm package URL: https://www.npmjs.com/package/oh-my-opencode
- Platform packages status: spot-checked platform package versions

---

## ERROR HANDLING

- **Workflow fails**: Show failed logs, suggest checking Actions tab
- **Release not found**: Wait and retry, may be propagation delay
- **npm not updated**: npm can take 1-5 minutes to propagate, inform user
- **Permission denied**: User may need to re-authenticate with `gh auth login`
- **Platform jobs fail**: Show logs from the `publish-platform` jobs in the same run, name the failing target, and stop — `publish-main` is blocked by design until they pass

## LANGUAGE

Respond to user in English.
