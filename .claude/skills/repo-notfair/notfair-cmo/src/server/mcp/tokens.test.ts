import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "@/server/db/migrations";

let testDb: Database.Database;

vi.mock("@/server/db/db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import {
  findMcpToken,
  updateMcpTokenSecrets,
  upsertMcpToken,
} from "./tokens";

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

beforeEach(() => {
  testDb = new Database(":memory:");
  testDb.pragma("foreign_keys = ON");
  applyMigrations(testDb);
});

afterEach(() => {
  testDb.close();
});

describe("upsertMcpToken (OAuth client fields)", () => {
  it("persists token_endpoint, client_id, client_secret, and refresh_token", () => {
    seedProject();
    const row = upsertMcpToken({
      project_slug: "acme",
      server_name: "stripe",
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_at: "2027-01-01T00:00:00.000Z",
      scope: "read_write",
      token_endpoint: "https://auth.example.com/token",
      client_id: "client-abc",
      client_secret: "shh",
    });
    expect(row.refresh_token_enc).toBe("rt-1");
    expect(row.expires_at).toBe("2027-01-01T00:00:00.000Z");
    expect(row.scope).toBe("read_write");
    expect(row.token_endpoint).toBe("https://auth.example.com/token");
    expect(row.client_id).toBe("client-abc");
    expect(row.client_secret).toBe("shh");
  });

  it("leaves OAuth client fields null when omitted (legacy callers)", () => {
    seedProject();
    const row = upsertMcpToken({
      project_slug: "acme",
      server_name: "legacy",
      access_token: "at",
    });
    expect(row.refresh_token_enc).toBeNull();
    expect(row.token_endpoint).toBeNull();
    expect(row.client_id).toBeNull();
    expect(row.client_secret).toBeNull();
  });

  it("overwrites OAuth client fields on update (re-auth case)", () => {
    seedProject();
    upsertMcpToken({
      project_slug: "acme",
      server_name: "stripe",
      access_token: "old",
      client_id: "old-client",
    });
    const after = upsertMcpToken({
      project_slug: "acme",
      server_name: "stripe",
      access_token: "new",
      refresh_token: "new-rt",
      client_id: "new-client",
      client_secret: "new-secret",
      token_endpoint: "https://auth.example.com/token",
    });
    expect(after.access_token_enc).toBe("new");
    expect(after.refresh_token_enc).toBe("new-rt");
    expect(after.client_id).toBe("new-client");
    expect(after.client_secret).toBe("new-secret");
    expect(after.token_endpoint).toBe("https://auth.example.com/token");
  });
});

describe("updateMcpTokenSecrets", () => {
  it("rotates access_token + expires_at without touching client fields", () => {
    seedProject();
    const row = upsertMcpToken({
      project_slug: "acme",
      server_name: "stripe",
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_at: "2027-01-01T00:00:00.000Z",
      token_endpoint: "https://auth.example.com/token",
      client_id: "client-abc",
      client_secret: "shh",
    });
    const updated = updateMcpTokenSecrets(row.id, {
      access_token: "at-2",
      expires_at: "2028-01-01T00:00:00.000Z",
    });
    expect(updated).not.toBeNull();
    expect(updated!.access_token_enc).toBe("at-2");
    expect(updated!.expires_at).toBe("2028-01-01T00:00:00.000Z");
    expect(updated!.refresh_token_enc).toBe("rt-1");
    expect(updated!.token_endpoint).toBe("https://auth.example.com/token");
    expect(updated!.client_id).toBe("client-abc");
    expect(updated!.client_secret).toBe("shh");
  });

  it("rotates refresh_token when provider issues a new one", () => {
    seedProject();
    const row = upsertMcpToken({
      project_slug: "acme",
      server_name: "stripe",
      access_token: "at-1",
      refresh_token: "rt-1",
    });
    const updated = updateMcpTokenSecrets(row.id, {
      access_token: "at-2",
      refresh_token: "rt-2",
    });
    expect(updated!.refresh_token_enc).toBe("rt-2");
  });

  it("keeps existing refresh_token when patch omits it (RFC 6749 §6)", () => {
    seedProject();
    const row = upsertMcpToken({
      project_slug: "acme",
      server_name: "stripe",
      access_token: "at-1",
      refresh_token: "rt-1",
    });
    const updated = updateMcpTokenSecrets(row.id, { access_token: "at-2" });
    expect(updated!.refresh_token_enc).toBe("rt-1");
  });

  it("returns null when row no longer exists", () => {
    expect(
      updateMcpTokenSecrets("nope-uuid", { access_token: "x" }),
    ).toBeNull();
  });
});

describe("findMcpToken (after migration 013)", () => {
  it("reads the new fields back via findMcpToken", () => {
    seedProject();
    upsertMcpToken({
      project_slug: "acme",
      server_name: "stripe",
      access_token: "at",
      refresh_token: "rt",
      token_endpoint: "https://auth.example.com/token",
      client_id: "client-abc",
    });
    const found = findMcpToken("acme", "stripe");
    expect(found).not.toBeNull();
    expect(found!.token_endpoint).toBe("https://auth.example.com/token");
    expect(found!.client_id).toBe("client-abc");
    expect(found!.refresh_token_enc).toBe("rt");
  });
});
