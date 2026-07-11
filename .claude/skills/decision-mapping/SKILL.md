---
name: 决策映射相关功能和最佳实践
description: "Decision Mapping — 决策映射相关功能和最佳实践"
disable-model-invocation: true
---

# 决策映射

当一个不成熟的想法需要一个以上的代理会话才能转化为计划时，调用此技能。它在 markdown 文件中创建一个有状态的决策图，并通过一系列工单驱动用户解决未解决的问题——这可能涉及原型制作、研究或讨论。

## 决策图

决策图是一个紧凑的 Markdown 文件，每个规划工作一个，与项目一起进行 git 跟踪。它是规范性的工件——**整个图作为上下文加载到每个会话中**，因此它必须保持紧凑。

工单期间创建的资产应从图中链接，而不是在其中复制。

### 结构

编号条目（"工单"），每个都有自己以编号为键的部分：

```markdown
## #1：关系型还是非关系型数据库？

被以下阻塞：#<ticket-number>、#<ticket-number>
类型：研究 | 原型 | 追问

### 问题

<问题在此>

### 答案

<answer-here>
```

Each ticket must be sized to one 100K 令牌 agent 会话.

## Ticket Types

There are three types of tickets:

- **Research**: Reading documentation, third-party API's, or local resources like knowledge bases. Creates a markdown summary as an asset. Use this when knowledge outside the current working directory is required.
- **Prototype**: Writing UI or logic code to test a hypothesis, or to explore a design space. Uses the /prototype skill. Creates a prototype as an asset. Use this when "how should it look" or "how should it behave" is the key question.
- **Grilling**: Conversation with the agent. Uses the /grilling and /domain-modeling skills. Asks one question at a time. The default case.

## Fog of war

The map is _deliberately_ incomplete beyond the frontier. Your job is to investigate the frontier, and to resolve tickets in order to push the frontier forward. Push back the fog of war, one node at a time.

At some point, the fog of war should have been pushed back far enough that the path to the finish line is clear. At that point, no more tickets will be required and the decision map can be considered 'done'.

## Invocation

There are two ways this skill can be invoked: **bootstrap** and **resume**.

### Bootstrap

User invokes with a loose idea.

1. Run a /grilling + /domain-modeling 会话 to surface the open decisions. Ask one question at a time.
2. Write a new decision map — mostly fog, frontier identified, trivially-decidable entries resolved inline.
3. Stop. Map-building is one 会话's work; do not also resolve tickets.

### Resume

User invokes with a path to an existing map and a ticket number.

1. Load the **whole map** as context.
2. Run a 会话 to resolve the ticket, invoking skills as needed. If in doubt, use `/grilling` and `/domain-modeling`.
3. Record what the 会话 resolved in the ticket's body.
4. Add newly-discovered tickets (with correct `blocked_by` edges).
5. Stop.

If the decisions made invalidate other parts of the map, update or delete those nodes.

## Parallelism

The user may choose to run tickets in parallel, so expect other agents to make changes to the map.

## Skipping The Decision Map

Many times, the initial grilling will result in no fog of war. No unresolved tickets. Nothing to do, except implement.

In those situations, you should offer the user the chance to skip the decision map - since the decision map is only needed if multi-会话 decisions need to be made.

If they skip it, you should recommend either implementing directly or using `/to-prd` to schedule a multi-会话 implementation.
