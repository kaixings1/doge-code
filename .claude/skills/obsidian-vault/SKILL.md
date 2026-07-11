---
name: Obsidian 知识库相关功能和最佳实践
description: "Obsidian Vault — Obsidian 知识库相关功能和最佳实践"
---

# Obsidian 知识库

## 知识库位置

`/mnt/d/Obsidian Vault/AI Research/`

主要在根层级平铺。

## 命名约定

- **索引笔记**：聚合相关主题（例如 `Ralph Wiggum Index.md`、`Skills Index.md`、`RAG Index.md`）
- 所有笔记名称使用**首字母大写**
- 不使用文件夹组织——改用链接和索引笔记

## 链接

- 使用 Obsidian `[[wikilinks]]` 语法：`[[笔记标题]]`
- 笔记在底部链接到依赖/相关笔记
- 索引笔记只是 `[[wikilinks]]` 列表

## 工作流

### 搜索笔记

```bash
# 按文件名搜索
find "/mnt/d/Obsidian Vault/AI Research/" -name "*.md" | grep -i "关键词"

# 按内容搜索
grep -rl "关键词" "/mnt/d/Obsidian Vault/AI Research/" --include="*.md"
```

或直接在 vault 路径上使用 Grep/Glob 工具。

### 创建新笔记

1. 文件名使用**首字母大写**
2. 将内容作为一个学习单元编写（按照 vault 规则）
3. 在底部添加 `[[wikilinks]]` 到相关笔记
4. 如果是编号序列的一部分，使用层级编号方案

### 查找相关笔记

在整个 vault 中搜索 `[[笔记标题]]` 以查找反向链接：

```bash
grep -rl "\\[\\[笔记标题\\]\\]" "/mnt/d/Obsidian Vault/AI Research/"
```

### 查找索引笔记

```bash
find "/mnt/d/Obsidian Vault/AI Research/" -name "*Index*"
```
