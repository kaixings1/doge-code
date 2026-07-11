---
type: prompt
name: gsd:milestone-summary
从里程碑产物生成综合项目摘要，用于团队入职和审查。
argument-hint: "[version]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
---

<objective>
为团队入职和项目审查生成结构化的里程碑摘要。读取已完成的里程碑工件（ROADMAP、REQUIREMENTS、CONTEXT、SUMMARY、VERIFICATION 文件），生成关于构建内容、方式和原因的人性化概述。

目的：使新团队成员能够通过阅读一个文档并提出后续问题来理解已完成的项目。
输出：MILESTONE_SUMMARY 写入 `.planning/reports/`，内联展示，可选的交互式问答。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/milestone-summary.md
</execution_context>

<context>
**Project files:**
- `.planning/ROADMAP.md`
- `.planning/PROJECT.md`
- `.planning/STATE.md`
- `.planning/RETROSPECTIVE.md`
- `.planning/milestones/v{version}-ROADMAP.md` (if archived)
- `.planning/milestones/v{version}-REQUIREMENTS.md` (if archived)
- `.planning/phases/*-*/` (SUMMARY.md, VERIFICATION.md, CONTEXT.md, RESEARCH.md)

**User input:**
- Version: $ARGUMENTS (optional — defaults to current/latest milestone)
</context>

<process>
Execute end-to-end.
</process>

<success_criteria>
- Milestone version resolved (from args, STATE.md, or archive scan)
- All available artifacts read (ROADMAP, REQUIREMENTS, CONTEXT, SUMMARY, VERIFICATION, RESEARCH, RETROSPECTIVE)
- Summary document written to `.planning/reports/MILESTONE_SUMMARY-v{version}.md`
- All 7 sections generated (Overview, Architecture, Phases, Decisions, Requirements, Tech Debt, Getting Started)
- Summary presented inline to user
- Interactive Q&A offered
- STATE.md updated
</success_criteria>
