---
name: wiki-retrieve
description: "Compound Vault 的混合检索原语。用上下文前缀 + BM25 + 余弦重排序替换 v1.6 的静态热→索引→深度读取顺序，基于 Anthropic 2024 年 9 月的上下文检索研究（检索失败率降低 35-49-67%）。通过 `bash bin/设置-retrieve.sh` 选择加入；由 wiki-查询 和 autoresearch 进行特征检测。"
allowed-tools: Read Bash
---

# wiki-retrieve：Vault 的混合检索

v1.6 的查询路径是 `Read(hot.md) → Read(index.md) → Read(3-5 pages) → synthesize`。它有效，但每当答案存在于特定段落而非整个页面时，页面级粒度就输给了块级粒度。v1.7 的 `wiki-retrieve` 技能是块级升级——可选加入、功能门控，如果不运行设置则不会替换任何现有功能。

**来源**：此技能是 claude-obsidian 原创的。没有上游 kepano 等价物。该技术来自 [Anthropic 2024 年 9 月的上下文检索研究](https://www.anthropic.com/news/contextual-retrieval)——我们将其实现为 agent-skill 管道。

