---
description: 在不打断当前任务或丢失上下文的情况下回答一个快速的侧边问题。回答后自动恢复工作。
---

# Aside 命令

在任务进行中提问，立即获得聚焦的回答 —— 然后从你中断的地方继续。当前任务、文件和上下文绝不会被修改。

## 何时使用

- 当 Claude 正在工作时你对某事感到好奇，又不想失去节奏
- 你需要 Claude 正在编辑的代码的快速解释
- 你想要关于某个决策的第二意见或澄清，而又不偏离任务
- 你需要先理解某个错误、概念或模式，再让 Claude 继续
- 你想问与当前任务无关的事，又不想开启新会话

## 用法

```
/aside <你的问题>
/aside this function actually returns what?
/aside is this pattern thread-safe?
/aside why are we using X instead of Y here?
/aside what's the difference between foo() and bar()?
/aside should we be worried about the N+1 query we just added?
```

## 流程

### 第 1 步：冻结当前任务状态

回答任何内容之前，在脑中记录：
- 当前活动任务是哪个？（正在处理哪个文件、功能或问题）
- `/aside` 被调用时，正在进行哪个步骤？
- 接下来本来要发生什么？

在 aside 期间，**不要**触碰、编辑、创建或删除任何文件。

### 第 2 步：直接回答问题

以最简洁但仍完整有用的形式回答问题。

- 先给答案，再解释推理
- 保持简短 —— 如果需要完整解释，先提议在任务结束后深入展开
- 如果问题针对当前正在处理的文件或代码，精确引用它（相关时给出文件路径和行号）
- 如果回答需要读取文件，就读 —— 但只读，绝不写

按此格式响应：

```
ASIDE: [briefly restate the question]

[Your answer here]

— Back to task: [one-line description of what was being done]
```

### 第 3 步：恢复主任务

给出回答后，立即从暂停的确切位置继续活动任务。除非 aside 的回答揭示了阻塞项或重新考虑当前方案的理由（见边界情况），否则不要请求恢复的许可。

---

## 边界情况

**未提供问题（`/aside` 后面什么都没跟）：**
响应：
```
ASIDE: no question provided

What would you like to know? (ask your question and I'll answer without losing the current task context)

— Back to task: [one-line description of what was being done]
```

**问题揭示了当前任务的潜在问题：**
在恢复前明确标记出来：
```
ASIDE: [answer]

WARNING: Note: This answer suggests [issue] with the current approach. Want to address this before continuing, or proceed as planned?
```
在恢复前等待用户的决定。

**问题实际上是任务转向（而非侧边问题）：**
如果问题暗示要改变正在构建的东西（例如 `/aside actually, let's use Redis instead`），澄清：
```
ASIDE: That sounds like a direction change, not just a side question.
Do you want to:
  (a) Answer this as information only and keep the current plan
  (b) Pause the current task and change approach
```
等待用户的回答 —— 不要做假设。

**问题针对当前打开的文件或代码：**
从实时上下文作答。如果该文件在会话中较早读过，直接引用它。如果没有，现在读取它（只读）并给出带 file:line 引用的回答。

**没有活动任务（`/aside` 被调用时没有进行中的工作）：**
仍然使用标准包装，以保持响应形式一致：
```
ASIDE: [briefly restate the question]

[Your answer here]

— Back to task: no active task to resume
```

**问题需要很长的回答：**
简洁地给出核心答案，然后提议：
```
That's the short version. Want a deeper explanation after we finish [current task]?
```

**连续多个 `/aside` 问题：**
按顺序逐一回答。最后一个回答之后，恢复主任务。不要在连续 aside 链中丢失任务状态。

**Aside 的回答暗示需要修改代码：**
记录需要做的修改，但不要在 aside 期间进行：
```
ASIDE: [answer]

 Worth fixing: [what should be changed]. I'll flag this after the current task unless you want to address it now.
```

**问题含糊或过于宽泛：**
只问一个澄清性问题 —— 能获取回答所需信息的最短问题。不要问多个问题。

---

## 输出示例

```
User: /aside what does fetchWithRetry() actually do?

ASIDE: what does fetchWithRetry() do?

fetchWithRetry() (src/api/retry.ts:12) attempts the request up to 3 times with
exponential backoff (250ms → 500ms → 1s). It only retries on 5xx responses and
network errors — 4xx errors are treated as final and not retried.

— Back to task: refactoring the auth middleware in src/middleware/auth.ts
```

```
User: /aside is the approach we're taking thread-safe?

ASIDE: is the current approach thread-safe?

No — the shared cache object in src/cache/store.ts:34 is mutated without locking.
Under concurrent requests this is a race condition. It's low risk in a single-process
Node.js server but would be a real problem with worker threads or clustering.

WARNING: Note: This could affect the feature we're building. Want to address this now or continue and fix it in a follow-up?
```

---

## 说明

- 在 aside 期间绝不修改文件 —— 仅只读访问
- Aside 是对话的暂停，不是新任务 —— 原任务必须始终恢复
- 保持回答聚焦：目标是快速解除用户的阻塞，而不是发表长篇大论
- 如果 aside 引发了更大的讨论，先完成当前任务，除非 aside 揭示了阻塞项
- 除非与任务结果明确相关，否则 aside 不会保存到会话文件中
