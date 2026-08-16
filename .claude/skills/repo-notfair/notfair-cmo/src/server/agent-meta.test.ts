import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentMeta } from "./agent-meta";

// ── Mocks ──────────────────────────────────────────────────────────

// In-memory "filesystem" backing both node:fs (sync) and node:fs/promises.
type FsState = {
  files: Map<string, string>;
  dirs: Set<string>;
  /** When set, readdir throws ENOENT for this root. */
  missingDirs: Set<string>;
};

const fsState: FsState = {
  files: new Map(),
  dirs: new Set(),
  missingDirs: new Set(),
};

vi.mock("node:fs", () => ({
  existsSync: (p: string) => fsState.files.has(p),
  readFileSync: (p: string) => {
    const v = fsState.files.get(p);
    if (v === undefined) throw new Error(`ENOENT: ${p}`);
    return v;
  },
}));

vi.mock("node:fs/promises", () => ({
  mkdir: async (p: string, _opts?: unknown) => {
    fsState.dirs.add(p);
  },
  writeFile: async (p: string, content: string, _enc?: string) => {
    fsState.files.set(p, content);
  },
  readdir: async (p: string) => {
    if (fsState.missingDirs.has(p)) {
      const err = new Error(`ENOENT: ${p}`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }
    // Return directory names under p that are direct children.
    const out = new Set<string>();
    const prefix = p.endsWith("/") ? p : `${p}/`;
    for (const file of fsState.files.keys()) {
      if (file.startsWith(prefix)) {
        const rest = file.slice(prefix.length);
        const first = rest.split("/")[0];
        if (first) out.add(first);
      }
    }
    for (const dir of fsState.dirs) {
      if (dir.startsWith(prefix)) {
        const rest = dir.slice(prefix.length);
        const first = rest.split("/")[0];
        if (first) out.add(first);
      }
    }
    return Array.from(out);
  },
}));

// homedir → deterministic path so tests don't depend on the runner's $HOME.
vi.mock("node:os", () => ({
  homedir: () => "/home/test",
}));

// Stub TEMPLATES so we don't depend on real prompt-edit churn. listProjectAgents
// only uses { key, display_name, description } from each entry + the helpers
// imported alongside.
vi.mock("./agent-templates", () => ({
  TEMPLATES: [
    {
      key: "cmo",
      display_name: "CMO",
      default_name: "Greg",
      description: "Chief Marketing Officer.",
      default_onboarding: true,
    },
    {
      key: "google_ads",
      display_name: "Google Ads",
      default_name: "Ana",
      description: "Google Ads specialist.",
      default_onboarding: true,
    },
    {
      key: "seo",
      display_name: "SEO",
      default_name: "Sam",
      description: "SEO specialist.",
      // Opt-in template: not pre-seeded, only appears via meta sidecar.
      default_onboarding: false,
    },
  ],
  agentNameFor: (slug: string, key: string) =>
    `${slug}-${key.replace(/_/g, "-")}`,
  urlSlugForTemplate: (key: string) => key.replace(/_/g, "-"),
  agentUrlSlug: (key: string, n: string) =>
    `${key.replace(/_/g, "-")}-${n
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)}`,
}));

import {
  listProjectAgents,
  readAgentMeta,
  resolveAgentBySlug,
  workspaceDirFor,
  writeAgentMeta,
} from "./agent-meta";

// ── Helpers ────────────────────────────────────────────────────────

function resetFs() {
  fsState.files.clear();
  fsState.dirs.clear();
  fsState.missingDirs.clear();
}

function makeMeta(overrides: Partial<AgentMeta> = {}): AgentMeta {
  return {
    agent_id: "acme-cmo",
    project_slug: "acme",
    slug: "cmo",
    name: "CMO",
    template_key: "cmo",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  resetFs();
  // Set deterministic data dir so paths are predictable.
  process.env.NOTFAIR_CMO_DATA_DIR = "/data";
});

// ── Tests ──────────────────────────────────────────────────────────

describe("workspaceDirFor", () => {
  it("returns <DATA_DIR>/agents/<agentId>", () => {
    expect(workspaceDirFor("acme-cmo")).toBe("/data/agents/acme-cmo");
  });

  it("falls back to homedir when env unset", () => {
    delete process.env.NOTFAIR_CMO_DATA_DIR;
    expect(workspaceDirFor("acme-cmo")).toBe(
      "/home/test/.notfair-cmo/agents/acme-cmo",
    );
  });
});

describe("writeAgentMeta + readAgentMeta", () => {
  it("writes JSON to <DATA_DIR>/agents/<agentId>/notfair-meta.json", async () => {
    const meta = makeMeta();
    await writeAgentMeta(meta);
    const written = fsState.files.get("/data/agents/acme-cmo/notfair-meta.json");
    expect(written).toBeDefined();
    expect(JSON.parse(written!)).toEqual(meta);
  });

  it("creates the parent directory recursively before writing", async () => {
    await writeAgentMeta(makeMeta());
    expect(fsState.dirs.has("/data/agents/acme-cmo")).toBe(true);
  });

  it("readAgentMeta returns the parsed object after a writeAgentMeta", async () => {
    const meta = makeMeta();
    await writeAgentMeta(meta);
    expect(readAgentMeta("acme-cmo")).toEqual(meta);
  });

  it("readAgentMeta returns null when the file does not exist", () => {
    expect(readAgentMeta("ghost-agent")).toBeNull();
  });

  it("readAgentMeta returns null when the file is malformed JSON", () => {
    fsState.files.set(
      "/data/agents/broken/notfair-meta.json",
      "{ not valid json",
    );
    expect(readAgentMeta("broken")).toBeNull();
  });

  it("round-trips an entry with optional source_agent_id (clone case)", async () => {
    const meta = makeMeta({
      agent_id: "acme-supa-clone",
      slug: "supa-clone",
      name: "Supabase Clone",
      source_agent_id: "acme-cmo",
    });
    await writeAgentMeta(meta);
    expect(readAgentMeta("acme-supa-clone")).toEqual(meta);
  });
});

describe("listProjectAgents", () => {
  it("returns the onboarding-default templates only when agents dir is missing", async () => {
    fsState.missingDirs.add("/data/agents");
    const r = await listProjectAgents("acme");
    // SEO is template_key: 'seo' with default_onboarding: false — it should
    // NOT appear until something explicitly provisions it for the project.
    expect(r).toHaveLength(2);
    expect(r.map((e) => e.agent_id)).toEqual([
      "acme-cmo",
      "acme-google-ads",
    ]);
    expect(r.every((e) => e.is_template_default)).toBe(true);
  });

  it("returns onboarding-default templates only when agents dir exists but has no entries for the project", async () => {
    // Empty dir: readdir resolves to [], no entries match.
    const r = await listProjectAgents("acme");
    expect(r.map((e) => e.agent_id)).toEqual([
      "acme-cmo",
      "acme-google-ads",
    ]);
  });

  it("includes an opt-in template (e.g. SEO) once a meta sidecar is written for it", async () => {
    await writeAgentMeta(
      makeMeta({
        agent_id: "acme-seo",
        slug: "seo",
        name: "SEO",
        template_key: "seo",
      }),
    );
    const r = await listProjectAgents("acme");
    const seo = r.find((e) => e.agent_id === "acme-seo");
    expect(seo).toBeDefined();
    expect(seo?.template_key).toBe("seo");
    // It now appears as a non-template-default entry (overlay row wins).
    expect(seo?.is_template_default).toBe(false);
  });

  it("overlays a meta sidecar so is_template_default flips to false", async () => {
    await writeAgentMeta(makeMeta()); // /data/agents/acme-cmo/notfair-meta.json
    const r = await listProjectAgents("acme");
    const cmo = r.find((e) => e.agent_id === "acme-cmo");
    expect(cmo?.is_template_default).toBe(false);
    expect(cmo?.name).toBe("CMO");
  });

  it("includes a cloned/custom agent with its source_agent_id surfaced", async () => {
    await writeAgentMeta(
      makeMeta({
        agent_id: "acme-supa-clone",
        slug: "supa-clone",
        name: "Supa Clone",
        template_key: undefined,
        source_agent_id: "acme-cmo",
      }),
    );
    const r = await listProjectAgents("acme");
    const clone = r.find((e) => e.agent_id === "acme-supa-clone");
    expect(clone).toMatchObject({
      agent_id: "acme-supa-clone",
      slug: "supa-clone",
      name: "Supa Clone",
      source_agent_id: "acme-cmo",
      is_template_default: false,
    });
  });

  it("orders templates by declared order, then custom by slug", async () => {
    await writeAgentMeta(
      makeMeta({
        agent_id: "acme-z-tool",
        slug: "z-tool",
        name: "Z Tool",
        template_key: undefined,
      }),
    );
    await writeAgentMeta(
      makeMeta({
        agent_id: "acme-a-tool",
        slug: "a-tool",
        name: "A Tool",
        template_key: undefined,
      }),
    );
    const r = await listProjectAgents("acme");
    // Onboarding-default templates first in declared order (SEO is opt-in
    // and not seeded), then custom alphabetically by slug. Template slugs
    // are computed `<role>-<slugified-name>` from the default_name.
    expect(r.map((e) => e.slug)).toEqual([
      "cmo-greg",
      "google-ads-ana",
      "a-tool",
      "z-tool",
    ]);
  });

  it("ignores entries from other projects (different slug prefix)", async () => {
    await writeAgentMeta(
      makeMeta({
        agent_id: "globex-cmo",
        project_slug: "globex",
        slug: "cmo",
        name: "Globex CMO",
      }),
    );
    const r = await listProjectAgents("acme");
    expect(r.find((e) => e.agent_id === "globex-cmo")).toBeUndefined();
    // Still has the onboarding-default templates for acme.
    expect(r.filter((e) => e.is_template_default)).toHaveLength(2);
  });

  it("skips entries with a matching prefix but no meta sidecar", async () => {
    // Create a phantom agent dir without a notfair-meta.json — simulates an
    // older workspace dir without the sidecar.
    fsState.dirs.add("/data/agents/acme-orphan");
    const r = await listProjectAgents("acme");
    // Should not include acme-orphan; just the onboarding-default templates.
    expect(r.find((e) => e.agent_id === "acme-orphan")).toBeUndefined();
    expect(r).toHaveLength(2);
  });

  it("does NOT leak agents from a project whose slug starts with this slug + '-'", async () => {
    // Regression: project "acme" must not list agents that belong to
    // project "acme-q4". The dir-name prefix `acme-` matches both
    // `acme-cmo-greg` (this project) AND `acme-q4-cmo-greg` (the other);
    // the meta sidecar's project_slug field is what disambiguates.
    await writeAgentMeta(
      makeMeta({
        agent_id: "acme-cmo-greg",
        project_slug: "acme",
        slug: "cmo-greg",
        name: "Greg",
      }),
    );
    await writeAgentMeta(
      makeMeta({
        agent_id: "acme-q4-cmo-greg",
        project_slug: "acme-q4",
        slug: "cmo-greg",
        name: "Greg",
      }),
    );

    const acme = await listProjectAgents("acme");
    expect(acme.find((e) => e.agent_id === "acme-q4-cmo-greg")).toBeUndefined();
    expect(acme.find((e) => e.agent_id === "acme-cmo-greg")).toBeDefined();

    const q4 = await listProjectAgents("acme-q4");
    expect(q4.find((e) => e.agent_id === "acme-cmo-greg")).toBeUndefined();
    expect(q4.find((e) => e.agent_id === "acme-q4-cmo-greg")).toBeDefined();
  });
});

describe("resolveAgentBySlug", () => {
  it("resolves a template URL slug (role-name shape) to its agent_id", async () => {
    fsState.missingDirs.add("/data/agents");
    // Template agents are pre-seeded with their default_name → the URL
    // slug is `<role>-<default_name>` for the placeholder entry.
    const r = await resolveAgentBySlug("acme", "google-ads-ana");
    expect(r).toEqual({
      agent_id: "acme-google-ads",
      name: "Ana",
      slug: "google-ads-ana",
      template_key: "google_ads",
    });
  });

  it("returns null for the bare role slug (the new shape is role-name)", async () => {
    fsState.missingDirs.add("/data/agents");
    const r = await resolveAgentBySlug("acme", "cmo");
    expect(r).toBeNull();
  });

  it("resolves a custom (non-template) agent by its meta slug", async () => {
    await writeAgentMeta(
      makeMeta({
        agent_id: "acme-supa-clone",
        slug: "supa-clone",
        name: "Supa Clone",
        template_key: undefined,
      }),
    );
    const r = await resolveAgentBySlug("acme", "supa-clone");
    expect(r).toEqual({
      agent_id: "acme-supa-clone",
      name: "Supa Clone",
      slug: "supa-clone",
      template_key: undefined,
    });
  });

  it("returns null when slug doesn't match any agent in the project", async () => {
    fsState.missingDirs.add("/data/agents");
    const r = await resolveAgentBySlug("acme", "nonexistent");
    expect(r).toBeNull();
  });
});
