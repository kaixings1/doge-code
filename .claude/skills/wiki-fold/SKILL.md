---
name: wiki-fold
description: "将 wiki 日志条目汇总到元页面。从 wiki/log.md 读取最后 2^k 条条目，将结构幂等的折叠页面写入 wiki/folds/，链接回子页面。提取式总结（不发明）。默认为 dry-run 模式，仅 stdout；commit 模式写入并接受 PostToolUse hook 自动提交。"
---

# wiki-fold: Extractive Log Rollup

Implements a bounded subset of Mechanism 1 from [[DragonScale Memory]]: flat fold over raw `wiki/log.md` entries. Fold-of-folds (hierarchical level-stacking) is **out of scope for this skill**; see "Scope boundary" below.

A fold is **additive**: child log entries and their referenced pages are never modified, moved, or deleted. A fold is **extractive**: every outcome and theme in the output must be traceable to a specific child log entry. No invented facts, no synthesis beyond what the child entries support.

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 41 MINUTES 58 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE