---
description: 把当前会话状态保存到 ~/.claude/session-data/ 下的带日期文件，以便未来会话能带着完整上下文恢复工作。
---

# 保存会话命令

捕获此会话中发生的一切 —— 构建了什么、什么有效、什么失败、还剩什么 —— 并写入带日期的文件，以便下一个会话能从这个会话离开的地方精确接续。

## 何时使用

- 工作会话结束时、关闭 Claude Code 之前
- 即将触及上下文限制之前（先运行这个，再开始新会话）
- 解决了一个你想记住的复杂问题之后
- 任何时候你需要把上下文交接给未来的会话

## 流程

### 第 1 步：收集上下文

写文件之前，收集：

- 读取此会话中修改过的所有文件（用 git diff 或从对话中回忆）
- 回顾讨论了什么、尝试了什么、决定了什么
- 记录遇到的任何错误及其解决方式（或未解决）
- 如相关，检查当前的测试/构建状态

### 第 2 步：如果 sessions 文件夹不存在则创建

在用户的 Claude 主目录中创建规范的 sessions 文件夹：

```bash
mkdir -p ~/.claude/session-data
```

### 第 3 步：写会话文件

创建 `~/.claude/session-data/YYYY-MM-DD-<short-id>-session.tmp`，使用今天的真实日期，以及满足 `session-manager.js` 中 `SESSION_FILENAME_REGEX` 规则的 short-id：

- 兼容字符：字母 `a-z` / `A-Z`、数字 `0-9`、连字符 `-`、下划线 `_`
- 兼容最小长度：1 个字符
- 新文件的推荐风格：小写字母、数字和连字符，8 个以上字符以避免冲突

有效示例：`abc123de`、`a1b2c3d4`、`frontend-worktree-1`、`ChezMoi_2`
新文件应避免：`A`、`test_id1`、`ABC123de`

完整有效文件名示例：`2024-01-15-abc123de-session.tmp`

旧版文件名 `YYYY-MM-DD-session.tmp` 仍然有效，但新会话文件应优先使用 short-id 形式，以避免同日冲突。

### 第 4 步：用下面所有章节填充文件

诚实地写每一个章节。不要跳过章节 —— 如果某章节确实没有内容，就写 "Nothing yet" 或 "N/A"。不完整的文件比诚实为空的章节更糟。

### 第 5 步：向用户展示文件

写入之后，显示完整内容并询问：

```
Session saved to [actual resolved path to the session file]

Does this look accurate? Anything to correct or add before we close?
```

等待确认。如有要求则进行编辑。

---

## 会话文件格式

```markdown
# Session: YYYY-MM-DD

**Started:** [approximate time if known]
**Last Updated:** [current time]
**Project:** [project name or path]
**Topic:** [one-line summary of what this session was about]

---

## What We Are Building

[1-3 段，描述该功能、bug 修复或任务。包含足够的上下文，使对此会话零记忆
的人也能理解目标。包括：它做什么、为什么需要它、它如何契合更大的系统。]

---

## What WORKED (with evidence)

[只列出已确认可用的东西。每一项都要包含你**为什么**知道它可用 —— 测试通过、
在浏览器中跑通、Postman 返回 200 等。没有证据的，移到 "Not Tried Yet"。]

- **[thing that works]** — confirmed by: [specific evidence]
- **[thing that works]** — confirmed by: [specific evidence]

如果还没有任何确认可用的内容："Nothing confirmed working yet — all approaches still in progress or untested."

---

## What Did NOT Work (and why)

[这是最重要的章节。列出每一个尝试过但失败的做法。
对每个失败写下**确切**原因，以免下一个会话重试它。
要具体："threw X error because Y" 有用。"didn't work" 没用。]

- **[approach tried]** — failed because: [exact reason / error message]
- **[approach tried]** — failed because: [exact reason / error message]

如果没有失败："No failed approaches yet."

---

## What Has NOT Been Tried Yet

[看起来有希望但尚未尝试的做法。对话中产生的想法。值得探索的替代方案。
要足够具体，使下一个会话确切知道该尝试什么。]

- [approach / idea]
- [approach / idea]

如果队列为空："No specific untried approaches identified."

---

## Current State of Files

[此会话触碰过的每个文件。精确说明每个文件处于什么状态。]

| File              | Status         | Notes                      |
| ----------------- | -------------- | -------------------------- |
| `path/to/file.ts` | PASS: Complete    | [what it does]             |
| `path/to/file.ts` |  In Progress | [what's done, what's left] |
| `path/to/file.ts` | FAIL: Broken      | [what's wrong]             |
| `path/to/file.ts` |  Not Started | [planned but not touched]  |

如果没有触碰任何文件："No files modified this session."

---

## Decisions Made

[架构选择、接受的取舍、选定方案及原因。
这些能防止下一个会话重新争论已定案的决策。]

- **[decision]** — reason: [why this was chosen over alternatives]

如果没有重要决策："No major decisions made this session."

---

## Blockers & Open Questions

[任何未解决、需要下一个会话处理或调查的事。
出现过但未回答的问题。正在等待的外部依赖。]

- [blocker / open question]

如果没有："No active blockers."

---

## Exact Next Step

[如果已知：恢复时最重要的那一件事。要足够精确，
使恢复时无需思考从哪里开始。]

[如果未知："Next step not determined — review 'What Has NOT Been Tried Yet'
and 'Blockers' sections to decide on direction before starting."]

---

## Environment & Setup Notes

[仅在相关时填写 —— 运行项目所需的命令、需要的环境变量、
需要运行的服务等。如果是标准设置则跳过。]

[如果没有：完全省略此章节。]
```

