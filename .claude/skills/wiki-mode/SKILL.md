---
name: wiki-mode
description: "知识库方法模式。让知识库声明一种组织风格（LYT / PARA / 卡片盒笔记法 / 通用模式），wiki-ingest、save 和 autoresearch 在归档新内容前会参考此模式。读取 `.vault-meta/mode.json`；当文件不存在时默认为 `generic` 模式（保持 v1.6/v1.7 行为）。根据 2026 年 5 月指南文档，方法论支持曾是等级 5 的优先差距——没有其他 Claude+Obsidian 竞争对手将其作为一级技能提供。触发词：set vault mode, switch to PARA, use LYT, what's my vault mode, zettelkasten 设置, wiki mode, methodology mode, change mode, configure mode。"
allowed-tools: Read, Write, Bash
---

# wiki-mode：知识库组织方法模式

v1.6 + v1.7 版本的知识库结构是无偏见的——`wiki/sources/`、`wiki/entities/`、`wiki/concepts/` 等等。这对有自己的组织直觉的高级用户有效。但它**无法服务**那些希望遵循一种命名方法论的大量 Obsidian 用户。

**v1.8 引入 `wiki-mode` 来填补这一空白。** 知识库通过在 `.vault-meta/mode.json` 中声明一种模式（LYT、PARA、卡片盒笔记法或通用模式）；当需要决定新页面存入何处时，其他技能会在做决定前查阅它。`generic` 模式是默认值，完全保持 v1.6/v1.7 的行为。

**根据 2026 年 5 月指南文档**：这是已识别的 5 个优先差距中等级 5 的。Ideaverse Pro 2.0（200 美元付费知识库）部署 LYT 作为偏好化结构；没有竞争对手的 Claude+Obsidian 产品将 PARA / 卡片盒笔记法 / 模式感知路由作为一级技能。v1.8 使我们在审计 §9 方法论支持轴上从平局变为领先（7 个轴中的 5 个为第 1）。

