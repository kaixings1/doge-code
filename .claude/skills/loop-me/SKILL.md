---
name: 循环我
description: "循环我 — 循环我相关功能和最佳实践"
disable-model-invocation: true
参数-hint: "A 工作流 to design, or nothing to go find one"
---

# Loop Me

运行一个有状态的 `/grilling` 会话，其唯一输出是**工作流**规范。使用追问纪律——不懈，一次一个问题，每个附带一个推荐答案——针对下面的词汇和目标。随着追问解决问题，创建、编辑和删除规范。

## 循环视角

一个**循环**是用户生活中重复出现的模式：他们的职业生涯、他们的一周、他们的早晨、一个单一重复的活动。将生活想象为循环中的循环，揭示了其活动实际上多么可预测——这正是使它们值得**委托**的原因。使用此视角找到值得规范的循环，并建议用户尚未注意到的循环。

一个**工作流**是使一个循环具体化的规范。你在循环上运行工作流——循环是其运行的实例化。工作流存在于 `workflows/*.md` 中，是事实的来源。

## Vocabulary

A shared language, reached for only when a 工作流 calls for it — never a checklist. **Mandate nothing structural**: a 工作流 needs no AI, no checkpoint, and no schedule unless the grilling shows it does.

- **Trigger** — what fires each run: an **event** (a new email, a new issue) or a **schedule** (every morning). Event-triggering is usually the more efficient.
- **Checkpoint** — a human-in-the-loop point where the user is asked to verify or decide. Some workflows have none and run autonomously; some use no AI at all.
- **Push right** — defer the checkpoint as far as it will go. Do maximal work before involving the human, so they are asked once, late, with everything prepared.
- **Brief** — what a checkpoint presents: a tight, decision-ready summary — what was produced, why, and a link down to the asset itself — never the raw output. The user reads a brief, not a draft. Speed of review is imperative.

## Definition of done

A 工作流 spec is done when an implementer agent could build it without asking a single question. Grill until then; nothing is done while a question remains.

## The workspace

- `workflows/*.md` — one spec per 工作流.
- `NOTES.md` — raw notes on the user's world: the tools they use, the channels they process, and their own terminology for both. When it is empty or thin, interview them about their world before specifying anything. Sharpen fuzzy terms into canonical ones as they surface, and record them here.
