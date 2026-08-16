import { NextResponse } from "next/server";

import { handleJsonRpc, type JsonRpcRequest } from "@/server/mcp-server/jsonrpc";
import { verifyMcpServerSecret } from "@/server/mcp-server/secret";
import { TOOLS } from "@/server/mcp-server/tools";

const SERVER_INFO = {
  name: "notfair-orchestration",
  version: "0.2.0",
  tools: TOOLS,
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * MCP server endpoint for OpenClaw-side specialist agents.
 *
 * Transport: streamable-http with single-shot JSON responses (no SSE; the
 * orchestration tools are short-lived and don't stream). OpenClaw accepts
 * either; plain JSON keeps the code small.
 *
 * Auth: shared secret in ~/.notfair-cmo/mcp-server-secret. Loopback-only +
 * single-user CLI, so a shared bearer is sufficient. Agents pick up the
 * secret via the per-project `openclaw mcp set` registration step.
 */

function unauthorized(): Response {
  return new NextResponse("Unauthorized", { status: 401 });
}

function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

export async function POST(req: Request): Promise<Response> {
  const bearer = bearerFrom(req);
  if (!verifyMcpServerSecret(bearer)) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
      { status: 200 },
    );
  }

  // Batched calls are part of JSON-RPC but MCP's tool flow is one-at-a-time;
  // we don't need to support arrays today. Reject explicitly so callers see
  // a clean error rather than a silent miss.
  if (Array.isArray(body)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message: "Batched requests are not supported by this server.",
        },
      },
      { status: 200 },
    );
  }

  const request = body as JsonRpcRequest;
  if (!request || typeof request !== "object" || request.jsonrpc !== "2.0") {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: request?.id ?? null,
        error: { code: -32600, message: "Invalid Request" },
      },
      { status: 200 },
    );
  }

  const response = await handleJsonRpc(request, SERVER_INFO);
  if (response === null) {
    // Notification — JSON-RPC mandates no body. Return 204 so the client
    // doesn't try to parse anything.
    return new Response(null, { status: 204 });
  }
  return NextResponse.json(response, { status: 200 });
}

export async function GET(): Promise<Response> {
  // Some MCP clients ping with GET first to discover the endpoint. Return a
  // tiny shape so they know this is an MCP HTTP server (without leaking the
  // secret-check; auth still applies to POST).
  return NextResponse.json({
    name: SERVER_INFO.name,
    transport: "streamable-http",
    note: "POST JSON-RPC with Bearer auth. See ~/.notfair-cmo/mcp-server-secret.",
  });
}
