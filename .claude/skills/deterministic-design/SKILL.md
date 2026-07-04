---
name: deterministic-design
description: "渲染 UI 并证明其平衡且可用：确定性布局审计（质心/光学中心/像素天平，通过显式数学加注释截图）加上由独立的 fresh-eyes 判断者进行的视觉判断 Nielsen 可用性审计。纯粹品味导向的设计技能缺乏的度量层。"
risk: safe
source: community
source_type: community
source_repo: connerkward/deterministic-design-skill
date_added: "2026-06-16"
author: Conner K Ward
license: MIT
tags:
  - design
  - layout
  - usability
  - audit
  - verification
  - vision
tools:
  - claude-code
  - antigravity
  - cursor
  - gemini-cli
  - codex-cli
---
## When to Use

Use to catch AI-generated UI that "looks off", is misaligned or centered-mush, or fails usability — when you need to PROVE a layout is balanced and usable instead of trusting the model's eye. Compose it with any taste/token design skill before reporting design "done".

_Source: [connerkward/deterministic-design-skill](https://github.com/connerkward/deterministic-design-skill) (MIT)._

# deterministic-design

Thesis: **determinism beats AI randomness.** A model can't trust its own eye on layout — so
don't. Render the UI and *measure* it.

Two sub-skills (load as needed):
- **[design-spatial](https://github.com/connerkward/deterministic-design-skill/blob/main/design-spatial/SKILL.md)** — deterministic layout audit: explicit grid
  + 8-pt spacing, and `layout-audit.js` computes centroid / optical-center / pixel-oracle
  balance and draws an annotated screenshot. **Numbers, not vibes.** Plus a render-then-
  critique vision loop.
- **[design-ux](https://github.com/connerkward/deterministic-design-skill/blob/main/design-ux/SKILL.md)** — usability audit: scores the rendered UI against
  Nielsen's 10 + interaction heuristics via a SEPARATE fresh-eyes judge → prioritized fix list.

This **improves** existing design skills (including the default Anthropic one) by adding the
layer they lack — it doesn't just advise on taste, it renders, measures, and judges the
output. Composable with any design skill.

In central this lives as a subdir of ckw-design; it **publishes separately** as
`deterministic-design-skill` (its own distribution) via publish-skill. One of the two
flagship narratives — the *determinism* one; its sibling is human-in-the-loop (lookdev).

## 局限性

- Layout metrics and vision-judged audits catch many spatial and usability failures, but they are not a substitute for product judgment or user testing.
- The workflow requires a rendered UI or screenshot; it cannot validate components that have not been built or captured.
- Automated scoring can miss brand nuance, copy tone, accessibility needs, and domain-specific user expectations.
