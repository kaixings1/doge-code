import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "./migrations";

let testDb: Database.Database;

vi.mock("./db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import {
  insertUserMcpServer,
  findUserMcpServer,
  listUserMcpServers,
  deleteUserMcpServer,
} from "./user-mcp-servers";
import { createProject } from "./projects";

function makeProject(display_name: string) {
  const r = createProject({ display_name });
  if (!r.ok) throw new Error(`createProject failed: ${r.reason}`);
  return r.project;
}

function createDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  for (const m of MIGRATIONS) db.exec(m.sql);
  return db;
}

beforeEach(() => {
  testDb = createDb();
});

afterEach(() => {
  testDb.close();
});

describe("user_mcp_servers CRUD", () => {
  it("insertUserMcpServer + findUserMcpServer round-trips a row", () => {
    const project = makeProject("Acme Co");
    const row = insertUserMcpServer({
      project_slug: project.slug,
      key: "stripe",
      display_name: "Stripe",
      description: "Payments",
      resource_url: "https://mcp.stripe.com/",
      discovery_url:
        "https://mcp.stripe.com/.well-known/oauth-protected-resource",
    });
    expect(row.id).toBeTruthy();
    expect(row.created_at).toBe(row.updated_at);

    const hit = findUserMcpServer(project.slug, "stripe");
    expect(hit?.display_name).toBe("Stripe");
    expect(hit?.resource_url).toBe("https://mcp.stripe.com/");
  });

  it("findUserMcpServer returns null for unknown rows", () => {
    const project = makeProject("Acme Co");
    expect(findUserMcpServer(project.slug, "nope")).toBeNull();
  });

  it("listUserMcpServers filters by project", () => {
    const a = makeProject("Acme A");
    const b = makeProject("Acme B");
    insertUserMcpServer({
      project_slug: a.slug,
      key: "stripe",
      display_name: "Stripe",
      resource_url: "https://mcp.stripe.com/",
      discovery_url: "https://mcp.stripe.com/.well-known/oauth-protected-resource",
    });
    insertUserMcpServer({
      project_slug: b.slug,
      key: "vercel",
      display_name: "Vercel",
      resource_url: "https://mcp.vercel.com/",
      discovery_url: "https://mcp.vercel.com/.well-known/oauth-protected-resource",
    });
    expect(listUserMcpServers(a.slug)).toHaveLength(1);
    expect(listUserMcpServers(b.slug)).toHaveLength(1);
    expect(listUserMcpServers(a.slug)[0]?.key).toBe("stripe");
  });

  it("(project_slug, key) is unique", () => {
    const project = makeProject("Acme Co");
    insertUserMcpServer({
      project_slug: project.slug,
      key: "stripe",
      display_name: "Stripe",
      resource_url: "https://mcp.stripe.com/",
      discovery_url: "https://mcp.stripe.com/.well-known/oauth-protected-resource",
    });
    expect(() =>
      insertUserMcpServer({
        project_slug: project.slug,
        key: "stripe",
        display_name: "Stripe v2",
        resource_url: "https://mcp.stripe.com/v2",
        discovery_url:
          "https://mcp.stripe.com/.well-known/oauth-protected-resource/v2",
      }),
    ).toThrow(/UNIQUE constraint/);
  });

  it("deleteUserMcpServer removes the row", () => {
    const project = makeProject("Acme Co");
    insertUserMcpServer({
      project_slug: project.slug,
      key: "stripe",
      display_name: "Stripe",
      resource_url: "https://mcp.stripe.com/",
      discovery_url: "https://mcp.stripe.com/.well-known/oauth-protected-resource",
    });
    deleteUserMcpServer(project.slug, "stripe");
    expect(findUserMcpServer(project.slug, "stripe")).toBeNull();
  });

  it("FK rejects an insert against an unknown project", () => {
    expect(() =>
      insertUserMcpServer({
        project_slug: "ghost",
        key: "stripe",
        display_name: "Stripe",
        resource_url: "https://mcp.stripe.com/",
        discovery_url:
          "https://mcp.stripe.com/.well-known/oauth-protected-resource",
      }),
    ).toThrow(/FOREIGN KEY/);
  });
});
