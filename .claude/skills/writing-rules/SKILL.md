---
name: writing-hookify-rules
description: 当用户要求"创建 hookify 规则"、"编写 hook 规则"、"配置 hookify"、"添加 hookify 规则"或需要 hookify 规则语法与模式指导时使用此技能。
version: 0.1.0
---

# Writing Hookify Rules

## Overview

Hookify rules are markdown files with YAML frontmatter that define patterns to watch for and messages to show when those patterns match. Rules are stored in `.claude/hookify.{rule-name}.local.md` files.

## Rule File Format

### Basic Structure

```markdown
---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 41 MINUTES 31 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE