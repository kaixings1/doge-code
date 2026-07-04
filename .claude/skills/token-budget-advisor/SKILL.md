---
name: token-budget-advisor
description: "Token Budget Advisor — Token Budget Advisor 相关功能和最佳实践"
  Offers the user an informed choice about how much response depth to
  consume before answering. 使用此技能当 the user explicitly
  wants to control response length, depth, or token budget.
  TRIGGER when: "token budget", "token count", "token usage", "token limit",
  "response length", "answer depth", "short version", "brief answer",
  "detailed answer", "exhaustive answer", "respuesta corta vs larga",
  "cuántos tokens", "ahorrar tokens", "responde al 50%", "dame la versión
  corta", "quiero controlar cuánto usas", or clear variants where the
  user is explicitly asking to control answer size or depth.
  DO NOT TRIGGER when: user has already specified a level in the current
  session (maintain it), the request is clearly a one-word answer, or
  "token" refers to auth/session/payment tokens rather than response size.
metadata:
  origin: community
---

# Token Budget Advisor (TBA)

Intercept the response flow to offer the user a choice about response depth **before** Claude answers.

## When to Use

- User wants to control how long or detailed a response is
- User mentions tokens, budget, depth, or response length
- User says "short version", "tldr", "brief", "al 25%", "exhaustive", etc.
- Any time the user wants to choose depth/detail level upfront

**Do not trigger** when: user already set a level this session (maintain it silently), or the answer is trivially one line.

## How It Works

### Step 1 — Estimate input tokens

Use the repository's canonical context-budget heuristics to estimate the prompt's token count mentally.

Use the same calibration guidance as [context-budget](../context-budget/SKILL.md):

- prose: `words × 1.3`
- code-heavy or mixed/code blocks: `chars / 4`

For mixed content, use the dominant content type and keep the estimate heuristic.

### Step 2 — Estimate response size by complexity

Classify the prompt, then apply the multiplier range to get the full response window:

| Complexity   | Multiplier range | Example prompts                                      |
|--------------|------------------|------------------------------------------------------|
|简单| 3 × – 8 × | “什么是X ？” ，是/否，单一事实|
|中等| 8 × – 20 × | “X是如何工作的？” |
|中等偏高| 10 × – 25 × |上下文代码请求|
|复杂| 15 × – 40 × |多部分分析、比较、架构|
|创意| 10 × – 30 × |故事