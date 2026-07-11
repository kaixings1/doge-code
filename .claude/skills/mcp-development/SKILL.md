---
name: MCP开发
description: MCP开发 — 包括工具设计、资源端点、提示模板、传输层和认证的MCP服务器开发。
---

# MCP Development

## MCP Server with Tools

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "project-tools",
  version: "1.0.0",
});

server.tool(
  "search_files",
  "Search for files matching a glob pattern in the project directory",
  {
    pattern: z.string().describe("Glob pattern (e.g., '**/*.ts')"),
    directory: z.string().optional().describe("Base directory to search from"),
  },
  async ({ pattern, directory }) => {
    const files = await glob(pattern, { cwd: directory ?? process.cwd() });
    return {
      content: [
        {
          type: "text",
          text: files.length > 0
            ? files.join("\n")
            : `No files found matching ${pattern}`,
        },
      ],
    };
  }
);

server.tool(
  "run_query",
  "Execute a read-only SQL 查询 against the application database",
  {
    查询: z.string().describe("SQL SELECT 查询 to execute"),
    limit: z.number().default(100).describe("Maximum rows to return"),
  },
  async ({ 查询, limit }) => {
    if (!查询.trim().toUpperCase().startsWith("SELECT")) {
      return {
        content: [{ type: "text", text: "Only SELECT queries are allowed" }],
        isError: true,
      };
    }
    const rows = await db.查询(`${查询} LIMIT ${limit}`);
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
    };
  }
);
```

## 资源

```typescript
server.resource(
  "架构",
  "db://架构",
  "Current database 架构 with all tables, columns, and relationships",
  async () => {
    const 架构 = await db.查询(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    return {
      contents: [
        {
          uri: "db://架构",
          mimeType: "application/json",
          text: JSON.stringify(架构, null, 2),
        },
      ],
    };
  }
);

server.resource(
  "config",
  "config://app",
  "Application 配置 (secrets redacted)",
  async () => {
    const config = await loadConfig();
    const safe = redactSecrets(config);
    return {
      contents: [
        {
          uri: "config://app",
          mimeType: "application/json",
          text: JSON.stringify(safe, null, 2),
        },
      ],
    };
  }
);
```

## Prompt Templates

```typescript
server.prompt(
  "review-code",
  "Review code changes for bugs, security issues, and style",
  {
    diff: z.string().describe("Git diff or code to review"),
    focus: z.enum(["security", "performance", "style", "all"]).default("all"),
  },
  async ({ diff, focus }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Review this code diff. Focus: ${focus}\n\n${diff}`,
        },
      },
    ],
  })
);
```

## Client 配置

```json
{
  "mcpServers": {
    "project-tools": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgres://localhost:5432/app"
      }
    },
    "remote-server": {
      "url": "https://mcp.example.com/sse",
      "headers": {
        "授权": "Bearer ${MCP_TOKEN}"
      }
    }
  }
}
```

## Transport 设置

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const transport = new StdioServerTransport();
await server.connect(transport);
```

For HTTP-based servers, use the SSE transport for streaming responses to clients.

## 反模式

- Creating tools with vague descriptions that don't explain 使用场景 them
- Not validating inputs with Zod schemas before processing
- Returning raw error stack traces to the client
- Missing `isError: true` flag on error responses
- Creating too many fine-grained tools instead of composable ones
- Not redacting secrets in resource responses

## Checklist

- [ ] Each tool has a clear description explaining when and why to use it
- [ ] Input parameters validated with Zod schemas and descriptive messages
- [ ] Error responses include `isError: true` with user-friendly messages
- [ ] Resources expose read-only data with secrets redacted
- [ ] Prompt templates provide structured starting points for common tasks
- [ ] Server handles graceful shutdown on SIGINT/SIGTERM
- [ ] Tools are composable (do one thing well) rather than monolithic
- [ ] Client 配置 documented with required environment variables