---

## Example Output

```markdown
# Session: 2024-01-15

**Started:** ~2pm
**Last Updated:** 5:30pm
**Project:** my-app
**Topic:** Building JWT authentication with httpOnly cookies

---

## What We Are Building

User authentication system for the Next.js app. Users register with email/password,
receive a JWT stored in an httpOnly cookie (not localStorage), and protected routes
check for a valid token via middleware. The goal is session persistence across browser
refreshes without exposing the token to JavaScript.

---

## What WORKED (with evidence)

- **`/api/auth/register` endpoint** — confirmed by: Postman POST returns 200 with user
  object, row visible in Supabase dashboard, bcrypt hash stored correctly
- **JWT generation in `lib/auth.ts`** — confirmed by: unit test passes
  (`npm test -- auth.test.ts`), decoded token at jwt.io shows correct payload
- **Password hashing** — confirmed by: `bcrypt.compare()` returns true in test

---

## What Did NOT Work (and why)

- **Next-Auth library** — failed because: conflicts with our custom Prisma adapter,
  threw "Cannot use adapter with credentials provider in this configuration" on every
  request. Not worth debugging — too opinionated for our setup.
- **Storing JWT in localStorage** — failed because: SSR renders happen before
  localStorage is available, caused React hydration mismatch error on every page load.
  This approach is fundamentally incompatible with Next.js SSR.

---

## What Has NOT Been Tried Yet

- Store JWT as httpOnly cookie in the login route response (most likely solution)
- Use `cookies()` from `next/headers` to read token in server components
- Write middleware.ts to protect routes by checking cookie existence

---

## Current State of Files

| File                             | Status         | Notes                                           |
| -------------------------------- | -------------- | ----------------------------------------------- |
| `app/api/auth/register/route.ts` | PASS: Complete    | Works, tested                                   |
| `app/api/auth/login/route.ts`    |  In Progress | Token generates but not setting cookie yet      |
| `lib/auth.ts`                    | PASS: Complete    | JWT helpers, all tested                         |
| `middleware.ts`                  |  Not Started | Route protection, needs cookie read logic first |
| `app/login/page.tsx`             |  Not Started | UI not started                                  |

---

## Decisions Made

- **httpOnly cookie over localStorage** — reason: prevents XSS token theft, works with SSR
- **Custom auth over Next-Auth** — reason: Next-Auth conflicts with our Prisma setup, not worth the fight

---

## Blockers & Open Questions

- Does `cookies().set()` work inside a Route Handler or only in Server Actions? Need to verify.

---

## Exact Next Step

In `app/api/auth/login/route.ts`, after generating the JWT, set it as an httpOnly
cookie using `cookies().set('token', jwt, { httpOnly: true, secure: true, sameSite: 'strict' })`.
Then test with Postman — the response should include a `Set-Cookie` header.
```

---

## 说明

- 每个会话有自己的文件 —— 绝不要追加到之前会话的文件
- "What Did NOT Work" 章节最关键 —— 没有它，未来的会话会盲目重试失败的方案
- 如果用户要求在会话中途保存（不只是在结束时），保存目前已知的内容，并清楚地标记进行中的事项
- 该文件意在由 Claude 在下一个会话开始时通过 `/resume-session` 读取
- 使用规范的全局会话存储：`~/.claude/session-data/`
- 任何新会话文件都优先使用 short-id 文件名形式（`YYYY-MM-DD-<short-id>-session.tmp`）
