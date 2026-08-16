import { describe, expect, it, vi, beforeEach } from "vitest";

const findMcpTokenMock = vi.fn();
vi.mock("@/server/mcp/tokens", () => ({
  findMcpToken: (...args: unknown[]) => findMcpTokenMock(...args),
}));

const getMcpCatalogMock = vi.fn(() => [
  {
    key: "notfair-googleads",
    display_name: "NotFair Google Ads",
    description: "",
    resource_url: "https://notfair.co/api/mcp/google_ads",
    discovery_url: "",
    source: "preset" as const,
  },
  {
    key: "notfair-metaads",
    display_name: "NotFair Meta Ads",
    description: "",
    resource_url: "https://notfair.co/api/mcp/meta_ads",
    discovery_url: "",
    source: "preset" as const,
  },
]);
vi.mock("@/server/mcp-catalog", () => ({
  getMcpCatalog: (...args: unknown[]) => getMcpCatalogMock(...args),
}));

import { resolveAgentMcpBlocker } from "./agent-mcp-blocker";

beforeEach(() => {
  findMcpTokenMock.mockReset();
});

describe("resolveAgentMcpBlocker", () => {
  it("returns null when template_key is undefined (cloned/custom agent)", () => {
    expect(resolveAgentMcpBlocker("acme", undefined)).toBeNull();
    expect(findMcpTokenMock).not.toHaveBeenCalled();
  });

  it("returns null for CMO — no requires_mcp_key on the template", () => {
    expect(resolveAgentMcpBlocker("acme", "cmo")).toBeNull();
    expect(findMcpTokenMock).not.toHaveBeenCalled();
  });

  it("returns a blocker when Google Ads agent's MCP isn't connected", () => {
    findMcpTokenMock.mockReturnValue(null);
    const result = resolveAgentMcpBlocker("acme", "google_ads");
    expect(result).toEqual({
      mcp_key: "notfair-googleads",
      mcp_display_name: "NotFair Google Ads",
      agent_display_name: "Google Ads Specialist",
    });
    expect(findMcpTokenMock).toHaveBeenCalledWith("acme", "notfair-googleads");
  });

  it("returns a blocker for Meta Ads when the MCP isn't connected", () => {
    findMcpTokenMock.mockReturnValue(null);
    const result = resolveAgentMcpBlocker("acme", "meta_ads");
    expect(result).toEqual({
      mcp_key: "notfair-metaads",
      mcp_display_name: "NotFair Meta Ads",
      agent_display_name: "Meta Ads Specialist",
    });
  });

  it("returns null when the required MCP is connected (token row exists)", () => {
    findMcpTokenMock.mockReturnValue({
      id: "tok-1",
      project_slug: "acme",
      server_name: "notfair-googleads",
      access_token_enc: "secret",
    });
    expect(resolveAgentMcpBlocker("acme", "google_ads")).toBeNull();
  });

  it("falls back to the template display_name when the catalog has no matching entry", () => {
    getMcpCatalogMock.mockReturnValueOnce([]); // empty catalog this call
    findMcpTokenMock.mockReturnValue(null);
    const result = resolveAgentMcpBlocker("acme", "google_ads");
    expect(result?.mcp_display_name).toBe("Google Ads Specialist");
  });
});
