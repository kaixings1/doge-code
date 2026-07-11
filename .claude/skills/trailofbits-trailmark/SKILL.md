---
name: trailmark 痕迹标记工具
description: 源代码图分析用于安全审计，将代码解析为可查询的函数/类/调用图。
---

# trailmark 痕迹标记工具

**Source code graph analysis for security auditing.** Parses code into queryable graphs of functions, classes, and calls, then uses that structure for diagram generation, mutation testing triage, protocol verification, and differential review.

These skills target Trailmark 0.2.x. 优先 `--language auto`,
`trailmark.parse.detect_languages()`, and `QueryEngine.preanalysis()`
instead of older 0.1.x-era manual language detection workflows.

## 前提条件

[Trailmark](https://pypi.org/project/trailmark/) ([source](https://github.com/trailofbits/trailmark)) must be installed:

```bash
uv pip install trailmark
```

## Skills

| Skill | Description |