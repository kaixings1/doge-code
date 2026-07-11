---
name: 深度探究
description: 深度探究 — 基于DAG查询规划的Claude原生深度研究，结合网络搜索和代码分析。
user-invocable: true
参数: The research question or topic to investigate deeply
---

# 深度探究

使用与 Google Deep Research 相同的基于 DAG 的规划模式进行自主深度研究——但完全在 Claude Code 上运行，无外部依赖。

## 工作原理

1. **规划** — 将问题分解为具有依赖关系的子问题 DAG
2. **扇出** — 通过 Agent 子代理并行运行独立的子问题
3. **Gap analysis** — each subagent returns findings + identified gaps
4. **Iterate** — gaps become new sub-questions, fed back into the DAG
5. **Synthesize** — once all nodes complete, produce a final report

## Steps

### 1. Decompose into a DAG

Given the research question, generate a DAG of sub-questions. Each node has:
- **id**: short identifier (e.g., `q1`, `q2a`)
- **question**: the specific sub-question to research
- **depends_on**: list of node IDs whose answers are needed first (empty = no dependencies)

**Rules for decomposition:**
- Start with foundational/context-setting questions that have no dependencies
- Build toward analytical/comparative questions that depend on foundational answers
- Aim for 4-8 nodes. If the topic needs more, cap at 12.
- Each node should be answerable with 1-3 web searches
- Questions should be specific enough that a researcher with no other context can answer them

**Print the DAG** as a table so the first brain can see the plan, then immediately proceed to execution — do not wait for confirmation.

**Create a task for each DAG node** using TaskCreate (description: the sub-question, status: pending). Also create tasks for "Gap analysis" and "Synthesize report". Update each task to `in_progress` when its wave launches and `completed` when the subagent returns. This gives the first brain real-time visibility into progress.

```
| ID | Question | Depends on |
|----|----------|------------|
| q1 | ...      | —          |
| q2 | ...      | —          |
| q3 | ...      | q1         |
| q4 | ...      | q1, q2     |
```

### 2. Execute in dependency order

Process the DAG in topological order:

**Wave 1:** Mark all Wave 1 node tasks as `in_progress`. Launch all nodes with no dependencies as **parallel Agent subagents**. As each subagent returns, mark its task `completed`. Each subagent gets this prompt:

```
You are a focused researcher. Answer this ONE question using web search:

Question: [the sub-question]

Instructions:
- Use WebSearch to find current, authoritative information
- Use 1-3 searches maximum
- Be specific and cite what you find

Return your answer in this exact format:

## Findings
[Your answer with specific facts, dates, numbers. Cite sources inline.]

## Gaps
[List anything you couldn't fully answer, contradictions you found, or
follow-up questions that would strengthen the answer. If none, say "None."]

## Sources
[List each source as: Title — URL]
```

**Citation persistence:** After each wave completes, append all sources from that wave to a file at `/tmp/deep-dive-sources-[topic-标识符].json` as an array of `{"node_id", "title", "url"}` objects. This survives context compaction — if subagent results get compressed out of context, the sources file remains the source of truth. Read this file during synthesis to build the final Sources section.

**Wave 2+:** Once Wave 1 completes, mark all Wave 2+ node tasks as `in_progress` and launch nodes whose dependencies are now satisfied. Mark each task `completed` as its subagent returns. Include the findings from dependency nodes in the subagent prompt:

```
You are a focused researcher. Answer this ONE question using web search:

Question: [the sub-question]

Context from prior research:
[Paste findings from dependency nodes]

[same instructions as above]
```

Continue until all nodes complete.

### 3. Gap iteration (max 1 round)

Mark the "Gap analysis" task as `in_progress`. After all nodes complete, review the collected gaps across all subagents:
- If gaps are minor or don't affect the final answer: skip, move to synthesis
- If any gap is significant enough to change the conclusion: create 1-3 new targeted sub-questions and run them as a final parallel wave

Only do ONE gap iteration round. This is not an infinite loop.

Mark the "Gap analysis" task as `completed` when done (whether gaps were found or skipped).

### 4. Synthesize

Mark the "Synthesize report" task as `in_progress`. Combine all findings into a final report. Mark it `completed` when the report file is written. Structure:

```markdown
## Deep Dive: [Topic]

### Executive Summary
[3-5 sentences: the key takeaway]

### Findings

#### [Theme/Section 1]
[Synthesized findings from relevant nodes, not just copy-paste]

#### [Theme/Section 2]
[...]

### Open Questions
[Anything that couldn't be resolved — be honest about what's still unclear]

### Sources
[Deduplicated list of all sources from all subagents]
```

## 规则

- **始终 show the DAG plan first.** Print it, then immediately start researching — no confirmation needed.
- **Parallel where possible.** Independent questions should always run as concurrent subagents.
- **One gap round max.** Don't spiral into infinite research loops.
- **Synthesize, don't concatenate.** The final report should read as a coherent document, not a list of subagent outputs stapled together.
- **Be honest about confidence.** If the research didn't produce clear answers, say so. Don't fill gaps with speculation.
- **始终 persist the final report.** After synthesis, save the report as a markdown file in the appropriate project's `docs/deep-dive/` directory (create it if needed). Determine the project root from the current working directory or the context of the research 请求. Use a slugified topic name with date as the filename (e.g., `2026-04-02-jira-docs-from-microservices.md`). 绝不 write final reports only to `/tmp` — they must land in a durable location within the relevant project.
