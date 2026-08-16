import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "@/server/db/migrations";

let testDb: Database.Database;

vi.mock("@/server/db/db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import { refreshMcpToken, isExpiringSoon } from "./refresh";
import { findMcpToken, upsertMcpToken, type McpToken } from "./tokens";

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

function makeToken(overrides: Partial<McpToken> = {}): McpToken {
  seedProject();
  const row = upsertMcpToken({
    project_slug: "acme",
    server_name: "stripe",
    access_token: overrides.access_token_enc ?? "old-at",
    refresh_token: overrides.refresh_token_enc ?? "rt-1",
    expires_at: overrides.expires_at ?? "2026-01-01T00:00:00.000Z",
    token_endpoint: overrides.token_endpoint ?? "https://auth.example.com/token",
    client_id: overrides.client_id ?? "client-abc",
    client_secret: overrides.client_secret ?? "shh",
  });
  return row;
}

beforeEach(() => {
  testDb = new Database(":memory:");
  testDb.pragma("foreign_keys = ON");
  applyMigrations(testDb);
});

afterEach(() => {
  testDb.close();
  vi.restoreAllMocks();
});

describe("refreshMcpToken", () => {
  it("exchanges refresh_token for a fresh access_token and persists it", async () => {
    const token = makeToken();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: "new-at", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const refreshed = await refreshMcpToken(token);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.access_token_enc).toBe("new-at");
    expect(refreshed!.refresh_token_enc).toBe("rt-1");
    expect(Date.parse(refreshed!.expires_at!)).toBeGreaterThan(Date.now() + 3500 * 1000);

    const stored = findMcpToken("acme", "stripe");
    expect(stored!.access_token_enc).toBe("new-at");
  });

  it("rotates the refresh_token when the provider returns a new one", async () => {
    const token = makeToken();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "new-at",
            refresh_token: "rt-2",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const refreshed = await refreshMcpToken(token);
    expect(refreshed!.refresh_token_enc).toBe("rt-2");
  });

  it("returns null when the row has no refresh_token (legacy)", async () => {
    seedProject();
    const legacy = upsertMcpToken({
      project_slug: "acme",
      server_name: "stripe",
      access_token: "old-at",
      token_endpoint: "https://auth.example.com/token",
      client_id: "client-abc",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await refreshMcpToken(legacy)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when the row has no token_endpoint (legacy)", async () => {
    seedProject();
    const legacy = upsertMcpToken({
      project_slug: "acme",
      server_name: "stripe",
      access_token: "old-at",
      refresh_token: "rt-1",
      client_id: "client-abc",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await refreshMcpToken(legacy)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null on 4xx (revoked refresh token) without trashing the row", async () => {
    const token = makeToken();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("invalid_grant", { status: 400 })),
    );

    expect(await refreshMcpToken(token)).toBeNull();
    const stored = findMcpToken("acme", "stripe");
    expect(stored!.access_token_enc).toBe("old-at");
    expect(stored!.refresh_token_enc).toBe("rt-1");
  });

  it("returns null on network error", async () => {
    const token = makeToken();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect(await refreshMcpToken(token)).toBeNull();
  });

  it("omits client_secret when not stored (public client)", async () => {
    seedProject();
    const publicClient = upsertMcpToken({
      project_slug: "acme",
      server_name: "stripe",
      access_token: "old-at",
      refresh_token: "rt-1",
      token_endpoint: "https://auth.example.com/token",
      client_id: "client-abc",
      // no client_secret
    });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "new-at", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await refreshMcpToken(publicClient);
    const call = fetchSpy.mock.calls[0];
    const body = call[1].body as string;
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("client_id=client-abc");
    expect(body).not.toContain("client_secret");
  });
});

describe("isExpiringSoon", () => {
  function row(expires_at: string | null): McpToken {
    return {
      id: "x",
      project_slug: "acme",
      server_name: "stripe",
      account_label: "",
      access_token_enc: "at",
      refresh_token_enc: null,
      expires_at,
      scope: null,
      metadata_json: null,
      token_endpoint: null,
      client_id: null,
      client_secret: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  it("returns true when expires_at is in the past", () => {
    expect(isExpiringSoon(row("2020-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("returns true when expires_at is within the skew window", () => {
    const soon = new Date(Date.now() + 30_000).toISOString();
    expect(isExpiringSoon(row(soon))).toBe(true);
  });

  it("returns false when expires_at is comfortably in the future", () => {
    const later = new Date(Date.now() + 10 * 60_000).toISOString();
    expect(isExpiringSoon(row(later))).toBe(false);
  });

  it("returns false when expires_at is null (unknown)", () => {
    expect(isExpiringSoon(row(null))).toBe(false);
  });

  it("respects a custom skew", () => {
    const inTwoMin = new Date(Date.now() + 2 * 60_000).toISOString();
    expect(isExpiringSoon(row(inTwoMin), 30_000)).toBe(false);
    expect(isExpiringSoon(row(inTwoMin), 5 * 60_000)).toBe(true);
  });
});
