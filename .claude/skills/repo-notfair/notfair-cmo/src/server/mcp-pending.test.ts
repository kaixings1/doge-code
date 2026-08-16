import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumePending,
  setPending,
  type PendingMcpFlow,
} from "./mcp-pending";

function makeFlow(overrides: Partial<PendingMcpFlow> = {}): PendingMcpFlow {
  return {
    catalog_key: "notfair-googleads",
    stored_key: "acme-notfair-googleads",
    display_name: "NotFair Google Ads",
    resource_url: "https://notfair.co/api/mcp/google_ads",
    issuer: "https://issuer.example",
    token_endpoint: "https://issuer.example/token",
    client_id: "client-abc",
    client_secret: "secret-xyz",
    code_verifier: "verifier-123",
    redirect_uri: "http://localhost:3326/callback",
    project_slug: "acme",
    return_to: "/chat",
    created_at: Date.now(),
    ...overrides,
  };
}

// Each test starts from a clean store — drain any leftovers from prior tests
// (the store hangs off globalThis, so state survives across files).
function drain() {
  // setPending+consumePending is the only public surface; we use a unique
  // sentinel state and then drain by reading globalThis directly to flush.
  type Slot = { store?: Map<string, unknown> };
  const slot = globalThis as unknown as Slot;
  slot.store?.clear();
}

describe("setPending / consumePending", () => {
  beforeEach(() => {
    drain();
    vi.useRealTimers();
  });

  afterEach(() => {
    drain();
  });

  it("stores a flow and returns it once on consume", () => {
    const flow = makeFlow();
    setPending("state-1", flow);
    expect(consumePending("state-1")).toEqual(flow);
  });

  it("a second consume returns null (pop semantics, not peek)", () => {
    setPending("state-2", makeFlow());
    consumePending("state-2");
    expect(consumePending("state-2")).toBeNull();
  });

  it("returns null for an unknown state", () => {
    expect(consumePending("never-set")).toBeNull();
  });

  it("isolates two different state keys", () => {
    const f1 = makeFlow({ project_slug: "acme" });
    const f2 = makeFlow({ project_slug: "globex" });
    setPending("s1", f1);
    setPending("s2", f2);
    expect(consumePending("s1")).toEqual(f1);
    expect(consumePending("s2")).toEqual(f2);
  });

  it("overwrites an existing flow when the same state is set twice", () => {
    setPending("dup", makeFlow({ project_slug: "first" }));
    setPending("dup", makeFlow({ project_slug: "second" }));
    const r = consumePending("dup");
    expect(r?.project_slug).toBe("second");
  });

  it("supports a flow without optional client_secret + return_to", () => {
    const minimal: PendingMcpFlow = {
      catalog_key: "notfair-googleads",
      stored_key: "acme-notfair-googleads",
      display_name: "NotFair Google Ads",
      resource_url: "https://notfair.co/api/mcp/google_ads",
      issuer: "https://issuer.example",
      token_endpoint: "https://issuer.example/token",
      client_id: "public-client",
      code_verifier: "v",
      redirect_uri: "http://localhost:3326/cb",
      project_slug: "acme",
      created_at: Date.now(),
    };
    setPending("public", minimal);
    expect(consumePending("public")).toEqual(minimal);
  });
});

describe("TTL eviction", () => {
  beforeEach(() => {
    drain();
  });

  afterEach(() => {
    drain();
  });

  it("evicts entries older than the 10-minute TTL on setPending", () => {
    // Flow created 11 minutes ago — older than TTL.
    const oldFlow = makeFlow({ created_at: Date.now() - 11 * 60 * 1000 });
    setPending("stale", oldFlow);
    // Touch via a fresh set call — eviction runs at the top of setPending too.
    setPending("fresh", makeFlow());
    expect(consumePending("stale")).toBeNull();
    expect(consumePending("fresh")).not.toBeNull();
  });

  it("evicts entries older than the 10-minute TTL on consumePending", () => {
    const stale = makeFlow({ created_at: Date.now() - 11 * 60 * 1000 });
    setPending("evict-me", stale);
    // consume itself should evict before the lookup.
    expect(consumePending("evict-me")).toBeNull();
  });

  it("keeps entries newer than TTL — exactly-9-minute-old flow survives", () => {
    const recent = makeFlow({ created_at: Date.now() - 9 * 60 * 1000 });
    setPending("recent", recent);
    expect(consumePending("recent")).toEqual(recent);
  });
});
