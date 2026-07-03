---
name: skill
description: "Skill — Skill 相关功能和最佳实践"
argument-hint: "<command> [args]"
level: 2
---

# Skill Management CLI

Meta-skill for managing oh-my-claudecode skills via CLI-like commands.

## Subcommands

### /skill list

Show all available skills organized by scope.

**Behavior:**
1. Scan bundled built-in skills in the plugin `skills/` directory (read-only)
2. Scan user skills at `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/omc-learned/`
3. Scan project skills at `.omc/skills/`
4. Parse YAML frontmatter for metadata
5. Display in organized table format:

```
BUILT-IN SKILLS (bundled with oh-my-claudecode):
| Name              | Description                    | Scope    |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 00 MINUTES 51 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE