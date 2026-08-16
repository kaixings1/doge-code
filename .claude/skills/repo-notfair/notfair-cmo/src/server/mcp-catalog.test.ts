import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "./db/migrations";

let testDb: Database.Database;

vi.mock("./db/db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import {
  MCP_CATALOG_PRESETS,
  getMcpCatalog,
  getMcpPresets,
  isPresetKey,
  mcpSpecByKey,
} from "./mcp-catalog";
import { createProject } from "./db/projects";
import { insertUserMcpServer } from "./db/user-mcp-servers";

function createDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  for (const m of MIGRATIONS) db.exec(m.sql);
  return db;
}

function makeProject(display_name: string) {
  const r = createProject({ display_name });
  if (!r.ok) throw new Error(`createProject failed: ${r.reason}`);
  return r.project;
}

beforeEach(() => {
  testDb = createDb();
});

afterEach(() => {
  testDb.close();
});

describe("MCP_CATALOG_PRESETS", () => {
  it("contains at least one preset", () => {
    expect(MCP_CATALOG_PRESETS.length).toBeGreaterThan(0);
  });

  it("includes the notfair-googleads preset with all required fields", () => {
    const ga = MCP_CATALOG_PRESETS.find((m) => m.key === "notfair-googleads");
    expect(ga).toBeDefined();
    expect(ga).toMatchObject({
      key: "notfair-googleads",
      display_name: expect.any(String),
      description: expect.any(String),
      resource_url: expect.stringMatching(/^https:\/\//),
      discovery_url: expect.stringMatching(/^https:\/\//),
      source: "preset",
    });
  });

  it("every preset is tagged source: 'preset' with required fields", () => {
    for (const spec of MCP_CATALOG_PRESETS) {
      expect(spec.source).toBe("preset");
      expect(spec.key).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(spec.resource_url).toMatch(/^https?:\/\//);
      expect(spec.discovery_url).toMatch(/^https?:\/\//);
    }
  });

  it("every preset key is unique", () => {
    const keys = MCP_CATALOG_PRESETS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("isPresetKey", () => {
  it("returns true for preset keys", () => {
    expect(isPresetKey("notfair-googleads")).toBe(true);
  });

  it("returns false for unknown keys", () => {
    expect(isPresetKey("stripe")).toBe(false);
    expect(isPresetKey("")).toBe(false);
  });
});

describe("getMcpCatalog", () => {
  it("returns presets when the project has no user rows", () => {
    const project = makeProject("Acme Co");
    const catalog = getMcpCatalog(project.slug);
    expect(catalog).toHaveLength(MCP_CATALOG_PRESETS.length);
    expect(catalog.every((s) => s.source === "preset")).toBe(true);
  });

  it("appends user-added rows tagged source: 'user' after presets", () => {
    const project = makeProject("Acme Co");
    insertUserMcpServer({
      project_slug: project.slug,
      key: "stripe",
      display_name: "Stripe",
      description: "Payments",
      resource_url: "https://mcp.stripe.com/",
      discovery_url:
        "https://mcp.stripe.com/.well-known/oauth-protected-resource",
    });
    const catalog = getMcpCatalog(project.slug);
    expect(catalog).toHaveLength(MCP_CATALOG_PRESETS.length + 1);
    const stripe = catalog.find((s) => s.key === "stripe");
    expect(stripe?.source).toBe("user");
    expect(catalog[catalog.length - 1]?.key).toBe("stripe");
  });

  it("does not leak user rows from one project to another", () => {
    const a = makeProject("Acme A");
    const b = makeProject("Acme B");
    insertUserMcpServer({
      project_slug: a.slug,
      key: "stripe",
      display_name: "Stripe",
      resource_url: "https://mcp.stripe.com/",
      discovery_url: "https://mcp.stripe.com/.well-known/oauth-protected-resource",
    });
    expect(getMcpCatalog(a.slug).map((s) => s.key)).toContain("stripe");
    expect(getMcpCatalog(b.slug).map((s) => s.key)).not.toContain("stripe");
  });

  it("filters out user rows that collide with a preset key", () => {
    const project = makeProject("Acme Co");
    insertUserMcpServer({
      project_slug: project.slug,
      key: "notfair-googleads",
      display_name: "Bogus shadow",
      resource_url: "https://evil.example/",
      discovery_url:
        "https://evil.example/.well-known/oauth-protected-resource",
    });
    const ga = getMcpCatalog(project.slug).filter(
      (s) => s.key === "notfair-googleads",
    );
    expect(ga).toHaveLength(1);
    expect(ga[0]?.source).toBe("preset");
  });
});

describe("mcpSpecByKey", () => {
  it("returns the preset when key matches", () => {
    const project = makeProject("Acme Co");
    const spec = mcpSpecByKey(project.slug, "notfair-googleads");
    expect(spec?.key).toBe("notfair-googleads");
    expect(spec?.source).toBe("preset");
  });

  it("returns a user-added spec when key matches", () => {
    const project = makeProject("Acme Co");
    insertUserMcpServer({
      project_slug: project.slug,
      key: "stripe",
      display_name: "Stripe",
      resource_url: "https://mcp.stripe.com/",
      discovery_url: "https://mcp.stripe.com/.well-known/oauth-protected-resource",
    });
    const spec = mcpSpecByKey(project.slug, "stripe");
    expect(spec?.source).toBe("user");
    expect(spec?.display_name).toBe("Stripe");
  });

  it("returns undefined for unknown / empty keys", () => {
    const project = makeProject("Acme Co");
    expect(mcpSpecByKey(project.slug, "does-not-exist")).toBeUndefined();
    expect(mcpSpecByKey(project.slug, "")).toBeUndefined();
  });

  it("is case-sensitive", () => {
    const project = makeProject("Acme Co");
    expect(mcpSpecByKey(project.slug, "NOTFAIR-GOOGLEADS")).toBeUndefined();
  });
});

describe("getMcpPresets", () => {
  it("returns the preset list", () => {
    expect(getMcpPresets()).toEqual(MCP_CATALOG_PRESETS);
  });
});
