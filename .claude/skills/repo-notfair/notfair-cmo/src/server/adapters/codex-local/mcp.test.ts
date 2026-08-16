import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── In-memory fs mock ──────────────────────────────────────────────────

interface FsState {
  files: Map<string, string>;
  dirs: Set<string>;
}
const fsState: FsState = { files: new Map(), dirs: new Set() };

vi.mock("node:fs", () => ({
  existsSync: (p: string) => fsState.files.has(p),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: async (p: string) => {
    fsState.dirs.add(p);
  },
  readFile: async (p: string) => {
    const v = fsState.files.get(p);
    if (v === undefined) throw new Error(`ENOENT: ${p}`);
    return v;
  },
  writeFile: async (p: string, content: string) => {
    fsState.files.set(p, content);
  },
}));

beforeEach(() => {
  fsState.files.clear();
  fsState.dirs.clear();
  process.env.CODEX_HOME = "/codex";
});

afterEach(() => {
  delete process.env.CODEX_HOME;
});

// Imported after the mock so the in-memory fs is the one the module uses.
import {
  CODEX_BEARER_ENV_VAR,
  pruneOrphanCodexNamespaces,
  registerCodexMcp,
  unregisterCodexMcp,
} from "./mcp";
import type { McpRegistrationSpec } from "../types";

function makeHttpSpec(
  overrides: Partial<McpRegistrationSpec> = {},
): McpRegistrationSpec {
  return {
    serverName: "notfair-orchestration",
    agentId: "acme-cmo-greg",
    projectSlug: "acme",
    transport: {
      type: "http",
      url: "http://127.0.0.1:3326/api/mcp/orchestration",
      headers: { Authorization: "Bearer s3cret" },
    },
    ...overrides,
  };
}

