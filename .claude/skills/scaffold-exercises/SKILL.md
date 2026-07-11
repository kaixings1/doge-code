---
name: 创建练习目录结构相关功能和最佳实践
description: "Scaffold Exercises — 创建练习目录结构相关功能和最佳实践"
---

# 练习脚手架

创建能通过 `pnpm ai-hero-cli internal lint` 检查的练习目录结构，然后用 `git commit` 提交。

## 目录命名

- **章节**：`exercises/` 内的 `XX-section-name/`（例如 `01-retrieval-skill-building`）
- **练习**：章节内的 `XX.YY-exercise-name/`（例如 `01.03-retrieval-with-bm25`）
- 章节号 = `XX`，练习号 = `XX.YY`
- 名称使用中划线命名法（小写、连字符）

## 练习变体

每个练习至少需要以下子文件夹之一：

- `problem/` - 学生工作区，包含 TODO
- `solution/` - 参考实现
- `explainer/` - 概念材料，无 TODO

桩文件（stub）时，默认使用 `explainer/`，除非计划另有指定。

## 必需文件

每个子文件夹（`problem/`、`solution/`、`explainer/`）需要一个 `readme.md`：

- **非空**（必须有实际内容，即使只有标题行）
- 无失效链接

桩文件时，创建最简 readme，包含标题和描述：

```md
# 练习标题

描述在此处
```

如果子文件夹有代码，还需要 `main.ts`（>1 行）。但对于桩文件，仅 readme 的练习也可以。

## 工作流

1. **解析计划** - 提取章节名称、练习名称和变体类型
2. **创建目录** - 为每个路径执行 `mkdir -p`
3. **创建桩 readme** - 每个变体文件夹一个 `readme.md` 带标题
4. **运行 lint** - `pnpm ai-hero-cli internal lint` 验证
5. **修复错误** - 迭代直到 lint 通过

## Lint 规则摘要

检查器（`pnpm ai-hero-cli internal lint`）检查：

- 每个练习有子文件夹（`problem/`、`solution/`、`explainer/`）
- 至少存在 `problem/`、`explainer/` 或 `explainer.1/` 之一
- 主子文件夹中存在非空的 `readme.md`
- 无 `.gitkeep` 文件
- 无 `speaker-notes.md` 文件
- readme 中无失效链接
- readme 中无 `pnpm run exercise` 命令
- 除非仅 readme，否则每个子文件夹需要 `main.ts`

## 移动/重命名练习

重新编号或移动练习时：

1. 使用 `git mv`（而非 `mv`）重命名目录 - 保留 git 历史
2. 更新数字前缀以保持顺序
3. 移动后重新运行 lint

示例：

```bash
git mv exercises/01-retrieval/01.03-embeddings exercises/01-retrieval/01.04-embeddings
```

## 示例：从计划创建桩文件

给定计划：

```
Section 05: Memory Skill Building
- 05.01 Introduction to Memory
- 05.02 Short-term Memory (explainer + problem + solution)
- 05.03 Long-term Memory
```

创建：

```bash
mkdir -p exercises/05-memory-skill-building/05.01-introduction-to-memory/explainer
mkdir -p exercises/05-memory-skill-building/05.02-short-term-memory/{explainer,problem,solution}
mkdir -p exercises/05-memory-skill-building/05.03-long-term-memory/explainer
```

然后创建 readme 桩文件：

```
exercises/05-memory-skill-building/05.01-introduction-to-memory/explainer/readme.md -> "# 内存简介"
exercises/05-memory-skill-building/05.02-short-term-memory/explainer/readme.md -> "# 短期记忆"
exercises/05-memory-skill-building/05.02-short-term-memory/problem/readme.md -> "# 短期记忆"
exercises/05-memory-skill-building/05.02-short-term-memory/solution/readme.md -> "# 短期记忆"
exercises/05-memory-skill-building/05.03-long-term-memory/explainer/readme.md -> "# 长期记忆"
```
