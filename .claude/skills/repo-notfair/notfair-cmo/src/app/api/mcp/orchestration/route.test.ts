import { describe, expect, it, vi, beforeEach } from "vitest";

const verifyMock = vi.fn();
vi.mock("@/server/mcp-server/secret", () => ({
  verifyMcpServerSecret: (...a: unknown[]) => verifyMock(...a),
}));

const handleJsonRpcMock = vi.fn();
vi.mock("@/server/mcp-server/jsonrpc", () => ({
  handleJsonRpc: (...a: unknown[]) => handleJsonRpcMock(...a),
}));

import { GET, POST } from "./route";

function makePost(headers: Record<string, string>, body: unknown): Request {
  return new Request("http://localhost/api/mcp/orchestration", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/mcp/orchestration — auth", () => {
  it("401 when Authorization is missing", async () => {
    verifyMock.mockReturnValue(false);
    const res = await POST(makePost({}, { jsonrpc: "2.0", id: 1, method: "ping" }));
    expect(res.status).toBe(401);
  });

  it("401 when bearer doesn't verify", async () => {
    verifyMock.mockReturnValue(false);
    const res = await POST(
      makePost(
        { Authorization: "Bearer wrong" },
        { jsonrpc: "2.0", id: 1, method: "ping" },
      ),
    );
    expect(res.status).toBe(401);
    expect(verifyMock).toHaveBeenCalledWith("wrong");
  });

  it("passes verified bearer through to dispatcher", async () => {
    verifyMock.mockReturnValue(true);
    handleJsonRpcMock.mockResolvedValue({
      jsonrpc: "2.0",
      id: 1,
      result: { pong: true },
    });
    const res = await POST(
      makePost(
        { Authorization: "Bearer ok", "Content-Type": "application/json" },
        { jsonrpc: "2.0", id: 1, method: "ping" },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { pong: boolean } };
    expect(body.result.pong).toBe(true);
  });
});

describe("POST /api/mcp/orchestration — body validation", () => {
  beforeEach(() => {
    verifyMock.mockReturnValue(true);
  });

  it("returns Parse error envelope when body isn't valid JSON", async () => {
    const res = await POST(
      makePost({ Authorization: "Bearer ok" }, "not json"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  it("rejects batched requests (array body) with Invalid Request", async () => {
    const res = await POST(
      makePost({ Authorization: "Bearer ok" }, [
        { jsonrpc: "2.0", id: 1, method: "ping" },
      ]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(-32600);
    expect(body.error.message).toMatch(/Batched/);
  });

  it("rejects non-2.0 jsonrpc payloads", async () => {
    const res = await POST(
      makePost({ Authorization: "Bearer ok" }, {
        jsonrpc: "1.0",
        id: 1,
        method: "ping",
      }),
    );
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32600);
  });

  it("returns 204 for notifications (handler returns null)", async () => {
    handleJsonRpcMock.mockResolvedValue(null);
    const res = await POST(
      makePost(
        { Authorization: "Bearer ok" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
      ),
    );
    expect(res.status).toBe(204);
  });
});

describe("GET /api/mcp/orchestration", () => {
  it("returns the server descriptor without leaking the secret", async () => {
    const res = await GET();
    const body = (await res.json()) as { name: string; transport: string };
    expect(body.name).toBe("notfair-cmo");
    expect(body.transport).toBe("streamable-http");
  });
});
