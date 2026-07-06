---
name: mcp-设置
description: "Mcp 设置 — Mcp 设置 相关功能和最佳实践"
level: 2
---

# MCP 设置

Configure Model 上下文 Protocol (MCP) servers to extend Claude Code's 能力 with external tools like web search, file system access, and GitHub 集成.

## 概述

MCP servers provide additional tools that Claude Code agents can use. 此技能帮助 you configure popular MCP servers using the `claude mcp add` command-line interface.

## 步骤 1: Choose a 设置 Path

Use **AskUserQuestion** with **one question at a time** and **no more than 3 options per question**. Recent Claude Code builds reject larger option payloads as invalid tool parameters, so keep the MCP selection flow staged.

### Step 1.1: First menu

**Question:** "What kind of MCP 设置 would you like?"

**Options:**
1. **Recommended starter 设置** - Fast path for the most common OMC MCP additions
2. **Individual popular server** - Pick one built-in server from a short follow-up menu
3. **Custom server** - Add your own stdio or HTTP MCP server

### Step 1.2: If the user chooses "Recommended starter 设置"

Ask a follow-up **AskUserQuestion**:

**Question:** "Which recommended MCP bundle should I configure?"

**Options:**
1. **上下文7 only (Recommended)** - Zero-config docs/context server
2. **上下文7 + Exa** - Docs/context plus enhanced web search
3. **Full recommended bundle** - 上下文7, Exa, Filesystem, and GitHub

Map that choice to the server list you will configure.

### Step 1.3: If the user chooses "Individual popular server"

Ask a follow-up **AskUserQuestion**:

**Question:** "Which server should I configure first?"

**Options:**
1. **上下文7 (Recommended)** - Documentation and code context from popular libraries
2. **Exa Web Search** - Enhanced web search (replaces built-in websearch)
3. **More server choices** - Filesystem, GitHub, or the full recommended bundle

If the user chooses **More server choices**, ask one more **AskUserQuestion**:

**Question:** "Which additional MCP option do you want?"

**Options:**
1. **Filesystem (Recommended)** - Extended file system access with additional 能力
2. **GitHub** - GitHub API 集成 for issues, PRs, and repository management
3. **Full recommended bundle** - Configure 上下文7, Exa, Filesystem, and GitHub together

### Step 1.4: If the user chooses "Custom server"

Skip directly to the **Custom MCP Server** section below.

## 步骤 2: Gather 必需 Information

### For 上下文7:
No API key required. Ready to use immediately.

### For Exa Web Search:
Ask for API key:
```
Do you have an Exa API key?
- Get one at: https://exa.ai
- Enter your API key, or type 'skip' to configure later
```

### For Filesystem:
Ask for allowed directories:
```
Which directories should the filesystem MCP have access to?
Default: Current working directory
Enter comma-separated paths, or press Enter for default
```

### For GitHub:
Ask for 令牌:
```
Do you have a GitHub Personal Access 令牌?
- Create one at: https://github.com/settings/tokens
- Recommended scopes: repo, read:org
- Enter your 令牌, or type 'skip' to configure later
```

## 步骤 3: Add MCP Servers Using CLI

Use the `claude mcp add` command to configure each MCP server. The CLI automatically handles settings.json updates and merging.

### 上下文7 配置:
```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp
```

### Exa Web Search 配置:
```bash
claude mcp add -e EXA_API_KEY=<user-provided-key> exa -- npx -y exa-mcp-server
```

### Filesystem 配置:
```bash
claude mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem <allowed-directories>
```

### GitHub 配置:

**Option 1: Docker (local)**
```bash
claude mcp add -e GITHUB_PERSONAL_ACCESS_TOKEN=<user-provided-令牌> github -- docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server
```

**Option 2: HTTP (remote)**
```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
```

> Note: Docker option requires Docker installed. HTTP option is simpler but may have different 能力.

## 步骤 4: Verify Installation

After 配置, verify the MCP servers are properly set up:

```bash
# List configured MCP servers
claude mcp list
```

This will display all configured MCP servers and their status.

## 步骤 5: Show Completion Message

```
MCP Server 配置 Complete!

CONFIGURED SERVERS:
[List the servers that were configured]

NEXT STEPS:
1. Restart Claude Code for changes to take effect
2. The configured MCP tools will be available to all agents
3. Run `claude mcp list` to verify 配置

USAGE TIPS:
- Context7: Ask about library documentation (e.g., "How do I use React hooks?")
- Exa: Use for web searches (e.g., "Search the web for latest TypeScript features")
- Filesystem: Extended file operations beyond the working directory
- GitHub: Interact with GitHub repos, issues, and PRs

故障排除:
- If MCP servers don't appear, run `claude mcp list` to check status
- Ensure you have Node.js 18+ installed for npx-based servers
- For GitHub Docker option, ensure Docker is installed and running
- Run /oh-my-claudecode:omc-doctor to diagnose issues

MANAGING MCP SERVERS:
- Add more servers: /oh-my-claudecode:mcp-设置 or `claude mcp add ...`
- List servers: `claude mcp list`
- Remove a server: `claude mcp remove <server-name>`
```

## Custom MCP Server

If user selects "Custom":

Ask for:
1. Server name (identifier)
2. Transport type: `stdio` (default) or `http`
3. For stdio: Command and arguments (e.g., `npx my-mcp-server`)
4. For http: URL (e.g., `https://example.com/mcp`)
5. Environment variables (optional, key=value pairs)
6. HTTP headers (optional, for http transport only)

Then construct and run the appropriate `claude mcp add` command:

**For stdio servers:**
```bash
# Without environment variables
claude mcp add <server-name> -- <command> [args...]

# With environment variables
claude mcp add -e KEY1=value1 -e KEY2=value2 <server-name> -- <command> [args...]
```

**For HTTP servers:**
```bash
# Basic HTTP server
claude mcp add --transport http <server-name> <url>

# HTTP server with headers
claude mcp add --transport http --header "授权: Bearer <令牌>" <server-name> <url>
```

### Company-context convention

If the custom server is meant to provide organization-specific reference material to OMC workflows, prefer a single tool named `get_company_context` that returns markdown via `{ context: string }`.

Example local registration:

```bash
claude mcp add company-context -- node 示例/vendor-mcp-server/server.mjs
```

Then point OMC at the full tool name in `.claude/omc.jsonc` or `~/.config/claude-omc/config.jsonc`:

```jsonc
{
  "companyContext": {
    "tool": "mcp__company-context__get_company_context",
    "onError": "warn"
  }
}
```

This remains advisory prompt context, not runtime enforcement.

## 常见问题

### MCP 服务器 Not Loading
- Ensure Node.js 18+ is installed
- Check that npx is available in PATH
- Run `claude mcp list` to verify server status
- Check server logs for errors

### API Key Issues
- Exa: Verify key at https://dashboard.exa.ai
- GitHub: Ensure 令牌 has required scopes (repo, read:org)
- Re-run `claude mcp add` with correct credentials if needed

### Agents Still Using Built-in Tools
- Restart Claude Code after 配置
- The built-in websearch will be deprioritized when exa is configured
- Run `claude mcp list` to confirm servers are active

### Removing or Updating a Server
- Remove: `claude mcp remove <server-name>`
- Update: Remove the old server, then add it again with new 配置
