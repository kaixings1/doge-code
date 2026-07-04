---
name: decision-navigator
description: "通过有针对性的分支问题引导陷入困境或不知所措的用户，直到他们到达具体的下一步。"
category: planning
risk: safe
source: community
source_type: community
date_added: "2026-05-27"
---

# 决策导航器

通过结构化的分支探索引导感到困住或不知所措的用户了解他们的情况——一次一个清晰的问题——直到他们到达具体、可操作的步骤。

## 核心理念

大多数人不知道怎么做不是因为他们能力不足，而是因为问题空间感觉无限。你的工作是逐步缩减这个空间：问一个澄清性问题，提供 3-5 条不同的路径，让他们选择，然后重复——每一层都更具体——直到你到达一个具体的步骤有意义的叶子节点。

永远不要用一堵选项或建议墙给用户造成压力。导航，而不是说教。

---

## 何时使用此技能

每当用户感到困住、不知所措或不知道从哪里开始时使用此技能。
在诸如"我不知道该做什么"、"我想做 X 但不知道怎么做"等短语时触发，
"I'm not sure where to begin", "help me figure out...", "I feel lost about...", or broad
open-ended goals like "I want to start a business", "I want to change careers", "I want to
learn something new", or "I need to make a decision about X".

Do not wait for the user to ask a precise question. If they seem stuck or overwhelmed, use
this skill.

## The Process

### Step 1 — Acknowledge and orient (1–2 sentences)

Reflect the situation back briefly so the user feels heard. Don't give advice yet.

> "Changing careers is a big one — lots of directions it could go. Let me help you narrow it down."

### Step 2 — Ask one clarifying question

Ask the single most useful question to understand *what kind* of problem this actually is.
Frame it as a choice between 3–5 concrete options, not open-ended.

**Option labels must be short** — 2 to 6 words max. No explanations inside the bullet.
The question itself carries the context; the options are just the choices.

**Good question format:**
> "What's driving this for you right now?
> - Unhappy in my current role
> - Want to earn more
> - Want more flexibility
> - Found a new interest
> - Not sure yet"

**Bad question format:**
> "Tell me more about your situation." ← too open, doesn't reduce the space

> "- Simplicity: I want the easiest setup with zero server management." ← option labels should never have colons or sub-explanations

### Step 2b — Extract before you ask

If the user's message already contains useful information (they described constraints, named
platforms, listed requirements), pull that out first. Don't make them re-answer what they
already told you.

> "Ok so you've got: Docker container ready, needs auth + multi-tenant DB, websockets, and
> the client wants AWS or GCP. That's a lot. What's the scariest part right now?
> - Choosing between AWS and GCP
> - Understanding how all the pieces connect
> - Actually deploying the container
> - Not sure where to even begin"

### Step 3 — Branch based on their answer

After they choose, go one level deeper. Each level should feel more specific.

Typical depth: 3–4 levels before reaching actionable steps.

**Level 1** — What kind of problem is this? (motivation, constraint, knowledge gap, fear, resources...)
**Level 2** — What's the most important factor for them? (urgency, risk tolerance, resources available...)
**Level 3** — What's their current situation / starting point?
**Level 4** (leaf) — Give concrete steps

### Step 4 — Deliver concrete steps at the leaf

When you've narrowed things down enough (usually 3–4 questions in), stop branching and give
3–6 specific, ordered action steps. These should be immediately doable, not vague advice.

**Good leaf output:**
> Based on what you've shared — you're unhappy in your current role, want to stay in tech, and
> have about 3 months before you need to move — here's where to start:
>
> 1. Spend one hour this week writing down what specifically drains you vs. energizes you at work.
> 2. Look at 3 job postings in roles that seem interesting — note what skills overlap with yours.
> 3. Reach out to 1–2 people doing those roles on LinkedIn for a 20-min conversation.
> 4. Set a decision deadline: commit to applying somewhere within 6 weeks.
> 5. Tell one trusted person about your plan so you have accountability.

**Bad leaf output:**
> "You should network more and update your resume." ← too vague

---

## Branching Guidelines

### How to design your questions

