---
name: 数学奥林匹克
description: "数学奥林匹克 — 数学奥林匹克相关功能和最佳实践"
  通过自我验证难以发现的错误检测来验证数学竞赛解答。当被要求
  '解决这个 IMO 问题'、'证明这个奥林匹克不等式'、'验证
  这个竞赛证明'、'找反例'、'这个证明正确吗'，或任何包含
  'IMO'、'Putnam'、'USAMO'、'奥林匹克'或'竞赛数学'的
  问题时激活。使用纯推理（无工具）——然后一个全新的上下文对抗
  验证器使用特定的失败模式攻击证明，而非通用的'检查逻辑'。
  输出校准的置信度——如果不能自信解决会明确说明
  rather than bluff. If LaTeX is available, produces a clean PDF after
  verification passes."
version: 0.1.0
---

# 数学奥林匹克解题器

## The five things that change outcomes

1. **Strip thinking before verifying** — a verifier that sees the reasoning is
   biased toward agreement. Fresh context, cleaned proof only.
2. **"Does this prove RH?"** — if your theorem's specialization to ζ is a famous
   open problem, you have a gap. Most reliable red flag.
3. **Short proof → extract the general lemma** — try 2×2 counterexamples. If
   general form is false, find what's special about THIS instance.
4. **Same gap twice → step back** — the case split may be obscuring a unified
   参数. Three lines sometimes does what twelve pages couldn't.
5. **Say "no confident solution"** — wrong-and-confident is worse than honest
   abstain.

