import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "@/server/db/migrations";

let testDb: Database.Database;

vi.mock("@/server/db/db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import { mcpRpcAutoRefresh } from "./rpc";
import { findMcpToken, upsertMcpToken } from "./tokens";

const PRESET_KEY = "notfair-googleads";
const PRESET_URL = "https://notfair.co/api/mcp/google_ads";

function applyMigrations(db: Database.Database): void {
  for (const migration of MIGRATIONS) db.exec(migration.sql);
}

function seedProject(slug = "acme"): void {
  testDb
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at) VALUES (?, ?, ?, ?)",
    )
    .run("p-" + slug, slug, slug, "2026-01-01T00:00:00.000Z");
}

function rpcOk(body: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: body }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function http401(): Response {
  return new Response("unauthorized", { status: 401 });
}

beforeEach(() => {
  testDb = new Database(":memory:");
  testDb.pragma("foreign_keys = ON");
  applyMigrations(testDb);
  seedProject();
});

afterEach(() => {
  testDb.close();
  vi.restoreAllMocks();
});

describe("mcpRpcAutoRefresh", () => {
  it("returns 401 when no token row exists", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await mcpRpcAutoRefresh("acme", PRESET_KEY, "initialize");
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === "http_error") {
      expect(r.status).toBe(401);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 404 when the catalog key is unknown", async () => {
    upsertMcpToken({
      project_slug: "acme",
      server_name: "ghost",
      access_token: "at",
    });
    const r = await mcpRpcAutoRefresh("acme", "ghost", "initialize");
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === "http_error") expect(r.status).toBe(404);
  });

  it("calls mcpRpc with the stored access token (happy path)", async () => {
    upsertMcpToken({
      project_slug: "acme",
      server_name: PRESET_KEY,
      access_token: "at-1",
      expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    const fetchSpy = vi.fn().mockResolvedValue(rpcOk({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);

    const r = await mcpRpcAutoRefresh("acme", PRESET_KEY, "initialize");
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer at-1");
  });

  it("refreshes proactively when expires_at is within the skew window", async () => {
    upsertMcpToken({
      project_slug: "acme",
      server_name: PRESET_KEY,
      access_token: "stale-at",
      refresh_token: "rt-1",
      expires_at: new Date(Date.now() + 10_000).toISOString(), // 10s away
      token_endpoint: "https://auth.example.com/token",
      client_id: "client-abc",
      client_secret: "shh",
    });

    const fetchSpy = vi
      .fn()
      // 1st call: refresh
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "fresh-at", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      // 2nd call: actual RPC against the MCP resource
      .mockResolvedValueOnce(rpcOk({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);

    const r = await mcpRpcAutoRefresh("acme", PRESET_KEY, "initialize");
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://auth.example.com/token");
    expect(fetchSpy.mock.calls[1][0]).toBe(PRESET_URL);
    expect(fetchSpy.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh-at");
    expect(findMcpToken("acme", PRESET_KEY)!.access_token_enc).toBe("fresh-at");
  });

  it("refreshes reactively on 401 and retries once", async () => {
    upsertMcpToken({
      project_slug: "acme",
      server_name: PRESET_KEY,
      access_token: "stale-at",
      refresh_token: "rt-1",
      expires_at: new Date(Date.now() + 60 * 60_000).toISOString(), // not soon
      token_endpoint: "https://auth.example.com/token",
      client_id: "client-abc",
    });
    // Backdate updated_at so the reactive guard ("just refreshed") doesn't
    // suppress the retry.
    testDb
      .prepare("UPDATE mcp_tokens SET updated_at = ? WHERE project_slug = ?")
      .run(new Date(Date.now() - 60_000).toISOString(), "acme");

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(http401()) // first RPC: 401
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "fresh-at", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(rpcOk({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);

    const r = await mcpRpcAutoRefresh("acme", PRESET_KEY, "initialize");
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[2][1].headers.Authorization).toBe("Bearer fresh-at");
  });

  it("does not loop refresh when the fresh token also 401s", async () => {
    upsertMcpToken({
      project_slug: "acme",
      server_name: PRESET_KEY,
      access_token: "stale-at",
      refresh_token: "rt-1",
      expires_at: new Date(Date.now() + 5_000).toISOString(), // triggers proactive refresh
      token_endpoint: "https://auth.example.com/token",
      client_id: "client-abc",
    });

    const fetchSpy = vi
      .fn()
      // proactive refresh
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "fresh-but-still-bad", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      // RPC still 401s (e.g. server invalidated the session)
      .mockResolvedValueOnce(http401());
    vi.stubGlobal("fetch", fetchSpy);

    const r = await mcpRpcAutoRefresh("acme", PRESET_KEY, "initialize");
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === "http_error") expect(r.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // no third call
  });

  it("returns the original 401 when no refresh_token is stored (legacy row)", async () => {
    upsertMcpToken({
      project_slug: "acme",
      server_name: PRESET_KEY,
      access_token: "stale-at",
      // no refresh_token, no token_endpoint, no client_id
    });
    const fetchSpy = vi.fn().mockResolvedValueOnce(http401());
    vi.stubGlobal("fetch", fetchSpy);

    const r = await mcpRpcAutoRefresh("acme", PRESET_KEY, "initialize");
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === "http_error") expect(r.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
