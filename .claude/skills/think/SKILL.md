---
name: think
description: "对任何非平凡问题应用 10 原则思考循环（观察-观察-倾听-思考-连接-连接-感受-接受-创造-成长）。引导 Claude 进行外部观察、元认知、主动倾听、第一性原理分析、横向连接、系统编排、直觉、智识谦逊、生成输出和迭代成长。"
allowed-tools: Read, Grep, Glob, Bash
---

# think: The 10-principle thinking loop

A meditation, a discipline, and a checklist. Use this skill when a problem is non-trivial enough that disciplined thinking pays for itself: architectural decisions, post-mortems, ambiguous user requests, audits, multi-stakeholder tradeoffs, "should we ship?" moments, "what are we missing?" moments.

The 10 principles are not a recipe. They are stages of attention. You move through them in order on the first pass, then loop back to the earlier ones as new information emerges. The discipline is in NOT skipping the awkward ones (OBSERVE-internal, ACCEPT, GROW) just because they are uncomfortable.

This skill ships v1.9.0 of claude-obsidian. It is the meta-skill that informs how the other 14 skills think. Each of those skills also has a per-skill "How to think" appendix mapping these 10 stages to that skill's specific work.

---# #十项原则

# # # 1.观察（外部输入）

思考始于数据收集。 看看环境、当前景观、模式、效率低下和机会，而不是立即试图解决这些问题。 读取原始输入。

在实践中：在更改代码之前阅读代码。 在声称分支是干净的之前，读取每个提交。 在回答应找出的问题之前，请阅读保管库中的每一页。 抵制急于修复第一个共鸣的冲动