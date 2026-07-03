---
name: wiki-retrieve
description: "Compound Vault 的混合检索原语。用上下文前缀 + BM25 + 余弦重排序替换 v1.6 的静态热→索引→深度读取顺序，基于 Anthropic 2024 年 9 月的上下文检索研究（检索失败率降低 35-49-67%）。通过 `bash bin/setup-retrieve.sh` 选择加入；由 wiki-query 和 autoresearch 进行特征检测。"
allowed-tools: Read Bash
---

# wiki-retrieve: Hybrid Retrieval over the Vault

The v1.6 query path was `Read(hot.md) → Read(index.md) → Read(3-5 pages) → synthesize`. It worked, but page-level granularity loses to chunk-level granularity any time the answer lives in a specific passage rather than a whole page. The v1.7 `wiki-retrieve` skill is the chunk-level upgrade — opt-in, feature-gated, and replaces nothing if you don't run the setup.

**Origin**: This skill is original to claude-obsidian. There is no upstream kepano equivalent. The technique is from [Anthropic's Sept 2024 Contextual Retrieval research](https://www.anthropic.com/news/contextual-retrieval) — we implement it as agent-skill plumbing.

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 41 MINUTES 51 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE