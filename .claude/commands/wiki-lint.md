---
name: Wiki检查
description: 对 LLM Wiki 仓库运行健康检查——机械检查（孤立页面、失效链接、过期页面、缺少 frontmatter、日志空缺、重复）以及语义检查（矛盾、交叉引用缺失、缺少独立页面的概念）。输出带建议措施的 Markdown 报告。用法: /wiki-lint [--stale-days N] [--log-gap-days N]
---
<!-- canonical copy: engineering/llm-wiki/commands/wiki-lint.md — keep in sync (root copy uses repo-root-relative script paths) -->

# /wiki-lint

Health-check the wiki. Surfaces orphan pages, broken wikilinks, stale claims, missing frontmatter, contradictions, and structural drift. **Reports, doesn't silently fix** — you decide what to change.

Run this weekly, after batch ingests, and always before sharing the wiki.

## Usage

```
/wiki-lint
/wiki-lint --stale-days 60
/wiki-lint --log-gap-days 7
```

## What happens

### Pass 1 — Mechanical (scripts)

- `engineering/llm-wiki/skills/llm-wiki/scripts/lint_wiki.py` — orphans, broken links, stale pages, missing frontmatter, duplicate titles, log gap
- `engineering/llm-wiki/skills/llm-wiki/scripts/graph_analyzer.py` — hubs, sinks, connected components, graph stats

### Pass 2 — Semantic (LLM reads and thinks)

- Contradictions between recently-updated pages
- Stale claims superseded by newer sources
- Concepts mentioned in plain text across 3+ pages without their own page
- Cross-reference gaps (entities mentioned but not wikilinked)
- Index drift (index.md out of sync with wiki/)

### Pass 3 — Report

A markdown report grouped by severity:

```markdown
# Wiki lint — <date>

**Total pages:** N  **Components:** N  **Last log:** <date>

## Found
- ⚠️ <N> contradictions (list)
- <N> orphans
- <N> broken links
- <N> stale pages
- ...

## Suggested actions
1. Investigate contradiction between [[sources/a]] and [[sources/b]]
2. Create concept page for "<name>"
3. Fix broken link in [[concepts/x]]
4. Re-ingest [[sources/c]] — stale + contradicted
5. ...
```

Then appends a `lint` entry to `log.md`.

## Sub-agent

Dispatches the `wiki-linter` sub-agent. See `agents/wiki-linter.md`.

## Scripts

- `engineering/llm-wiki/skills/llm-wiki/scripts/lint_wiki.py`
- `engineering/llm-wiki/skills/llm-wiki/scripts/graph_analyzer.py`
- `engineering/llm-wiki/skills/llm-wiki/scripts/append_log.py`

## Frequency

| Trigger | Pass |
|---|---|
| Weekly | Mechanical only — fast |
| After batch ingest | Full (mechanical + semantic) |
| Monthly | Full + structural review |
| Before sharing | Full + extra review |

## Skill Reference

→ `engineering/llm-wiki/skills/llm-wiki/SKILL.md`
→ `engineering/llm-wiki/skills/llm-wiki/references/lint-workflow.md`
