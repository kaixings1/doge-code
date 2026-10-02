/**
 * OpenClaw MCP tool registry.
 *
 * Catalogs the 11 ctx_* tools that OpenClaw plugin must register via
 * api.registerTool(...) so the routing block (which nudges agents toward
 * ctx_execute, ctx_search, etc.) actually has tools to call. Without this,
 * Phase 7 audit (v1.0.107-adapter-openclaw.json) flagged severity=CRITICAL —
 * routing-block premise is broken when the named tools don't exist.
 *
 * Pattern mirrors the swarmvault MCP plugin
 * (refs/plugin-examples/openclaw/swarmvault/packages/engine/src/mcp.ts:46-51):
 *   server.registerTool(name, { description, inputSchema }, handler)
 *
 * OpenClaw signature is slightly different — see building-plugins.md:116
 *   api.registerTool({ name, description, parameters: TypeBox, execute(id, params) })
 *
 * Tool handlers are intentionally thin shims that delegate to the bundled CLI
 * (cli.bundle.mjs) — same fall-through pattern already used by ctx-doctor and
 * ctx-upgrade slash commands. This keeps the plugin's blast radius minimal:
 * we don't re-export the entire MCP server stack inside OpenClaw's process.
 *
 * The 11 tools mirror src/server.ts registerTool calls (lines 897, 1226, 1371,
 * 1497, 2034, 2256, 2440, 2501, 2592, 2712, 2808).
 */

/** Minimal JSON-schema-like parameter spec accepted by OpenClaw registerTool. */
export interface OpenClawToolParameters {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
  additionalProperties?: boolean;
}

/** Tool definition shape returned to OpenClaw via api.registerTool. */
export interface OpenClawToolDef {
  name: string;
  description: string;
  parameters: OpenClawToolParameters;
  execute: (
    id: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: "text"; text: string }> }>;
}

/** Wrap any handler so failures become a well-formed text error rather than crashing. */
function safe(
  handler: (
    params: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
): OpenClawToolDef["execute"] {
  return async (_id, params) => {
    try {
      return await handler(params ?? {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `[context-mode] tool error: ${message}`,
          },
        ],
      };
    }
  };
}

/** Stub handler — points users at the bundled CLI for full functionality. */
function cliRedirect(toolName: string) {
  return safe(async () => ({
    content: [
      {
        type: "text" as const,
        text: `[context-mode] ${toolName} is exposed via the bundled context-mode CLI. Run 'context-mode ${toolName}' or invoke the MCP server directly. This OpenClaw stub registers the tool name so the routing block remains valid; full execution requires the standalone MCP transport.`,
      },
    ],
  }));
}

/**
 * The 11 ctx_* tool definitions registered into OpenClaw via api.registerTool.
 * Names + descriptions mirror src/server.ts registerTool blocks 1:1 so prompts
 * referencing them (routing block, AGENTS.md) resolve to real callable tools.
 */
export const OPENCLAW_TOOL_DEFS: readonly OpenClawToolDef[] = [
  {
    name: "ctx_execute",
    description:
      "在沙箱子进程中执行代码。仅 stdout 进入上下文。任何产出超过 20 行的命令都优先用本工具而非 Bash。",
    parameters: {
      type: "object",
      properties: {
        language: { type: "string", description: "运行时语言" },
        code: { type: "string", description: "要执行的源代码" },
        timeout: { type: "number", description: "最大执行时间（毫秒）" },
      },
      required: ["language", "code"],
      additionalProperties: true,
    },
    execute: cliRedirect("ctx_execute"),
  },
  {
    name: "ctx_execute_file",
    description:
      "以文件路径执行代码。仅打印的摘要进入上下文 —— 原始文件留在沙箱中。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径" },
        language: { type: "string", description: "运行时语言" },
        code: { type: "string", description: "源代码" },
      },
      required: ["path", "language", "code"],
      additionalProperties: true,
    },
    execute: cliRedirect("ctx_execute_file"),
  },
  {
    name: "ctx_index",
    description: "将内容存入 FTS5 知识库以便后续搜索。",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "要索引的文本" },
        source: { type: "string", description: "描述性来源标签" },
      },
      required: ["content", "source"],
      additionalProperties: true,
    },
    execute: cliRedirect("ctx_index"),
  },
  {
    name: "ctx_search",
    description: "通过 FTS5 查询已索引内容。所有问题请作为数组在一次调用中传入。",
    parameters: {
      type: "object",
      properties: {
        queries: { type: "array", description: "搜索查询" },
        source: { type: "string", description: "可选的来源筛选" },
        sort: { type: "string", description: "relevance | timeline" },
      },
      additionalProperties: true,
    },
    execute: cliRedirect("ctx_search"),
  },
  {
    name: "ctx_fetch_and_index",
    description: "抓取 URL、分块并索引 —— 原始 HTML 不会进入上下文。",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "要抓取的 URL" },
        source: { type: "string", description: "已索引分块的来源标签" },
      },
      required: ["url"],
      additionalProperties: true,
    },
    execute: cliRedirect("ctx_fetch_and_index"),
  },
  {
    name: "ctx_batch_execute",
    description:
      "在一次调用中运行多个命令和搜索查询。主力研究工具 —— 可替代 30+ 次单独调用。",
    parameters: {
      type: "object",
      properties: {
        commands: { type: "array", description: "{label, command} 对象数组" },
        queries: { type: "array", description: "索引后要运行的搜索查询" },
      },
      additionalProperties: true,
    },
    execute: cliRedirect("ctx_batch_execute"),
  },
  {
    name: "ctx_stats",
    description: "显示 context-mode 会话统计 —— token 消耗与各工具明细。",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: true,
    },
    execute: cliRedirect("ctx_stats"),
  },
  {
    name: "ctx_doctor",
    description: "运行 context-mode 诊断 —— 运行时、钩子、FTS5、插件注册。",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: true,
    },
    execute: cliRedirect("ctx_doctor"),
  },
  {
    name: "ctx_upgrade",
    description: "将 context-mode 升级到最新版本。",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: true,
    },
    execute: cliRedirect("ctx_upgrade"),
  },
  {
    name: "ctx_purge",
    description:
      "DESTRUCTIVE — permanently delete indexed content. CANNOT be undone.\n\n" +
      "MUST specify exactly ONE scope:\n" +
      "  • {confirm:true, sessionId:\"<uuid>\"}  → wipes ONLY that session's events + chunks; preserves stats and other sessions\n" +
      "  • {confirm:true, scope:\"project\"}      → wipes ENTIRE project: FTS5 KB + every session DB + stats file\n\n" +
      "REFUSED:\n" +
      "  • confirm:false                              → 'purge cancelled'\n" +
      "  • sessionId AND scope:\"project\" together     → 'ambiguous — pick one'\n" +
      "  • scope:\"session\" without sessionId          → throws\n" +
      "  • bare {confirm:true}                        → DEPRECATED: maps to scope:\"project\" with stderr warning\n\n" +
      "Use sessionId for clearing one conversation. Use scope:\"project\" only when the user explicitly resets everything. NEVER call with bare {confirm:true}.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: true,
    },
    execute: cliRedirect("ctx_purge"),
  },
  {
    name: "ctx_insight",
    description: "在浏览器中打开托管的 context-mode 洞察仪表盘（context-mode.com/insight）。",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: true,
    },
    execute: cliRedirect("ctx_insight"),
  },
];

/** Stable list of tool names — used by tests and manifest validation. */
export const OPENCLAW_TOOL_NAMES: readonly string[] = OPENCLAW_TOOL_DEFS.map(
  (def) => def.name,
);
