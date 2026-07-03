---
name: lemmaly
description: "算法优先原则：在编写循环、查询或递归之前声明 Big-O、数据结构和算法家族。捕获 O(n^2)、N+1 和暴力破解默认值。"
risk: safe
source: community
source_repo: morsechimwai/lemmaly
source_type: community
date_added: "2026-05-26"
author: morsechimwai
tags: [algorithms, big-o, performance, code-review, complexity, gateway]
tools: [claude-code, antigravity, cursor, gemini-cli, codex-cli]
license: "Apache-2.0"
license_source: "https://github.com/morsechimwai/lemmaly/blob/main/LICENSE"
---

# lemmaly — Algorithm-First Proof

The model already knows Big-O, hash tables, divide-and-conquer, dynamic programming, sorting, graph algorithms, and amortized analysis. It just does not apply them spontaneously. lemmaly fixes the behavior, not the knowledge.

This skill is the gateway for an algorithm-discipline suite of four skills (`lemmaly`, `mathguard`, `invariant-guard`, `complexity-cuts`). It enforces the hard rules that every other guard in the suite assumes.

**Violating the letter of these rules is violating the spirit of the skill.** "Just this once" is how O(n²) ships to production.

## When to Use This Skill

Use **lemmaly** when:

- Writing, editing, or reviewing code that involves loops, collections, lookups, searches, joins, recursion, graphs, queries, or any computation over more than a handful of items.
- About to write a `for` inside a `for`, `.find` / `.includes` / `.indexOf` inside a loop, `await` inside `for` / `map` / `forEach` over independent items, or one query per item in a collection.
- Auditing a codebase / PR for known anti-patterns (await-in-loop, `.includes` inside `.filter`, string-concat in loop, `SELECT *`, N+1, etc.).
- Reviewing AI-generated code that "looks idiomatic" but might hide O(n²) or N+1.

When in doubt, **start at lemmaly** — it is the gateway and will tell you when to escalate to its three sibling skills.

| If you are about to… | Use | Why |
| ---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 35 MINUTES 38 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE