---
name: StyleSeed 设计判断引擎
description: StyleSeed 设计判断引擎 — 69 条视觉规则，使 AI 输出看起来经过设计而非生成，涵盖色彩、空间节奏、信息层级和阴影。
---

# StyleSeed 设计判断引擎

> Teaches Claude Code design judgment, not just design data. 69 visual rules that make AI output look designed, not generated.

## What It Teaches

- **Color discipline** — `#2A2A2A` as refined black, 5-level grayscale, one accent color maximum
- **Spatial rhythm** — alternating section heights, 2:1 number-to-unit ratios
- **Information hierarchy** — card/background separation, progressive density
- **Shadow & elevation** — 4% opacity ceiling, dark mode border substitution
- **Component variance** — never 4 identical KPI cards, stagger content types
- **Motion & feedback** — 200ms normal, spring for entrance, ease-out for exit

## 快速开始

```bash
# Copy engine into your project
cp -r styleseed/engine/* your-project/

# Or just point Claude at the repo
# "Refer to https://github.com/bitjaru/styleseed — read engine/CLAUDE.md and DESIGN-LANGUAGE.md"
```

## Includes

- 69 visual design rules (brand-agnostic)
- 48 React components (shadcn-style, Tailwind CSS v4 + Radix UI)
- 11 slash commands (`/ss-page`, `/ss-review`, `/ss-audit`, `/ss-lint`, etc.)
- Swappable brand skins (Toss, Stripe, Linear, Vercel, Notion, Raycast, Arc)

## Links

- **Repository:** https://github.com/bitjaru/styleseed
- **Live demo:** https://styleseed-demo.vercel.app
- **许可证:** MIT
