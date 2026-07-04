---
name: math-olympiad
description: "Math Olympiad — Math Olympiad 相关功能和最佳实践"
  verification that catches the errors self-verification misses. Activates when
  asked to 'solve this IMO problem', 'prove this olympiad inequality', 'verify
  this competition proof', 'find a counterexample', 'is this proof correct', or
  for any problem with 'IMO', 'Putnam', 'USAMO', 'olympiad', or 'competition
  math' in it. Uses pure reasoning (no tools) — then a fresh-context adversarial
  verifier attacks the proof using specific failure patterns, not generic 'check
  logic'. Outputs calibrated confidence — will say 'no confident solution'
  rather than bluff. If LaTeX is available, produces a clean PDF after
  verification passes."
version: 0.1.0
---

# Math Olympiad Solver

## The five things that change outcomes

1. **Strip thinking before verifying** — a verifier that sees the reasoning is
   biased toward agreement. Fresh context, cleaned proof only.
2. **"Does this prove RH?"** — if your theorem's specialization to ζ is a famous
   open problem, you have a gap. Most reliable red flag.
3. **Short proof → extract the general lemma** — try 2×2 counterexamples. If
   general form is false, find what's special about THIS instance.
4. **Same gap twice → step back** — the case split may be obscuring a unified
   argument. Three lines sometimes does what twelve pages couldn't.
5. **Say "no confident solution"** — wrong-and-confident is worse than honest
   abstain.

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 34 MINUTES 04 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE