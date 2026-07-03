---
name: plugin-settings
description: 插件设置管理：.local.md 配置文件、YAML frontmatter 解析、按项目插件配置和插件状态持久化。
version: 0.1.0
---

# Plugin Settings Pattern for Claude Code Plugins

## Overview

Plugins can store user-configurable settings and state in `.claude/plugin-name.local.md` files within the project directory. This pattern uses YAML frontmatter for structured configuration and markdown content for prompts or additional context.

**Key characteristics:**
- File location: `.claude/plugin-name.local.md` in project root
- Structure: YAML frontmatter + markdown body
- Purpose: Per-project plugin configuration and state
- Usage: Read from hooks, commands, and agents
- Lifecycle: User-managed (not in git, should be in `.gitignore`)

## File Structure

### Basic Template

```markdown
---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 30 MINUTES 28 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE