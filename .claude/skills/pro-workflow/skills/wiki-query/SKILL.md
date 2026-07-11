---
name: wiki-query
description: "Pro Workflow\Skills\Wiki Query — Pro Workflow\Skills\Wiki Query 相关功能和最佳实践"
---

# Wiki 查询

通过 `wiki-builder` 索引的 Wiki 页面上的 FTS5 BM25 检索。

## 何时使用

- 在编写任何新的 Wiki 页面之前 → 先检查覆盖范围
- User asks a domain question that may already live in a wiki
- "Ask the <slug> wiki: <question>"
- Verifying citations before quoting a claim
- `SessionStart` auto-load when prompt matches a known wiki topic

## 命令

```
node $SKILL_ROOT/scripts/query.js search "<query>" [--wiki <slug>] [--limit 10] [--json]
node $SKILL_ROOT/scripts/query.js related <slug> <rel-path> [--limit 5]
node $SKILL_ROOT/scripts/query.js show <slug> <rel-path>
```

`search` with no `--wiki` ranks across all wikis. `related` finds adjacent pages by reusing the page's title + summary as the query.

## 输出

JSON-friendly. Each hit:

```
{
  "page_id": 12,
  "wiki_slug": "agent-memory",
  "rel_path": "wiki/concepts/episodic-memory.md",
  "title": "Episodic Memory",
  "snippet": "... [time-stamped] traces, distinct from semantic ...",
  "rank": -3.21
}
```

Lower (more negative) rank = better BM25 match.

## Citing back

Every wiki hit must be cited as:

```
[wiki:<slug>] <title> — `<rel_path>`
```

Do not paraphrase a hit without showing the source.

## SessionStart integration

When `pro-workflow`'s SessionStart hook detects wiki-relevant terms in the user prompt, it runs `query.js search "<prompt>" --limit 3` and injects top hits into the session as a hint:

```
[wiki-query] 3 relevant pages:
- agent-memory · wiki/concepts/episodic-memory.md
- agent-memory · wiki/papers/park-2023-generative-agents.md
- ...
```

Helps Claude recall existing knowledge instead of redoing research.

## Limits (Phase 3.3.0)

- BM25 only. Vector search arrives 3.3.2 with sqlite-vec.
- No re-ranking. MMR diversity arrives with the research loop in 3.3.1.
- Snippet window is 16 tokens around match — tune via `--snippet-len`.
