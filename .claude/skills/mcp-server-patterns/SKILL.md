---
name: mcp-server-patterns
description: 使用 Node/TypeScript SDK 构建 MCP 服务器——工具、资源、提示、Zod 验证、stdio 与 Streamable HTTP。使用 Context7 或官方 MCP 文档获取最新 API。
---

# MCP 服务器模式

模型上下文协议（MCP）让 AI 助手可以从你的服务器调用工具、读取资源和使用提示。在构建或维护 MCP 服务器时使用此技能。SDK API 会不断演变；请查阅 Context7（查询-docs 搜索 "MCP"）或官方 MCP 文档获取最新的方法名和签名。

## 何时使用

适用于：实现新的 MCP 服务器、添加工具或资源、选择 stdio 还是 HTTP、升级 SDK、或调试 MCP 注册和传输问题。

## 工作原理

### 核心概念

- **工具（Tools）**：模型可以调用的操作（如搜索、运行命令）。根据 SDK 版本使用 `registerTool()` 或 `tool()` 注册。
- **资源（Resources）**：模型可以获取的只读数据（如文件内容、API 响应）。使用 `registerResource()` 或 `resource()` 注册。处理器通常接收一个 `uri` 参数。
- **提示（Prompts）**：可复用的、参数化的提示模板，客户端可以展示（例如在 Claude Desktop 中）。使用 `registerPrompt()` 或等效方法注册。
- **传输（Transport）**：stdio 用于本地客户端（如 Claude Desktop）；Streamable HTTP 优先用于远程（游标、云端）。传统的 HTTP/SSE 仅用于向后兼容。

Node/TypeScript SDK 可能暴露 `tool()` / `resource()` 或 `registerTool()` / `registerResource()`；官方 SDK 随版本变化。始终对照当前 [MCP 文档](https://modelcontextprotocol.io) 或 Context7 进行验证。

### 使用 stdio 连接

对于本地客户端，创建 stdio 传输并将其传递给服务器的 connect 方法。确切的 API 因 SDK 版本而异（例如构造函数 vs 工厂方法）。参见官方 MCP 文档或查询 Context7 的 "MCP stdio server" 获取当前模式。

保持服务器逻辑（工具 + 资源）与传输层独立，这样可以在入口点切换 stdio 或 HTTP。

### 远程（Streamable HTTP）

对于 游标、云端或其他远程客户端，使用 **Streamable HTTP**（根据当前规范，单个 MCP HTTP 端点）。仅在需要向后兼容时才支持传统的 HTTP/SSE。

## 示例

### 安装与服务器设置

```bash
npm install @modelcontextprotocol/sdk zod
```

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({ name: "my-server", version: "1.0.0" });
```

根据你的 SDK 版本提供的 API 注册工具和资源：某些版本使用 `server.tool(name, description, 架构, 处理器)`（位置参数），另一些使用 `server.tool({ name, description, inputSchema }, 处理器)` 或 `registerTool()`。资源同理——当 API 提供 `uri` 时，在处理器中包含它。查看官方 MCP 文档或 Context7 获取当前 `@modelcontextprotocol/sdk` 的签名，避免复制粘贴错误。

使用 **Zod**（或 SDK 偏好的 架构 格式）进行输入验证。

## 最佳实践

- **架构 优先**：为每个工具定义输入 架构；记录参数和返回类型。
- **错误处理**：返回模型可以解释的结构化错误或消息；避免原始堆栈跟踪。
- **幂等性**：尽可能使用幂等工具，以便重试是安全的。
- **速率与成本**：对于调用外部 API 的工具，考虑速率限制和成本；在工具描述中记录。
- **版本管理**：在 package.json 中锁定 SDK 版本；升级时查看发布说明。

## 官方 SDK 与文档

- **JavaScript/TypeScript**：`@modelcontextprotocol/sdk`（npm）。使用 Context7 以库名 "MCP" 查询当前的注册和传输模式。
- **Go**：GitHub 上的官方 Go SDK（`modelcontextprotocol/go-sdk`）。
- **C#**：.NET 的官方 C# SDK。
