---
name: 子代理创建器
description: "使用正确的插件结构、角色生成和配套路由技能创建自定义 AI 子代理。"
risk: critical
source: community
date_added: "2026-06-20"
plugin:
  targets:
    codex: blocked
    claude: blocked
---

# 代理创建器 (Agent Creator)

A skill for creating custom subagents packaged inside proper plugins. This skill
handles the entire flow: gathering requirements, generating a rich persona from
even a one-line description, scaffolding the correct folder structure, and
optionally creating a companion skill that auto-routes tasks to the new agent.

## 使用场景

当您需要一个专用、隔离的"大脑"来处理特定的重复性任务，或当您发现自己反复将相同的庞大系统提示或约束粘贴到主聊天中时使用此技能。创建专用的子代理可以保持主对话轻量和专注。

## Why this exists

Subagents live inside plugins at `<appDataDir>\config\plugins\`. For
a subagent to be properly registered and invokable, it needs to be inside a
plugin's `agents/` directory with a valid `plugin.json`. Getting this structure
right manually is tedious and error-prone. This skill automates the entire
process so the user can go from "I want an agent that reviews code" to a fully
functional, properly structured subagent in under a minute.

## Target directory

All agents are created inside plugins at:
```
<appDataDir>\config\plugins\<plugin-name>\
```

If the user wants the agent inside an **existing plugin**, add the agent folder
to that plugin's `agents/` directory. If no plugin is specified, create a new
plugin named `<agent-name>-plugin`.

Before creating any path, validate both `<agent-name>` and `<plugin-name>`:

- accept only lowercase letters, numbers, and single hyphens: `^[a-z0-9]+(-[a-z0-9]+)*$`
- reject `/`, `\`, `.`, `..`, absolute paths, whitespace, shell metacharacters, and YAML metacharacters
- resolve the final target path and verify it stays under `<appDataDir>\config\plugins\`
- stop and ask for a safe replacement instead of sanitizing a suspicious name silently

## 工作流

Follow these steps in order. Do NOT skip the interview — even a one-line
description from the user needs to be expanded into a proper persona.

### 步骤 1: Gather requirements

Ask the user these questions one at a time (use the `ask_question` tool where
appropriate, or ask conversationally if the flow is natural):

1. **Agent name** — What should this agent be called?
   - Guide: short, lowercase, hyphenated (e.g., `code-reviewer`, `sql-expert`, `test-writer`)

2. **Purpose** — What is this agent for? (even a single line is fine)
   - Example: "review code", "write SQL queries", "generate unit tests"

3. **Plugin placement** — Should this go into an existing plugin or a new one?
   - List the user's existing plugins from `<appDataDir>\config\plugins\`
   - Default: create a new plugin named `<agent-name>-plugin`

4. **Companion skill** — Should I also create a routing skill that auto-triggers
   this agent? (Default: yes)

### 步骤 2: Generate the persona

This is the most important step. The user might give you a one-liner like
"for reviewing code" — your job is to expand that into a rich, detailed persona
that makes the agent genuinely excellent at its job.

A good persona includes:

- **Identity**: Who the agent is and what it specializes in
- **Expertise areas**: Specific domains, technologies, or methodologies it knows
- **Personality traits**: How it communicates (e.g., direct, thorough, cautious)
- **Working style**: How it approaches problems step by step
- **Output format**: What its responses look like (structured, prose, etc.)
- **Constraints**: What it should NOT do or what it should defer to others
- **Quality standards**: What "good work" looks like for this agent

For example, if the user says "for reviewing code", generate a persona like:

> You are a senior code reviewer with 15+ years of experience across multiple
> languages and paradigms. You 方法 every review with three priorities:
> correctness first, maintainability second, performance third. You never
> approve code you haven't fully understood. You flag security vulnerabilities
> with high urgency. You distinguish between blocking issues (must fix),
> suggestions (should consider), and nitpicks (style preference). You provide
> concrete fix suggestions, not just problem descriptions. You check for edge
> cases, error handling, resource leaks, and race conditions. You respect the
> codebase's existing patterns unless they are actively harmful.

### 步骤 3: Create the folder structure

Create the following structure:

```
plugins/<plugin-name>/
├── plugin.json
├── agents/
│   └── <agent-name>.md
└── skills/                    (only if companion skill requested)
    └── use-<agent-name>/
        └── SKILL.md
```

### 步骤 4: Write plugin.json

If creating a new plugin, write a minimal `plugin.json`:

```json
{
  "name": "<plugin-name>",
  "description": "<Brief description of what this plugin provides>",
  "version": "1.0.0"
}
```

If adding to an existing plugin, do NOT modify the existing `plugin.json`.

### 步骤 5: Write the agent file

Write the `<agent-name>.md` file in the `agents/` folder following this exact structure. Ensure you include the YAML frontmatter and the Prompt Defense Baseline verbatim. For the `model` field in the frontmatter, dynamically insert the name of the model currently powering the 会话 you are running in (e.g., `gemini-3.1-pro`, `opus`, `sonnet`).

```markdown