describe("registerCodexMcp (http)", () => {
  it("emits bearer_token_env_var instead of raw Authorization header", async () => {
    await registerCodexMcp(makeHttpSpec());
    const toml = fsState.files.get("/codex/config.toml") ?? "";
    expect(toml).toContain(
      `[mcp_servers.notfair_acme__notfair_orchestration]`,
    );
    expect(toml).toContain(
      `url = "http://127.0.0.1:3326/api/mcp/orchestration"`,
    );
    expect(toml).toContain(
      `bearer_token_env_var = ${JSON.stringify(CODEX_BEARER_ENV_VAR)}`,
    );
    // Regression: codex 0.132+ marks raw `headers = {Authorization=...}` as
    // Auth: Unsupported and refuses to expose the MCP tools.
    expect(toml).not.toMatch(/headers\s*=\s*\{\s*Authorization/);
    expect(toml).not.toContain("s3cret");
  });

  it("preserves non-Authorization headers verbatim", async () => {
    await registerCodexMcp(
      makeHttpSpec({
        transport: {
          type: "http",
          url: "https://example.test/mcp",
          headers: {
            Authorization: "Bearer s3cret",
            "X-Custom": "yes",
          },
        },
      }),
    );
    const toml = fsState.files.get("/codex/config.toml") ?? "";
    expect(toml).toContain(`bearer_token_env_var = ${JSON.stringify(CODEX_BEARER_ENV_VAR)}`);
    expect(toml).toContain(`headers = { X-Custom = "yes" }`);
  });

  it("is idempotent on re-registration (single section, no duplicates)", async () => {
    await registerCodexMcp(makeHttpSpec());
    await registerCodexMcp(makeHttpSpec());
    const toml = fsState.files.get("/codex/config.toml") ?? "";
    const matches = toml.match(
      /\[mcp_servers\.notfair_acme__notfair_orchestration\]/g,
    );
    expect(matches?.length).toBe(1);
  });

  it("namespaces by project slug so two projects don't collide", async () => {
    await registerCodexMcp(makeHttpSpec({ projectSlug: "acme" }));
    await registerCodexMcp(makeHttpSpec({ projectSlug: "globex" }));
    const toml = fsState.files.get("/codex/config.toml") ?? "";
    expect(toml).toContain(
      `[mcp_servers.notfair_acme__notfair_orchestration]`,
    );
    expect(toml).toContain(
      `[mcp_servers.notfair_globex__notfair_orchestration]`,
    );
  });

  it("collapses two agents in the same project into one shared entry", async () => {
    await registerCodexMcp(
      makeHttpSpec({ projectSlug: "acme", agentId: "acme-cmo-greg" }),
    );
    await registerCodexMcp(
      makeHttpSpec({ projectSlug: "acme", agentId: "acme-google-ads-ana" }),
    );
    const toml = fsState.files.get("/codex/config.toml") ?? "";
    const matches = toml.match(
      /\[mcp_servers\.notfair_acme__notfair_orchestration\]/g,
    );
    expect(matches?.length).toBe(1);
    // No per-agent suffixes left in the file from either registration.
    expect(toml).not.toContain("notfair_acme_cmo_greg__");
    expect(toml).not.toContain("notfair_acme_google_ads_ana__");
  });
});

describe("registerCodexMcp (stdio)", () => {
  it("writes command + args; no bearer env var (stdio uses inline env)", async () => {
    await registerCodexMcp({
      serverName: "stdio-thing",
      agentId: "acme-cmo-greg",
      projectSlug: "acme",
      transport: {
        type: "stdio",
        command: "node",
        args: ["server.js"],
        env: { KEY: "v" },
      },
    });
    const toml = fsState.files.get("/codex/config.toml") ?? "";
    expect(toml).toContain(`command = "node"`);
    expect(toml).toContain(`args = ["server.js"]`);
    expect(toml).toContain(`env = { KEY = "v" }`);
    expect(toml).not.toContain("bearer_token_env_var");
  });
});

describe("unregisterCodexMcp", () => {
  it("removes only the matching project's section", async () => {
    await registerCodexMcp(makeHttpSpec({ projectSlug: "acme" }));
    await registerCodexMcp(makeHttpSpec({ projectSlug: "globex" }));
    await unregisterCodexMcp("notfair-orchestration", "acme");
    const toml = fsState.files.get("/codex/config.toml") ?? "";
    expect(toml).not.toContain("notfair_acme__");
    expect(toml).toContain("notfair_globex__");
  });
});

describe("pruneOrphanCodexNamespaces", () => {
  it("strips legacy per-agent sections (prefix is an agent id, not a project slug)", async () => {
    // Hand-write a config that looks like what an upgraded 0.3.x install
    // would have: per-agent prefixes from before per-project namespacing.
    fsState.files.set(
      "/codex/config.toml",
      [
        `[mcp_servers.notfair_acme_cmo_greg__notfair_orchestration]`,
        `url = "http://x"`,
        ``,
        `[mcp_servers.notfair_acme_google_ads_ana__notfair_orchestration]`,
        `url = "http://x"`,
        ``,
        `[mcp_servers.notfair_acme__notfair_orchestration]`,
        `url = "http://x"`,
        ``,
      ].join("\n"),
    );
    const removed = await pruneOrphanCodexNamespaces(new Set(["acme"]));
    expect(removed).toBe(2);
    const toml = fsState.files.get("/codex/config.toml") ?? "";
    expect(toml).toContain("notfair_acme__notfair_orchestration");
    expect(toml).not.toContain("notfair_acme_cmo_greg__");
    expect(toml).not.toContain("notfair_acme_google_ads_ana__");
  });

  it("strips sections for deleted projects", async () => {
    fsState.files.set(
      "/codex/config.toml",
      [
        `[mcp_servers.notfair_acme__notfair_orchestration]`,
        `url = "http://x"`,
        ``,
        `[mcp_servers.notfair_oldproject__notfair_orchestration]`,
        `url = "http://x"`,
        ``,
      ].join("\n"),
    );
    const removed = await pruneOrphanCodexNamespaces(new Set(["acme"]));
    expect(removed).toBe(1);
    const toml = fsState.files.get("/codex/config.toml") ?? "";
    expect(toml).toContain("notfair_acme__");
    expect(toml).not.toContain("notfair_oldproject__");
  });

  it("leaves user-installed non-notfair servers alone", async () => {
    fsState.files.set(
      "/codex/config.toml",
      [
        `[mcp_servers.user_linear]`,
        `command = "linear-mcp"`,
        ``,
        `[mcp_servers.notfair_dead__notfair_orchestration]`,
        `url = "http://x"`,
        ``,
      ].join("\n"),
    );
    const removed = await pruneOrphanCodexNamespaces(new Set(["acme"]));
    expect(removed).toBe(1);
    const toml = fsState.files.get("/codex/config.toml") ?? "";
    expect(toml).toContain(`[mcp_servers.user_linear]`);
    expect(toml).toContain(`command = "linear-mcp"`);
    expect(toml).not.toContain("notfair_dead__");
  });

  it("normalizes dashed slugs to underscored prefixes before comparing", async () => {
    fsState.files.set(
      "/codex/config.toml",
      [
        `[mcp_servers.notfair_acme_co__notfair_orchestration]`,
        `url = "http://x"`,
        ``,
      ].join("\n"),
    );
    // Project slug uses a dash; namespace prefix uses underscore.
    const removed = await pruneOrphanCodexNamespaces(new Set(["acme-co"]));
    expect(removed).toBe(0);
    expect(fsState.files.get("/codex/config.toml")).toContain(
      "notfair_acme_co__",
    );
  });

  it("is a no-op when the config file is absent", async () => {
    const removed = await pruneOrphanCodexNamespaces(new Set(["acme"]));
    expect(removed).toBe(0);
    expect(fsState.files.has("/codex/config.toml")).toBe(false);
  });
});
