import { TOOLS, describeTool } from "./tools";

/**
 * Client-safe summary of an MCP tool, suitable for rendering in the
 * tools modal. We deliberately don't pass zod schemas (or full JSON
 * Schema trees) across the server/client boundary — the modal cares
 * about name + description + arg list, not validation.
 *
 * Same shape for built-in (notfair-orchestration) tools we own + for
 * external (Google Ads etc.) tools we learn about via tools/list. The
 * modal renders both identically.
 */
export type ToolArgSummary = {
  name: string;
  /**
   * One-token type hint: "string", "number", "boolean", `enum: a|b|c`,
   * "array<string>", "object". Picked for human readability rather
   * than schema fidelity.
   */
  type: string;
  description: string;
  required: boolean;
};

export type ToolSummary = {
  name: string;
  description: string;
  args: ToolArgSummary[];
};

/**
 * Walk TOOLS (server-side; the registry holds zod schemas + handlers)
 * and produce a JSON-safe summary array for the connections-page
 * built-in MCP card. We piggyback on describeTool() which already runs
 * the zod → JSON Schema conversion this app needs for the MCP protocol
 * surface, so the modal stays in lockstep with what agents actually see.
 */
export function summarizeBuiltinTools(): ToolSummary[] {
  return TOOLS.map((tool) => {
    const desc = describeTool(tool);
    return {
      name: desc.name,
      description: desc.description,
      args: argsFromJsonSchema(desc.inputSchema),
    };
  });
}

type JsonSchemaProp = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: { type?: string };
};

type JsonSchemaObject = {
  type?: string;
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
};

/**
 * Map a JSON-Schema object (the shape describeTool produces) into the
 * flat arg-summary list the UI renders. Unknown shapes degrade to
 * "unknown" type without crashing — better to show a tool with a fuzzy
 * arg row than to drop it.
 */
export function argsFromJsonSchema(
  schema: Record<string, unknown>,
): ToolArgSummary[] {
  const obj = schema as JsonSchemaObject;
  if (!obj.properties) return [];
  const required = new Set(obj.required ?? []);
  return Object.entries(obj.properties).map(([name, prop]) => ({
    name,
    type: typeHint(prop),
    description: prop.description ?? "",
    required: required.has(name),
  }));
}

function typeHint(prop: JsonSchemaProp): string {
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    return `enum: ${prop.enum.map(String).join(" | ")}`;
  }
  if (prop.type === "array") {
    return `array<${prop.items?.type ?? "any"}>`;
  }
  if (Array.isArray(prop.type)) return prop.type.join(" | ");
  return prop.type ?? "unknown";
}
