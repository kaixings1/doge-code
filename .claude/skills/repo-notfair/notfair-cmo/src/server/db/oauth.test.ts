import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "./migrations";

let testDb: Database.Database;

vi.mock("./db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

// Stub the cipher so the tests don't require a working OS keychain. The
// "encrypted" representation is just a length-prefixed marker that we can
// round-trip deterministically.
vi.mock("@/server/secrets/cipher", () => ({
  encrypt: async (plaintext: string) => `enc:${plaintext}`,
  decrypt: async (blob: string) => blob.replace(/^enc:/, ""),
}));

import {
  decryptToken,
  getOAuthTokenRecord,
  listOAuthTokens,
  storeOAuthToken,
} from "./oauth";

function applyMigrations(db: Database.Database): void {
  for (const migration of MIGRATIONS) {
    db.exec(migration.sql);
  }
}

function createDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return db;
}

function seedProject(slug = "acme"): void {
  testDb
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at) VALUES (?, ?, ?, ?)",
    )
    .run("p-" + slug, slug, slug, "2026-01-01T00:00:00.000Z");
}

beforeEach(() => {
  testDb = createDb();
});

afterEach(() => {
  testDb.close();
});

describe("storeOAuthToken", () => {
  it("encrypts and persists a new token row", async () => {
    seedProject();
    const out = await storeOAuthToken({
      project_slug: "acme",
      provider: "google_ads",
      account_label: "main",
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_at: "2027-01-01T00:00:00.000Z",
      scope: "https://www.googleapis.com/auth/adwords",
    });
    expect(out.id).toMatch(/[0-9a-f-]{36}/);
    expect(out.project_slug).toBe("acme");
    expect(out.provider).toBe("google_ads");
    expect(out.account_label).toBe("main");
    expect(out.access_token_enc).toBe("enc:access-1");
    expect(out.refresh_token_enc).toBe("enc:refresh-1");
    expect(out.expires_at).toBe("2027-01-01T00:00:00.000Z");
    expect(out.scope).toBe("https://www.googleapis.com/auth/adwords");

    // Round-trip via DB.
    const row = testDb
      .prepare(
        "SELECT * FROM oauth_tokens WHERE project_slug=? AND provider=? AND account_label=?",
      )
      .get("acme", "google_ads", "main");
    expect(row).toMatchObject({ access_token_enc: "enc:access-1" });
  });

  it("upserts on (project_slug, provider, account_label) conflict", async () => {
    seedProject();
    const a = await storeOAuthToken({
      project_slug: "acme",
      provider: "google_ads",
      account_label: "main",
      access_token: "a1",
      refresh_token: "r1",
      expires_at: "2027-01-01T00:00:00.000Z",
      scope: "scope",
    });
    // Force a different time so we can verify updated_at advanced.
    await new Promise((r) => setTimeout(r, 5));
    const b = await storeOAuthToken({
      project_slug: "acme",
      provider: "google_ads",
      account_label: "main",
      access_token: "a2",
      refresh_token: "r2",
      expires_at: "2028-01-01T00:00:00.000Z",
      scope: "scope2",
    });

    // ON CONFLICT keeps the original primary key id (excluded.id is not set).
    expect(b.id).toBe(a.id);
    expect(b.access_token_enc).toBe("enc:a2");
    expect(b.refresh_token_enc).toBe("enc:r2");
    expect(b.expires_at).toBe("2028-01-01T00:00:00.000Z");
    expect(b.scope).toBe("scope2");
    // created_at unchanged; updated_at advanced.
    expect(b.created_at).toBe(a.created_at);
    expect(Date.parse(b.updated_at)).toBeGreaterThanOrEqual(Date.parse(a.updated_at));

    const count = testDb
      .prepare("SELECT COUNT(*) AS n FROM oauth_tokens")
      .get() as { n: number };
    expect(count.n).toBe(1);
  });

  it("allows multiple account_labels per (project, provider)", async () => {
    seedProject();
    await storeOAuthToken({
      project_slug: "acme",
      provider: "google_ads",
      account_label: "main",
      access_token: "a",
      refresh_token: "r",
      expires_at: "x",
      scope: "s",
    });
    await storeOAuthToken({
      project_slug: "acme",
      provider: "google_ads",
      account_label: "secondary",
      access_token: "a",
      refresh_token: "r",
      expires_at: "x",
      scope: "s",
    });
    expect(listOAuthTokens("acme")).toHaveLength(2);
  });

  it("throws on invalid provider via CHECK constraint", async () => {
    seedProject();
    await expect(
      storeOAuthToken({
        project_slug: "acme",
        // @ts-expect-error invalid on purpose
        provider: "twitter",
        account_label: "main",
        access_token: "a",
        refresh_token: "r",
        expires_at: "x",
        scope: "s",
      }),
    ).rejects.toThrow(/CHECK/i);
  });

  it("trips FK on missing project", async () => {
    await expect(
      storeOAuthToken({
        project_slug: "no-such",
        provider: "gsc",
        account_label: "main",
        access_token: "a",
        refresh_token: "r",
        expires_at: "x",
        scope: "s",
      }),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });
});

describe("listOAuthTokens", () => {
  it("orders by provider, account_label and isolates by project", async () => {
    seedProject("a");
    seedProject("b");
    await storeOAuthToken({
      project_slug: "a",
      provider: "gsc",
      account_label: "z",
      access_token: "a",
      refresh_token: "r",
      expires_at: "x",
      scope: "s",
    });
    await storeOAuthToken({
      project_slug: "a",
      provider: "google_ads",
      account_label: "z",
      access_token: "a",
      refresh_token: "r",
      expires_at: "x",
      scope: "s",
    });
    await storeOAuthToken({
      project_slug: "a",
      provider: "google_ads",
      account_label: "a",
      access_token: "a",
      refresh_token: "r",
      expires_at: "x",
      scope: "s",
    });
    await storeOAuthToken({
      project_slug: "b",
      provider: "google_ads",
      account_label: "main",
      access_token: "a",
      refresh_token: "r",
      expires_at: "x",
      scope: "s",
    });

    const rows = listOAuthTokens("a");
    expect(rows.map((r) => `${r.provider}:${r.account_label}`)).toEqual([
      "google_ads:a",
      "google_ads:z",
      "gsc:z",
    ]);
  });

  it("returns empty array for projects with no tokens", () => {
    seedProject();
    expect(listOAuthTokens("acme")).toEqual([]);
  });
});

describe("getOAuthTokenRecord", () => {
  it("returns the matching row when account_label is provided", async () => {
    seedProject();
    await storeOAuthToken({
      project_slug: "acme",
      provider: "google_ads",
      account_label: "main",
      access_token: "a",
      refresh_token: "r",
      expires_at: "x",
      scope: "s",
    });
    const row = getOAuthTokenRecord("acme", "google_ads", "main");
    expect(row).not.toBeNull();
    expect(row!.account_label).toBe("main");
  });

  it("returns null when account_label is provided but doesn't match", async () => {
    seedProject();
    await storeOAuthToken({
      project_slug: "acme",
      provider: "google_ads",
      account_label: "main",
      access_token: "a",
      refresh_token: "r",
      expires_at: "x",
      scope: "s",
    });
    expect(getOAuthTokenRecord("acme", "google_ads", "missing")).toBeNull();
  });

  it("falls back to LIMIT 1 when account_label is omitted", async () => {
    seedProject();
    await storeOAuthToken({
      project_slug: "acme",
      provider: "google_ads",
      account_label: "main",
      access_token: "a",
      refresh_token: "r",
      expires_at: "x",
      scope: "s",
    });
    await storeOAuthToken({
      project_slug: "acme",
      provider: "google_ads",
      account_label: "secondary",
      access_token: "a",
      refresh_token: "r",
      expires_at: "x",
      scope: "s",
    });
    const row = getOAuthTokenRecord("acme", "google_ads");
    expect(row).not.toBeNull();
    expect(["main", "secondary"]).toContain(row!.account_label);
  });

  it("returns null when no rows match (no account_label)", () => {
    seedProject();
    expect(getOAuthTokenRecord("acme", "google_ads")).toBeNull();
  });
});

describe("decryptToken", () => {
  it("decrypts both access and refresh tokens", async () => {
    seedProject();
    const stored = await storeOAuthToken({
      project_slug: "acme",
      provider: "google_ads",
      account_label: "main",
      access_token: "the-access",
      refresh_token: "the-refresh",
      expires_at: "x",
      scope: "s",
    });
    const decoded = await decryptToken(stored);
    expect(decoded).toEqual({
      access_token: "the-access",
      refresh_token: "the-refresh",
    });
  });
});
