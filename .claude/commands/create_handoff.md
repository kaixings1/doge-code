---
description: 创建交接文档以将工作转移到另一个会话
---

# 创建交接文档

你的任务是编写一份交接文档，将你的工作交接给新会话中的另一个智能体。创建的交接文档需要全面，但也要**简洁**。目标是在不丢失关键工作细节的情况下压缩和总结你的上下文。

## 流程
### 1. 文件路径和元数据
使用以下信息了解如何创建文档：
    - 在 `thoughts/shared/handoffs/ENG-XXXX/YYYY-MM-DD_HH-MM-SS_ENG-ZZZZ_description.md` 下创建文件，其中：
        - YYYY-MM-DD 是今天的日期
        - HH-MM-SS 是基于当前时间的时、分、秒，采用 24 小时制
        - ENG-XXXX 是工单编号（如果没有工单，替换为 `general`）
        - ENG-ZZZZ 是工单编号（如果没有工单，省略）
        - description 是简短的中划线连接式描述
    - 运行 `scripts/spec_metadata.sh` 脚本生成所有相关元数据
    - 示例：
        - 有工单：`2025-01-08_13-55-22_ENG-2166_create-context-compaction.md`
        - 无工单：`2025-01-08_13-55-22_create-context-compaction.md`

### 2. 编写交接文档
按照上述约定编写文档。使用定义的文件路径和以下 YAML frontmatter 模式。使用步骤 1 中收集的元数据，使用 YAML frontmatter 后跟内容的结构：

Use the following template structure:
```markdown
---
date: [Current date and time with timezone in ISO format]
researcher: [Researcher name from thoughts status]
git_commit: [Current commit hash]
branch: [Current branch name]
repository: [Repository name]
topic: "[Feature/Task Name] Implementation Strategy"
tags: [implementation, strategy, relevant-component-names]
status: complete
last_updated: [Current date in YYYY-MM-DD format]
last_updated_by: [Researcher name]
type: implementation_strategy
---

# Handoff: ENG-XXXX {very concise description}

## Task(s)
{description of the task(s) that you were working on, along with the status of each (completed, work in progress, planned/discussed). If you are working on an implementation plan, make sure to call out which phase you are on. Make sure to reference the plan document and/or research document(s) you are working from that were provided to you at the beginning of the session, if applicable.}

## Critical References
{List any critical specification documents, architectural decisions, or design docs that must be followed. Include only 2-3 most important file paths. Leave blank if none.}

## Recent changes
{describe recent changes made to the codebase that you made in line:file syntax}

## Learnings
{describe important things that you learned - e.g. patterns, root causes of bugs, or other important pieces of information someone that is picking up your work after you should know. consider listing explicit file paths.}

## Artifacts
{ an exhaustive list of artifacts you produced or updated as filepaths and/or file:line references - e.g. paths to feature documents, implementation plans, etc that should be read in order to resume your work.}

## Action Items & Next Steps
{ a list of action items and next steps for the next agent to accomplish based on your tasks and their statuses}

## Other Notes
{ other notes, references, or useful information - e.g. where relevant sections of the codebase are, where relevant documents are, or other important things you leanrned that you want to pass on but that don't fall into the above categories}
```
---

### 3. 确认并同步
运行 `humanlayer thoughts sync` 保存文档。

完成后，应在 `<template_response></template_response>` XML 标签之间向用户回复模板。不要在回复中包含标签本身。

<template_response>
交接文档已创建并同步！你可以使用以下命令在新会话中从此交接处恢复：

```bash
/resume_handoff path/to/handoff.md
```
</template_response>

例如（在 `<example_response></example_response>` XML 标签之间——不要在给用户的实际回复中包含这些标签）：

<example_response>
交接文档已创建并同步！你可以使用以下命令在新会话中从此交接处恢复：

```bash
/resume_handoff thoughts/shared/handoffs/ENG-2166/2025-01-08_13-44-55_ENG-2166_create-context-compaction.md
```
</example_response>

---
## 附加说明和指引
- **信息多比少好**。这是定义交接文档最低要求的指南。如果需要，随时可以包含更多信息。
- **要全面和精确**。包括顶层目标和必要的底层细节。
- **避免过多的代码片段**。虽然简短的代码片段来描述关键变更很重要，但要避免大量的代码块或 diff；除非必要（例如涉及正在调试的错误），否则不要包含。优先使用 `/path/to/file.ext:line` 引用，智能体稍后可以在准备就绪时跟进，例如 `packages/dashboard/src/app/dashboard/page.tsx:12-24`
