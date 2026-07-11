---
name: mcp-audit
description: "Pro Workflow\Skills\Mcp Audit — Pro Workflow\Skills\Mcp Audit 相关功能和最佳实践"
---

# MCP Audit

Analyze MCP server overhead and recommend cleanup.

## Trigger

Use when:
- Sessions feel slow or expensive
- Adding a new MCP server
- Context fills up quickly
- Reviewing project configuration

## Key Insight

Each MCP server adds ALL its tool descriptions to every API request. A server with 20 tools adds ~2K-4K tokens per request, regardless of whether you use those tools.

## Audit Steps

### 步骤 1: List Active Servers

Check all MCP configurations:
```bash
cat .claude/settings.json 2>/dev/null | grep -A 50 "mcpServers"
cat ~/.claude/settings.json 2>/dev/null | grep -A 50 "mcpServers"
```

### 步骤 2: Count Tools Per Server

For each server, estimate token overhead:
- 1-5 tools: ~200-500 tokens (low overhead)
- 6-15 tools: ~500-1500 tokens (moderate)
- 16-30 tools: ~1500-3000 tokens (high)
- 30+ tools: ~3000+ tokens (excessive — consider tool filtering)

### 步骤 3: Check Usage

Questions to ask:
- Which servers were actually used this session?
- Which servers haven't been used in 7+ days?
- Are there servers with overlapping functionality?
- Are there servers only needed for specific tasks?

### 步骤 4: Recommend Actions

**Disable** servers that:
- Haven't been used in 7+ days
- Overlap with another active server
- Are project-specific but you're in a different project

**Keep** servers that:
- Are used every session (filesystem, git)
- Provide unique capabilities needed for current work
- Have low tool count (<5 tools)

## 输出

```text
MCP AUDIT
  Active servers: [N]
  Total tools: [N]
  Estimated overhead: ~[N]K tokens per request

  Server Analysis:
    [name] — [N] tools, ~[N] tokens
      Status: KEEP / DISABLE / REVIEW
      Reason: [why]

  Recommendations:
    Disable: [list]
    Keep: [list]
    Review: [list]

  Projected savings: ~[N]K tokens per request (~$X.XX per session)
```

## Thresholds

- Total servers: <10 (ideal), 10-15 (monitor), >15 (reduce)
- Total tools: <80 (ideal), 80-120 (monitor), >120 (reduce)
- Per-server: <15 tools (ok), 15-30 (filter), >30 (split or disable)

## 规则

- Never disable servers without user confirmation
- Estimate token savings for each recommendation
- Consider task context — a server might be unused today but critical tomorrow
- Check for `disabledMcpjsonServers` to avoid re-recommending already-disabled servers
