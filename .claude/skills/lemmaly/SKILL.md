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

# lemmaly — 算法优先原则

模型已经知道 Big-O、哈希表、分治、动态规划、排序、图算法和摊还分析，只是不会自发地应用它们。lemmaly 修复的是行为，而不是知识。

此技能是算法规范四件套的入口 (`lemmaly`, `mathguard`, `invariant-guard`, `complexity-cuts`). 它强制执行套件中其他守卫所依赖的硬性规则。

**违反这些规则的文字就是违反技能的精神。** "就这一次" 正是 O(n²) 流入生产的方式。

## 何时使用此技能

在以下情况使用 **lemmaly**：

- 编写、编辑或审查涉及循环、集合、查找、搜索、连接、递归、图、查询或对超过少数项进行任何计算的代码时
- 即将编写 `for` 嵌套 `for`、循环内的 `.find` / `.includes` / `.indexOf`、独立项上的 `for` / `map` / `forEach` 中的 `await`，或集合中每项一个查询时
- 审计代码库/PR 以发现已知反模式（循环中的 await-in-loop、`.filter` 内的 `.includes`、循环中的字符串拼接、`SELECT *`、N+1 等）时
- 审查 AI 生成的"看起来惯用"但可能隐藏 O(n²) 或 N+1 的代码时

如有疑问，**从 lemmaly 开始**——它是入口网关，会告诉您何时应升级到其三个兄弟技能。

| If you are about to… | Use | Why |
