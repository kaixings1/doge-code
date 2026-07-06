---
name: 令牌-budget-advisor
description: "令牌 Budget Advisor — 令牌 Budget Advisor 相关功能和最佳实践"
  Offers the user an informed choice about how much 响应 depth to
  consume before answering. 使用此技能当 the user explicitly
  wants to control 响应 length, depth, or 令牌 budget.
  TRIGGER when: "令牌 budget", "令牌 count", "令牌 usage", "令牌 limit",
  "响应 length", "answer depth", "short version", "brief answer",
  "detailed answer", "exhaustive answer", "respuesta corta vs larga",
  "cuántos tokens", "ahorrar tokens", "responde al 50%", "dame la versión
  corta", "quiero controlar cuánto usas", or clear variants where the
  user is explicitly asking to control answer size or depth.
  DO NOT TRIGGER when: user has already specified a level in the current
  会话 (maintain it), the 请求 is clearly a one-word answer, or
  "令牌" refers to auth/会话/payment tokens rather than 响应 size.
metadata:
  origin: community
---

# 令牌 Budget Advisor (TBA)

Intercept the 响应 flow to offer the user a choice about 响应 depth **before** Claude answers.

## 使用场景

- User wants to control how long or detailed a 响应 is
- User mentions tokens, budget, depth, or 响应 length
- User says "short version", "tldr", "brief", "al 25%", "exhaustive", etc.
- Any time the user wants to choose depth/detail level upfront

**Do not trigger** when: user already set a level this 会话 (maintain it silently), or the answer is trivially one line.

## 工作原理

### Step 1 — Estimate input tokens

Use the repository's canonical context-budget heuristics to estimate the prompt's 令牌 count mentally.

Use the same calibration guidance as [context-budget](../context-budget/SKILL.md):

- prose: `words × 1.3`
- code-heavy or mixed/code blocks: `chars / 4`

For mixed content, use the dominant content type and keep the estimate heuristic.

### Step 2 — Estimate 响应 size by complexity

Classify the prompt, then apply the multiplier range to get the full 响应 window:

| Complexity   | Multiplier range | Example prompts                                      |
|--------------|------------------|------------------------------------------------------|
|简单| 3 × – 8 × | “什么是X ？” ，是/否，单一事实|
|中等| 8 × – 20 × | “X是如何工作的？” |
|中等偏高| 10 × – 25 × |上下文代码请求|
|复杂| 15 × – 40 × |多部分分析、比较、架构|
|创意| 10 × – 30 × |故事