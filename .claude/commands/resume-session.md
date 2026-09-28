---
description: 从 ~/.claude/session-data/ 加载最近的会话文件，并从上次会话结束的位置带着完整上下文恢复工作。
---

# 恢复会话命令

加载最后保存的会话状态，并在做任何工作之前完整定位。
此命令是 `/save-session` 的对应命令。

## 何时使用

- 开始新会话以继续之前某天的工作
- 因上下文限制而开始全新会话之后
- 从其他来源交接会话文件时（直接提供文件路径即可）
- 任何你持有会话文件、并希望 Claude 在继续之前完整吸收它的时刻

## 用法

```
/resume-session                                                      # loads most recent file in ~/.claude/session-data/
/resume-session 2024-01-15                                           # loads most recent session for that date
/resume-session ~/.claude/session-data/2024-01-15-abc123de-session.tmp  # loads a current short-id session file
/resume-session ~/.claude/sessions/2024-01-15-session.tmp               # loads a specific legacy-format file
```

## 流程

### 第 1 步：找到会话文件

如果未提供参数：

1. 检查 `~/.claude/session-data/`
2. 挑出最近修改的 `*-session.tmp` 文件
3. 如果文件夹不存在或没有匹配文件，告诉用户：
   ```
   No session files found in ~/.claude/session-data/
   Run /save-session at the end of a session to create one.
   ```
   然后停止。

如果提供了参数：

- 如果它看起来像日期（`YYYY-MM-DD`），先在 `~/.claude/session-data/` 中搜索，然后搜索旧版的
  `~/.claude/sessions/`，查找匹配 `YYYY-MM-DD-session.tmp`（旧格式）或
  `YYYY-MM-DD-<shortid>-session.tmp`（当前格式）的文件，
  并加载该日期下最近修改的那个变体
- 如果它看起来像文件路径，直接读取该文件
- 如果未找到，清楚地报告并停止

### 第 2 步：读取整个会话文件

读取完整文件。此时先不要总结。

### 第 3 步：确认理解

以这个确切的格式回复一份结构化简报：

```
SESSION LOADED: [actual resolved path to the file]
════════════════════════════════════════════════

PROJECT: [project name / topic from file]

WHAT WE'RE BUILDING:
[2-3 sentence summary in your own words]

CURRENT STATE:
PASS: Working: [count] items confirmed
 In Progress: [list files that are in progress]
 Not Started: [list planned but untouched]

WHAT NOT TO RETRY:
[list every failed approach with its reason — this is critical]

OPEN QUESTIONS / BLOCKERS:
[list any blockers or unanswered questions]

NEXT STEP:
[exact next step if defined in the file]
[if not defined: "No next step defined — recommend reviewing 'What Has NOT Been Tried Yet' together before starting"]

════════════════════════════════════════════════
Ready to continue. What would you like to do?
```

### 第 4 步：等待用户

**不要**自动开始工作。**不要**触碰任何文件。等待用户说明下一步做什么。

如果会话文件中清晰定义了下一步，且用户说 "continue" 或 "yes" 或类似的话 —— 就按那个确切的下一步继续。

如果没有定义下一步 —— 询问用户从哪里开始，并可选择从 "What Has NOT Been Tried Yet" 章节建议一种做法。

---

## 边界情况

**同一日期有多个会话**（`2024-01-15-session.tmp`、`2024-01-15-abc123de-session.tmp`）：
加载该日期下最近修改的匹配文件，无论它使用旧版无 id 格式还是当前短 id 格式。

**会话文件引用的文件已不存在：**
在简报中指出这一点 —— "WARNING: `path/to/file.ts` referenced in session but not found on disk."

**会话文件来自 7 天以前：**
指出这个间隔 —— "WARNING: This session is from N days ago (threshold: 7 days). Things may have changed." —— 然后正常继续。

**用户直接提供文件路径（例如从队友那里转发来的）：**
读取它并遵循相同的简报流程 —— 无论来源如何，格式相同。

**会话文件为空或格式错误：**
报告："Session file found but appears empty or unreadable. You may need to create a new one with /save-session."

---

## 输出示例

```
SESSION LOADED: /Users/you/.claude/session-data/2024-01-15-abc123de-session.tmp
════════════════════════════════════════════════

PROJECT: my-app — JWT Authentication

WHAT WE'RE BUILDING:
User authentication with JWT tokens stored in httpOnly cookies.
Register and login endpoints are partially done. Route protection
via middleware hasn't been started yet.

CURRENT STATE:
PASS: Working: 3 items (register endpoint, JWT generation, password hashing)
 In Progress: app/api/auth/login/route.ts (token works, cookie not set yet)
 Not Started: middleware.ts, app/login/page.tsx

WHAT NOT TO RETRY:
FAIL: Next-Auth — conflicts with custom Prisma adapter, threw adapter error on every request
FAIL: localStorage for JWT — causes SSR hydration mismatch, incompatible with Next.js

OPEN QUESTIONS / BLOCKERS:
- Does cookies().set() work inside a Route Handler or only Server Actions?

NEXT STEP:
In app/api/auth/login/route.ts — set the JWT as an httpOnly cookie using
cookies().set('token', jwt, { httpOnly: true, secure: true, sameSite: 'strict' })
then test with Postman for a Set-Cookie header in the response.

════════════════════════════════════════════════
Ready to continue. What would you like to do?
```

---

## 说明

- 加载会话文件时绝不修改它 —— 它是只读的历史记录
- 简报格式是固定的 —— 即使章节为空也不要跳过
- "What Not To Retry" 必须始终显示，即使它只是说 "None" —— 它太重要了，不能遗漏
- 恢复之后，用户可能想在新会话结束时再次运行 `/save-session`，以创建一个新的带日期文件
