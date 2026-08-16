import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
});

afterEach(() => {
  // nothing
});

import { registerClaudeCodeMcp, unregisterClaudeCodeMcp } from "./mcp";
import type { McpRegistrationSpec } from "../types";

const WORKSPACE = "/workspace/agent";

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

describe("registerClaudeCodeMcp (http)", () => {
  it("writes .mcp.json with url + headers carrying the bearer", async () => {
    await registerClaudeCodeMcp(WORKSPACE, makeHttpSpec());
    const raw = fsState.files.get("/workspace/agent/.mcp.json");
    expect(raw).toBeDefined();
    const cfg = JSON.parse(raw!);
    expect(cfg.mcpServers["notfair-orchestration"]).toEqual({
      type: "http",
      url: "http://127.0.0.1:3326/api/mcp/orchestration",
      headers: { Authorization: "Bearer s3cret" },
    });
  });

  it("re-registering the same server replaces, doesn't duplicate", async () => {
    await registerClaudeCodeMcp(WORKSPACE, makeHttpSpec());
    await registerClaudeCodeMcp(
      WORKSPACE,
      makeHttpSpec({
        transport: {
          type: "http",
          url: "http://127.0.0.1:3326/api/mcp/orchestration",
          headers: { Authorization: "Bearer rotated" },
        },
      }),
    );
    const cfg = JSON.parse(
      fsState.files.get("/workspace/agent/.mcp.json") ?? "{}",
    );
    expect(Object.keys(cfg.mcpServers)).toHaveLength(1);
    expect(cfg.mcpServers["notfair-orchestration"].headers.Authorization).toBe(
      "Bearer rotated",
    );
  });

  it("preserves other servers when adding a new one", async () => {
    fsState.files.set(
      "/workspace/agent/.mcp.json",
      JSON.stringify({
        mcpServers: {
          existing: { type: "stdio", command: "node", args: ["x.js"] },
        },
      }),
    );
    await registerClaudeCodeMcp(WORKSPACE, makeHttpSpec());
    const cfg = JSON.parse(
      fsState.files.get("/workspace/agent/.mcp.json") ?? "{}",
    );
    expect(Object.keys(cfg.mcpServers).sort()).toEqual([
      "existing",
      "notfair-orchestration",
    ]);
  });
});

describe("registerClaudeCodeMcp (stdio)", () => {
  it("emits a stdio server with command, args, env", async () => {
    await registerClaudeCodeMcp(WORKSPACE, {
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
    const cfg = JSON.parse(
      fsState.files.get("/workspace/agent/.mcp.json") ?? "{}",
    );
    expect(cfg.mcpServers["stdio-thing"]).toEqual({
      type: "stdio",
      command: "node",
      args: ["server.js"],
      env: { KEY: "v" },
    });
  });
});

describe("unregisterClaudeCodeMcp", () => {
  it("drops the named server but leaves others", async () => {
    await registerClaudeCodeMcp(WORKSPACE, makeHttpSpec());
    await registerClaudeCodeMcp(WORKSPACE, {
      serverName: "other",
      agentId: "acme-cmo-greg",
      projectSlug: "acme",
      transport: { type: "stdio", command: "x", args: [] },
    });
    await unregisterClaudeCodeMcp(WORKSPACE, "notfair-orchestration");
    const cfg = JSON.parse(
      fsState.files.get("/workspace/agent/.mcp.json") ?? "{}",
    );
    expect(Object.keys(cfg.mcpServers)).toEqual(["other"]);
  });
});
