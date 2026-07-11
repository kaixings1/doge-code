---
name: 使用 Global Chat 的跨协议目录和 MCP 服务器在 6+ 注册表中发
description: "使用 Global Chat 的跨协议目录和 MCP 服务器在 6+ 注册表中发现和搜索 18K+ MCP 服务器和 AI 代理。"
category: development
risk: safe
source: community
source_repo: pumanitro/global-chat
source_type: community
date_added: "2026-04-06"
author: pumanitro
tags: [mcp, ai-agents, agent-discovery, agents-txt, a2a, developer-tools]
tools: [claude, 游标, gemini, codex]
---

# Global Chat 代理发现

## 概述

Global Chat is a cross-protocol AI agent discovery platform that aggregates MCP servers and AI agents from 6+ registries into a single searchable directory. 此技能帮助 you find the right MCP server, A2A agent, or agents.txt 端点 for any task by searching across 18,000+ indexed entries. It also provides an MCP server (`@global-chat/mcp-server`) for programmatic access to the directory from any MCP-compatible client.

## 使用场景 This Skill

- Use when you need to find an MCP server for a specific capability (e.g., database access, file conversion, API 集成)
- Use when evaluating which agent registries carry tools for your use case
- Use when you want to search across multiple protocols (MCP, A2A, agents.txt) simultaneously
- Use when setting up agent-to-agent communication and need to discover available endpoints

## 工作原理

### Option 1: Use the MCP Server (Recommended for Agents)

Install the Global Chat MCP server to search the directory programmatically from Claude Code, 游标, or any MCP client.

```bash
npm install -g @global-chat/mcp-server
```

Add to your MCP client 配置:

```json
{
  "mcpServers": {
    "global-chat": {
      "command": "npx",
      "args": ["-y", "@global-chat/mcp-server"]
    }
  }
}
```

Then ask your agent to search for tools:

```
Search Global Chat for MCP servers that handle PostgreSQL database queries.
```

### Option 2: Use the Web Directory

Browse the full directory at [https://global-chat.io](https://global-chat.io):

1. Visit the search page and enter your 查询
2. 过滤器 by protocol (MCP, A2A, agents.txt)
3. 过滤器 by registry source
4. View server details, 能力, and installation instructions

### Option 3: Validate Your agents.txt

If you maintain an `agents.txt` file, use the free validator:

1. Go to [https://global-chat.io/validate](https://global-chat.io/validate)
2. Enter your domain or paste your agents.txt content
3. Get instant feedback on format compliance and discoverability

## 示例

### Example 1: Find MCP Servers for a Task

```
You: "Find MCP servers that can convert PDF files to text"
Agent (via Global Chat MCP): Searching across 6 registries...
  - @anthropic/pdf-tools (mcpservers.org) — PDF parsing and text extraction
  - pdf-converter-mcp (mcp.so) — Convert PDF to text, markdown, or HTML
  - ...
```

### Example 2: Discover A2A Agents

```
You: "What A2A agents are available for code review?"
Agent (via Global Chat MCP): Found 12 A2A agents for code review across 3 registries...
```

### Example 3: Check Agent Protocol Coverage

```
You: "How many registries list tools for Kubernetes management?"
Agent (via Global Chat MCP): 4 registries carry Kubernetes-related agents (23 total entries)...
```

## 最佳实践

- Use the MCP server for automated workflows and agent-to-agent discovery
- Use the web directory for manual exploration and comparison
- Validate your agents.txt before publishing to ensure maximum discoverability
- Check multiple registries — coverage varies significantly by domain

## 常见陷阱

- **Problem:** Search returns too many results
  **Solution:** Add protocol or registry filters to narrow the scope

- **Problem:** MCP server not connecting
  **Solution:** Ensure `npx` is available and run `npx -y @global-chat/mcp-server` manually first to verify

## 相关 Skills

- `@mcp-client` - For general MCP client 设置 and 配置
- `@agent-orchestration-multi-agent-optimize` - For orchestrating multiple discovered agents
- `@agent-memory-mcp` - For persisting discovered agent information across sessions

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
