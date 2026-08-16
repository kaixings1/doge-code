import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

const getMcpConfigMock = vi.fn();
const mcpRpcMock = vi.fn();
vi.mock("@/server/mcp/rpc", () => ({
  getMcpConfig: (...args: unknown[]) => getMcpConfigMock(...args),
  mcpRpc: (...args: unknown[]) => mcpRpcMock(...args),
  // The action wraps `mcpRpc` in an auto-refresh helper that resolves the
  // token from the DB; tests don't exercise refresh, so we route the
  // wrapper to the same underlying mock for simplicity.
  mcpRpcAutoRefresh: (...args: unknown[]) => mcpRpcMock(...args),
}));

const getProjectMock = vi.fn();
const setProjectGoogleAdsAccountMock = vi.fn();
const setProjectMetaAdsAccountMock = vi.fn();
const setProjectGscPropertyMock = vi.fn();
vi.mock("@/server/db/projects", () => ({
  getProject: (...args: unknown[]) => getProjectMock(...args),
  setProjectGoogleAdsAccount: (...args: unknown[]) =>
    setProjectGoogleAdsAccountMock(...args),
  setProjectMetaAdsAccount: (...args: unknown[]) =>
    setProjectMetaAdsAccountMock(...args),
  setProjectGscProperty: (...args: unknown[]) =>
    setProjectGscPropertyMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Dynamic imports inside setOnboardingAccountAction need mocks too — it
// auto-creates the CMO's onboarding task as the final step of the action.
const createTaskMock = vi.fn();
const listTasksMock = vi.fn<(slug: string) => unknown[]>(() => []);
vi.mock("@/server/db/tasks", () => ({
  createTask: (input: unknown) => {
    createTaskMock(input);
    return {
      id: "task-uuid",
      display_id: "acme-1",
      project_slug: "acme",
      agent_id: "acme-cmo-greg",
      title: "Audit the account and propose a starter playbook",
      brief: "...",
      success_criteria: null,
      deadline_iso: null,
      status: "proposed",
      result_json: null,
      error_message: null,
      thread_id: null,
      assigner_agent_id: null,
      created_at: "now",
      updated_at: "now",
    };
  },
  listTasks: (slug: string) => listTasksMock(slug),
}));
vi.mock("@/server/agent-templates", () => ({
  agentNameFor: (slug: string, key: string, name: string) =>
    `${slug}-${key.replace(/_/g, "-")}-${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}`,
  agentUrlSlug: (key: string, name: string) =>
    `${key.replace(/_/g, "-")}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  TEMPLATES: [
    { key: "cmo", default_name: "Greg" },
    { key: "google_ads", default_name: "Ana" },
    { key: "seo", default_name: "Sam" },
  ],
}));

// setOnboardingAccountAction resolves the CMO via listProjectAgents now —
// agent_ids encode the personal name, so it can't be synthesized.
vi.mock("@/server/agent-meta", () => ({
  readAgentMeta: () => null,
  listProjectAgents: async () => [
    {
      agent_id: "acme-cmo-greg",
      slug: "cmo-greg",
      name: "Greg",
      template_key: "cmo",
      is_template_default: true,
    },
  ],
}));

import {
  listGoogleAdsAccounts,
  setOnboardingAccountAction,
  listMetaAdsAccounts,
  setOnboardingMetaAdsAccountAction,
  listGscProperties,
  setOnboardingGscPropertyAction,
} from "./accounts";

// ── Fixtures ───────────────────────────────────────────────────────

const ACCOUNTS_PAYLOAD = {
  accounts: [
    { id: "7384288909", name: "IOW" },
    { id: "7521406707", name: "PawsVIP" },
    { id: "1301265570", name: "InOtherWord.ai" },
    { id: "7073485715", name: "BulkGPT.ai" },
    { id: "3251706605", name: "NotFair" },
  ],
  defaultAccountId: "3251706605",
  totalAccounts: 5,
};

function toolCallResult(payload: unknown): {
  ok: true;
  result: { content: Array<{ type: string; text: string }>; isError: boolean };
} {
  return {
    ok: true,
    result: {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      isError: false,
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("listGoogleAdsAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMcpConfigMock.mockReturnValue({
      url: "https://notfair.co/api/mcp/google_ads",
      token: "tok",
    });
  });

  it("returns accounts + default_account_id on the real Demo2 shape", async () => {
    mcpRpcMock.mockResolvedValueOnce(toolCallResult(ACCOUNTS_PAYLOAD));
    const r = await listGoogleAdsAccounts("acme");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accounts).toHaveLength(5);
      expect(r.accounts[0]).toEqual({ id: "7384288909", name: "IOW" });
      expect(r.default_account_id).toBe("3251706605");
    }
  });

  it("falls back to id when name is empty", async () => {
    mcpRpcMock.mockResolvedValueOnce(
      toolCallResult({ accounts: [{ id: "123" }], defaultAccountId: null }),
    );
    const r = await listGoogleAdsAccounts("acme");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accounts[0]).toEqual({ id: "123", name: "123" });
    }
  });

  it("returns mcp_not_configured when getMcpConfig returns null", async () => {
    getMcpConfigMock.mockReturnValueOnce(null);
    const r = await listGoogleAdsAccounts("acme");
    expect(r).toMatchObject({ ok: false, kind: "mcp_not_configured" });
    expect(mcpRpcMock).not.toHaveBeenCalled();
  });

  it("returns rpc error when mcpRpc fails", async () => {
    mcpRpcMock.mockResolvedValueOnce({
      ok: false,
      kind: "http_error",
      status: 401,
    });
    const r = await listGoogleAdsAccounts("acme");
    expect(r).toMatchObject({ ok: false, kind: "rpc" });
  });

  it("returns shape error when payload is missing accounts array", async () => {
    mcpRpcMock.mockResolvedValueOnce(toolCallResult({ totalAccounts: 0 }));
    const r = await listGoogleAdsAccounts("acme");
    expect(r).toMatchObject({ ok: false, kind: "shape" });
  });

  it("returns shape error when JSON is malformed", async () => {
    mcpRpcMock.mockResolvedValueOnce({
      ok: true,
      result: {
        content: [{ type: "text", text: "not json" }],
        isError: false,
      },
    });
    const r = await listGoogleAdsAccounts("acme");
    expect(r).toMatchObject({ ok: false, kind: "shape" });
  });
});

describe("setOnboardingAccountAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMcpConfigMock.mockReturnValue({
      url: "https://notfair.co/api/mcp/google_ads",
      token: "tok",
    });
    getProjectMock.mockReturnValue({
      id: "uuid",
      slug: "acme",
      display_name: "Acme",
      created_at: "now",
      archived_at: null,
      google_ads_account_id: null,
    });
    setProjectGoogleAdsAccountMock.mockReturnValue({
      id: "uuid",
      slug: "acme",
      display_name: "Acme",
      created_at: "now",
      archived_at: null,
      google_ads_account_id: "3251706605",
    });
    mcpRpcMock.mockResolvedValue(toolCallResult(ACCOUNTS_PAYLOAD));
  });

  it("persists the selection when account is in the bearer's list", async () => {
    const r = await setOnboardingAccountAction("acme", "3251706605");
    expect(r.ok).toBe(true);
    expect(setProjectGoogleAdsAccountMock).toHaveBeenCalledWith(
      "acme",
      "3251706605",
    );
  });

  it("mints the CMO onboarding task and returns its display_id for the redirect", async () => {
    const r = await setOnboardingAccountAction("acme", "3251706605");
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Caller redirects to /agents/cmo/tasks?task=<this>.
      expect(r.task_display_id).toBe("acme-1");
    }
    expect(createTaskMock).toHaveBeenCalledTimes(1);
    expect(createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        project_slug: "acme",
        agent_id: "acme-cmo-greg",
        status: "proposed",
        title: expect.stringContaining("Audit"),
        brief: expect.stringContaining("3251706605"),
      }),
    );
  });

  it("does NOT double-create the task when a prior audit task already exists", async () => {
    listTasksMock.mockReturnValueOnce([
      {
        id: "prior-uuid",
        display_id: "acme-7",
        project_slug: "acme",
        agent_id: "acme-cmo-greg",
        title: "Audit the account and propose a starter playbook",
        status: "working",
      },
    ]);
    const r = await setOnboardingAccountAction("acme", "3251706605");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task_display_id).toBe("acme-7");
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("rejects an account id NOT in the bearer's list (tamper defense)", async () => {
    const r = await setOnboardingAccountAction("acme", "9999999999");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/isn't in this bearer/i);
    expect(setProjectGoogleAdsAccountMock).not.toHaveBeenCalled();
  });

  it("rejects when project doesn't exist", async () => {
    getProjectMock.mockReturnValueOnce(null);
    const r = await setOnboardingAccountAction("missing", "3251706605");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found/i);
    expect(mcpRpcMock).not.toHaveBeenCalled();
  });

  it("rejects on empty slug or account id", async () => {
    const r1 = await setOnboardingAccountAction("", "3251706605");
    expect(r1.ok).toBe(false);
    const r2 = await setOnboardingAccountAction("acme", "");
    expect(r2.ok).toBe(false);
  });

  it("surfaces MCP errors when listing accounts fails during validation", async () => {
    mcpRpcMock.mockResolvedValueOnce({
      ok: false,
      kind: "http_error",
      status: 500,
    });
    const r = await setOnboardingAccountAction("acme", "3251706605");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/couldn't verify/i);
    expect(setProjectGoogleAdsAccountMock).not.toHaveBeenCalled();
  });
});

// ── Meta Ads ───────────────────────────────────────────────────────

describe("listMetaAdsAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMcpConfigMock.mockReturnValue({
      url: "https://notfair.co/api/mcp/meta_ads",
      token: "tok",
    });
  });

  it("parses the Meta Graph `data` array shape (id + name)", async () => {
    mcpRpcMock.mockResolvedValueOnce(
      toolCallResult({
        data: [
          { id: "act_111", name: "Brand A" },
          { id: "act_222", name: "Brand B" },
        ],
      }),
    );
    const r = await listMetaAdsAccounts("acme");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accounts).toEqual([
        { id: "act_111", name: "Brand A" },
        { id: "act_222", name: "Brand B" },
      ]);
      expect(r.default_account_id).toBeNull();
    }
  });

  it("returns shape error when neither `data` nor `accounts` is present", async () => {
    mcpRpcMock.mockResolvedValueOnce(toolCallResult({ foo: "bar" }));
    const r = await listMetaAdsAccounts("acme");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("shape");
  });

  it("returns mcp_not_configured when no token row exists for the project", async () => {
    getMcpConfigMock.mockReturnValueOnce(null);
    const r = await listMetaAdsAccounts("acme");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("mcp_not_configured");
  });
});

describe("setOnboardingMetaAdsAccountAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectMock.mockReturnValue({
      id: "p-1",
      slug: "acme",
      display_name: "Acme",
    });
    getMcpConfigMock.mockReturnValue({
      url: "https://notfair.co/api/mcp/meta_ads",
      token: "tok",
    });
  });

  it("persists the chosen ad-account when it's in the bearer's list", async () => {
    mcpRpcMock.mockResolvedValueOnce(
      toolCallResult({
        data: [
          { id: "act_111", name: "Brand A" },
          { id: "act_222", name: "Brand B" },
        ],
      }),
    );
    setProjectMetaAdsAccountMock.mockReturnValue({
      slug: "acme",
      meta_ads_account_id: "act_222",
    });
    const r = await setOnboardingMetaAdsAccountAction("acme", "act_222");
    expect(r.ok).toBe(true);
    expect(setProjectMetaAdsAccountMock).toHaveBeenCalledWith("acme", "act_222");
  });

  it("rejects when the account isn't in the bearer's list (tamper defense)", async () => {
    mcpRpcMock.mockResolvedValueOnce(
      toolCallResult({ data: [{ id: "act_111", name: "Brand A" }] }),
    );
    const r = await setOnboardingMetaAdsAccountAction("acme", "act_evil");
    expect(r.ok).toBe(false);
    expect(setProjectMetaAdsAccountMock).not.toHaveBeenCalled();
  });
});

// ── GSC ────────────────────────────────────────────────────────────

describe("listGscProperties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMcpConfigMock.mockReturnValue({
      url: "https://notfair.co/api/mcp/google_search_console",
      token: "tok",
    });
  });

  it("parses the bare-array shape the actual notfair MCP returns", async () => {
    mcpRpcMock.mockResolvedValueOnce(
      toolCallResult([
        { siteUrl: "sc-domain:notfair.co", permissionLevel: "siteFullUser" },
        { siteUrl: "https://example.com/", permissionLevel: "siteOwner" },
      ]),
    );
    const r = await listGscProperties("acme");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.properties.map((p) => p.id)).toEqual([
        "sc-domain:notfair.co",
        "https://example.com/",
      ]);
      expect(r.properties[0]!.name).toBe("notfair.co");
      expect(r.properties[1]!.name).toBe("example.com");
      expect(r.properties[0]!.permission).toBe("siteFullUser");
    }
  });

  it("parses the Search Console `siteEntry` shape", async () => {
    mcpRpcMock.mockResolvedValueOnce(
      toolCallResult({
        siteEntry: [
          {
            siteUrl: "https://notfair.co/",
            permissionLevel: "siteOwner",
          },
          { siteUrl: "sc-domain:notfair.co", permissionLevel: "siteFullUser" },
        ],
      }),
    );
    const r = await listGscProperties("acme");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.properties.map((p) => p.id)).toEqual([
        "https://notfair.co/",
        "sc-domain:notfair.co",
      ]);
      // prettyGscName strips scheme + sc-domain prefix.
      expect(r.properties[0]!.name).toBe("notfair.co");
      expect(r.properties[1]!.name).toBe("notfair.co");
      expect(r.properties[0]!.permission).toBe("siteOwner");
    }
  });

  it("returns shape error when neither siteEntry nor sites is present", async () => {
    mcpRpcMock.mockResolvedValueOnce(toolCallResult({ foo: "bar" }));
    const r = await listGscProperties("acme");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("shape");
  });
});

describe("setOnboardingGscPropertyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectMock.mockReturnValue({
      id: "p-1",
      slug: "acme",
      display_name: "Acme",
    });
    getMcpConfigMock.mockReturnValue({
      url: "https://notfair.co/api/mcp/google_search_console",
      token: "tok",
    });
  });

  it("persists the chosen property when it's in the bearer's list", async () => {
    mcpRpcMock.mockResolvedValueOnce(
      toolCallResult({
        siteEntry: [{ siteUrl: "sc-domain:notfair.co", permissionLevel: "siteOwner" }],
      }),
    );
    setProjectGscPropertyMock.mockReturnValue({
      slug: "acme",
      gsc_property_id: "sc-domain:notfair.co",
    });
    const r = await setOnboardingGscPropertyAction("acme", "sc-domain:notfair.co");
    expect(r.ok).toBe(true);
    expect(setProjectGscPropertyMock).toHaveBeenCalledWith(
      "acme",
      "sc-domain:notfair.co",
    );
  });

  it("rejects when the property isn't in the bearer's list", async () => {
    mcpRpcMock.mockResolvedValueOnce(
      toolCallResult({
        siteEntry: [{ siteUrl: "https://other.example/", permissionLevel: "siteUser" }],
      }),
    );
    const r = await setOnboardingGscPropertyAction("acme", "sc-domain:evil.com");
    expect(r.ok).toBe(false);
    expect(setProjectGscPropertyMock).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
