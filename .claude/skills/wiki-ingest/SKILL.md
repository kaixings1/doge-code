---
name: wiki-ingest
description: "将源文件导入 Obsidian wiki vault。读取源，提取实体和概念，创建或更新 wiki 页面，交叉引用并记录操作。支持文件、URL 和批处理模式。"
---

# wiki-ingest：来源导入

读取来源。写入 Wiki。交叉引用一切。一个来源通常涉及 8-15 个 Wiki 页面。

**语法标准**：使用正确的 Obsidian 风味 Markdown 编写所有 Obsidian Markdown。Wiki 链接使用 `[[笔记名称]]`，标注使用 `> [!type] 标题`，嵌入使用 `![[文件]]`，属性使用 YAML 前置元数据。如果安装了 kepano/obsidian-skills 插件，优先使用其规范的 obsidian-markdown 技能作为 Obsidian 语法参考。否则，遵循此技能中的指南。

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 41 MINUTES 57 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE