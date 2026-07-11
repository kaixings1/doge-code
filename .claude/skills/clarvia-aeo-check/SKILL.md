---
name: 使用 Clarvia AEO（代理体验优化）为任何 MCP 服务器、API 或
description: "使用 Clarvia AEO（代理体验优化）为任何 MCP 服务器、API 或 CLI 评分代理就绪性。在将工具添加到工作流之前搜索 15,400+ 个已索引工具。"
category: tool-quality
risk: safe
source: community
date_added: "2026-03-27"
author: digitamaz
tags: [mcp, aeo, tool-quality, agent-readiness, api-scoring, clarvia]
tools: [claude, 游标, windsurf, cline]
---

# Clarvia AEO 检查

## 概述

在将任何 MCP 服务器、API 或 CLI 工具添加到您的代理工作流之前，使用 Clarvia 对其代理就绪性进行评分。Clarvia 评估 15,400+ AI 工具的四个 AEO 维度：API 可访问性、数据结构化、代理兼容性和信任信号。

## 前提条件

Add Clarvia MCP server to your config:

```json
{
  "mcpServers": {
    "clarvia": {
      "command": "npx",
      "args": ["-y", "clarvia-mcp-server"]
    }
  }
}
```

## 何时使用此技能

- Use when evaluating a new MCP server before adding it to your config
- Use when comparing two tools for the same job
- Use when building an agent that selects tools dynamically
- Use when you want to find the highest-quality tool in a category

## 工作原理

### 步骤 1: Score a specific tool

Ask Claude to score any tool by URL or name:

```
Score https://github.com/example/my-mcp-server for agent-readiness
```

Clarvia returns a 0-100 AEO score with breakdown across four dimensions.

### 步骤 2: Search tools by category

```
Find the top-rated database MCP servers using Clarvia
```

Returns ranked results from 15,400+ indexed tools.

### 步骤 3: Compare tools head-to-head

```
Compare supabase-mcp vs firebase-mcp using Clarvia
```

Returns side-by-side score breakdown with a recommendation.

### 步骤 4: Check leaderboard

```
Show me the top 10 MCP servers for 认证 using Clarvia
```

## 示例

### Example 1: Evaluate before installing

```
Before I add this MCP server to my config, score it:
https://github.com/example/new-tool

Use the clarvia aeo_score tool and tell me if it's agent-ready.
```

### Example 2: Find best tool in category

```
I need an MCP server for web scraping. Use Clarvia to find the 
top-rated options and compare the top 3.
```

### Example 3: CI/CD quality gate

Add to your CI pipeline using the GitHub Action:

```yaml
- uses: clarvia-project/clarvia-action@v1
  with:
    url: https://your-api.com
    fail-under: 70
```

## AEO Score Interpretation

| Score | Rating | Meaning |
|-------|--------|---------|
| 90-100 | Agent Native | Built specifically for agent use |
| 70-89 | Agent Friendly | Works well, minor gaps |
| 50-69 | Agent Compatible | Works but needs improvement |
| 30-49 | Agent Partial | Significant limitations |
| 0-29 | Not Agent Ready | Avoid for agentic workflows |

## 最佳实践

- ✅ Score tools before adding them to long-running agent workflows
- ✅ Use Clarvia's leaderboard to discover alternatives you haven't considered
- ✅ Re-check scores periodically — tools improve over time
- ❌ Don't skip scoring for "well-known" tools — even popular tools can score poorly
- ❌ Don't use tools scoring below 50 in production agent pipelines without understanding the limitations

## 常见陷阱

- **Problem:** Clarvia returns "not found" for a tool
  **Solution:** Try scanning by URL directly with `aeo_score` — Clarvia will score it on-demand

- **Problem:** Score seems low for a tool I trust
  **Solution:** Use `get_score_breakdown` to see which dimensions are weak and decide if they matter for your use case

## 相关技能

- `@mcp-builder` - Build a new MCP server that scores well on AEO
- `@agent-evaluation` - Broader agent quality evaluation framework

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