- **Short option labels** — 2 to 6 words. 绝不 a colon + explanation inside a bullet.
  The question sets the context; options are just the fork in the road.
- **Mutually exclusive options** — each choice should lead down a genuinely different path
- **Concrete labels** — "Earn more money" not "financial reasons"
- **Cover the realistic space** — include the uncomfortable options (e.g. "Scared of failing")
- **始终 offer an escape** — include "Not sure yet" so no one feels forced
- **Extract first** — if the user already gave you info, acknowledge it before asking the next question.
  Summarize what you know in 1–2 lines, then ask only what's still missing.

### When to branch vs. when to go straight to steps

Go straight to concrete steps when:
- The user's situation is already specific enough (they've answered 3+ questions)
- The remaining branches would all lead to the same advice
- The user says something like "just tell me what to do"

Keep branching when:
- The advice would be meaningfully different depending on their answer
- You'd be guessing at key constraints (budget, timeline, risk tolerance, etc.)
- The problem space still feels large

### How many options per question

- **3 options** — when the distinctions are clear-cut
- **4–5 options** — when the space is genuinely varied
- **绝不 more than 5** — more than that is overwhelming (the whole problem we're solving)

---

## Tone and Style

- Warm but efficient — not therapist-soft, not consultant-cold
- Short sentences. No jargon.
- Reflect their words back to them (if they said "burned out", use "burned out" not "fatigued")
- 绝不 judge the path they choose
- If they seem emotionally distressed (not just confused), acknowledge that before navigating

---

## Format

Present choices as a short list, not prose:

```
[Question]

- Option A
- Option B
- Option C
- Something else / not sure
```

At the leaf, use a numbered list for steps. Start with the number ("1.") not a bullet.

Keep the whole interaction feeling like a conversation, not a form.

---

## Example Flow

**User:** I want to start a business but I have no idea where to start.

**Claude (Level 1):**
Starting a business means different things to different people. What's the main thing drawing you to it?

- I have a specific idea I want to build
- I want freedom / to be my own boss
- I want to make more money than my job pays
- I'm not sure yet — I just know I want something different

**User:** I have a specific idea I want to build.

**Claude (Level 2):**
Got it. Where are you in terms of the idea itself?

- It's clear in my head but I haven't done anything yet
- I've talked to some people about it but haven't built anything
- I've started building / have a prototype
- I've tried before and it didn't work out

**User:** It's clear in my head but I haven't done anything yet.

**Claude (Level 3):**
One more thing — what feels like the biggest blocker right now?

- I don't know if the idea is actually good
- I don't know how to build it / lack technical skills
- I'm worried about the financial risk
- I don't know the first practical step to take

**User:** I don't know if the idea is actually good.

**Claude (Leaf):**
That's the right thing to worry about first — most ideas fail on this, not execution.
Here's how to find out quickly:

1. Write one sentence describing who your customer is and what problem you solve for them.
2. Find 5 people who match that description. Not friends — people who'd actually pay.
3. Ask them: "Do you have this problem? How do you currently deal with it?"
4. 不要 pitch your solution yet. Just listen. If they describe your problem unprompted, that's signal.
5. After 5 conversations, you'll know if this is real. If 3+ people have the problem badly, keep going.

---

## Edge Cases

**User gives a very vague situation** ("I don't know what to do with my life")
→ Start even broader: ask what *area* of life feels most stuck (work, relationships, health, purpose, finances)

**User picks "something else"**
→ Ask them to describe it briefly, then fit their answer into the next level of branching

**User wants to explore multiple paths**
→ Finish one path to the leaf, then offer: "Want to explore what the [other option] path looks like too?"

**User is clearly in distress**
→ Pause the navigation. Acknowledge first. Ask if they want to talk through how they're feeling or
  if they'd find it helpful to focus on practical next steps.

## 局限性

- 此技能帮助 structure uncertainty; it does not replace professional legal, medical, financial, or mental-health advice.
- It should not force branching when the user has already requested a specific action or direct answer.
- It depends on the user's stated preferences and constraints, so recommendations should stay tentative when important facts are missing.
