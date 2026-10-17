---
name: scaffold-exercises
description: 创建带有章节、练习、解决方案和讲解材料的练习目录结构，并通过 lint 检查。当用户想要搭建练习脚手架、创建练习存根或设置新的课程章节时使用。
---

# 搭建练习脚手架（Scaffold Exercises）

创建能够通过 `pnpm ai-hero-cli internal lint` 检查的练习目录结构，然后使用 `git commit` 提交。

## 目录命名

- **章节（Sections）**：`exercises/` 下的 `XX-section-name/`（例如 `01-retrieval-skill-building`）
- **练习（Exercises）**：章节目录下的 `XX.YY-exercise-name/`（例如 `01.03-retrieval-with-bm25`）
- 章节编号 = `XX`，练习编号 = `XX.YY`
- 名称使用 dash-case（小写字母加连字符）

## 练习变体

每个练习至少需要以下子文件夹之一：

- `problem/` - 学生工作区，包含 TODO
- `solution/` - 参考实现
- `explainer/` - 概念性材料，无 TODO

在创建存根时，除非计划中另有指定，否则默认使用 `explainer/`。

## 必需文件

每个子文件夹（`problem/`、`solution/`、`explainer/`）都需要一个 `readme.md`，要求：

- **不能为空**（必须有真实内容，哪怕只有一行标题也可以）
- 不能包含失效链接

在创建存根时，创建一个包含标题和描述的最小 readme：

```md
# Exercise Title

Description here
```

如果子文件夹中包含代码，还需要一个 `main.ts`（超过 1 行）。但对于存根，仅包含 readme 的练习即可。

## 工作流程

1. **解析计划** - 提取章节名称、练习名称和变体类型
2. **创建目录** - 对每个路径使用 `mkdir -p`
3. **创建存根 readme** - 为每个变体文件夹创建一个带标题的 `readme.md`
4. **运行 lint** - 使用 `pnpm ai-hero-cli internal lint` 进行验证
5. **修复所有错误** - 迭代直到 lint 通过

## Lint 规则摘要

Linter（`pnpm ai-hero-cli internal lint`）会检查：

- 每个练习都有子文件夹（`problem/`、`solution/`、`explainer/`）
- 至少存在 `problem/`、`explainer/` 或 `explainer.1/` 之一
- 主子文件夹中存在 `readme.md` 且非空
- 没有 `.gitkeep` 文件
- 没有 `speaker-notes.md` 文件
- readme 中没有失效链接
- readme 中没有 `pnpm run exercise` 命令
- 每个子文件夹需要 `main.ts`，除非它是仅含 readme 的练习

## 移动/重命名练习

在重新编号或移动练习时：

1. 使用 `git mv`（而非 `mv`）重命名目录 - 以保留 git 历史
2. 更新数字前缀以保持顺序
3. 移动后重新运行 lint

示例：

```bash
git mv exercises/01-retrieval/01.03-embeddings exercises/01-retrieval/01.04-embeddings
```

## 示例：从计划创建存根

假设有如下计划：

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

然后创建 readme 存根：

```
exercises/05-memory-skill-building/05.01-introduction-to-memory/explainer/readme.md -> "# Introduction to Memory"
exercises/05-memory-skill-building/05.02-short-term-memory/explainer/readme.md -> "# Short-term Memory"
exercises/05-memory-skill-building/05.02-short-term-memory/problem/readme.md -> "# Short-term Memory"
exercises/05-memory-skill-building/05.02-short-term-memory/solution/readme.md -> "# Short-term Memory"
exercises/05-memory-skill-building/05.03-long-term-memory/explainer/readme.md -> "# Long-term Memory"
```