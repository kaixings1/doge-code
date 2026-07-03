---
name: agents-md
description: 创建和维护 AGENTS.md：保持代理描述、工具配置、触发条件和简洁高密度文档。
risk: unknown
source: community
---

# Maintaining AGENTS.md

AGENTS.md is the canonical agent-facing documentation. Keep it minimal—agents are capable and don't need hand-holding. Target under 60 lines; never exceed 100. Instruction-following quality degrades as document length increases.

## When to Use
- The user asks to create, update, or audit `AGENTS.md` or `CLAUDE.md`.
- The project needs concise, high-signal agent instructions derived from the actual toolchain and repo layout.
- Existing agent documentation is too long, duplicated, or drifting away from real project conventions.

## File Setup

1. Create `AGENTS.md` at project root
2. Create symlink: `ln -s AGENTS.md CLAUDE.md`

## Before Writing

Analyze the project to understand what belongs in the file:

1. **Package manager** — Check for lock files (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `uv.lock`, `poetry.lock`)
2. **Linter/formatter configs** — Look for `.eslintrc`, `biome.json`, `ruff.toml`, `.prettierrc`, etc. (don't duplicate these in AGENTS.md)
3. **CI/build commands** — Check `Makefile`, `package.json` scripts, CI configs for canonical commands
4. **Monorepo indicators** — Check for `pnpm-workspace.yaml`, `nx.json`, Cargo workspace, or subdirectory `package.json` files
5. **Existing conventions** — Check for existing CONTRIBUTING.md, docs/, or README patterns

## Writing Rules

- **Headers + bullets** — No paragraphs
- **Code blocks** — For commands and templates
- **Reference, don't embed** — Point to existing docs: "See `CONTRIBUTING.md` for setup" or "Follow patterns in `src/api/routes/`"
- **No filler** — No intros, conclusions, or pleasantries
- **Trust capabilities** — Omit obvious context
- **Prefer file-scoped commands** — Per-file test/lint/typecheck commands over project-wide builds
- **Don't duplicate linters** — Code style lives in linter configs, not AGENTS.md

## Required Sections

### Package Manager
Which tool and key commands only:
```markdown
## Package Manager
Use **pnpm**: `pnpm install`, `pnpm dev`, `pnpm test`
```

### File-Scoped Commands
Per-file commands are faster and cheaper than full project builds. Always include when available:
```markdown
## File-Scoped Commands
| Task | Command |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 11 MINUTES 41 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE