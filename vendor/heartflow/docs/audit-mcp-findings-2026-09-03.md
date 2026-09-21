# HeartFlow Audit — MCP Server Risk Patterns
Date: 2026-09-03

## Scope
Static audit of `modelcontextprotocol/servers` (official MCP server catalog).
Files: 156 / Lines: 28,556

## Top findings

| Category | Count | Severity | Comment |
|----------|-------|----------|---------|
| Path traversal | 2 | High | User-supplied paths without normalization |
| Prompt-injection strings | 1 | Medium | Tool descriptions / sample inputs |
| Shell / code execution | 0 | - | None detected |
| Secret-like strings | 0 | - | None detected |

## Why this matters
1. MCP servers expose tools directly to model context.
2. Tool descriptions are instructions; a poisoned description is an indirect prompt injection vector.
3. Write / execute / destructive tools without warning language give agents irreversible surfaces.

## How to reproduce
```bash
git clone --depth 1 https://github.com/modelcontextprotocol/servers.git
node scripts/repo-audit.js servers modelcontextprotocol/servers audit.md
```

## Remediation priority
1. Audit all write/execute/destructive tool descriptions for imperative language
2. Add reversible-operation warnings to tool docs
3. Validate all path parameters before filesystem access
