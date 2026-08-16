import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _clearProbeCacheForTests,
  getCachedProbe,
  invalidateProbe,
  setCachedProbe,
} from "./probe-cache";
import type { McpRuntimeStatus } from "./state";

const connected: McpRuntimeStatus = {
  state: "connected",
  url: "https://example.com/mcp",
  tools_count: null,
  last_checked_at: "2026-06-01T00:00:00.000Z",
};

const unreachable: McpRuntimeStatus = {
  state: "unreachable",
  url: "https://example.com/mcp",
  error: "HTTP 500",
  last_checked_at: "2026-06-01T00:00:00.000Z",
};

const staleToken: McpRuntimeStatus = {
  state: "stale_token",
  url: "https://example.com/mcp",
  http_status: 401,
  last_checked_at: "2026-06-01T00:00:00.000Z",
};

beforeEach(() => {
  _clearProbeCacheForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  _clearProbeCacheForTests();
});

describe("probe-cache: TTL by state", () => {
  it("caches connected results for 60 seconds", () => {
    setCachedProbe("acme", "stripe", connected);
    expect(getCachedProbe("acme", "stripe")).toEqual(connected);

    vi.advanceTimersByTime(59_999);
    expect(getCachedProbe("acme", "stripe")).toEqual(connected);

    vi.advanceTimersByTime(2);
    expect(getCachedProbe("acme", "stripe")).toBeNull();
  });

  it("caches unreachable results for 10 seconds", () => {
    setCachedProbe("acme", "stripe", unreachable);
    expect(getCachedProbe("acme", "stripe")).toEqual(unreachable);

    vi.advanceTimersByTime(9_999);
    expect(getCachedProbe("acme", "stripe")).toEqual(unreachable);

    vi.advanceTimersByTime(2);
    expect(getCachedProbe("acme", "stripe")).toBeNull();
  });

  it("does not cache stale_token (immediate feedback after reconnect)", () => {
    setCachedProbe("acme", "stripe", staleToken);
    expect(getCachedProbe("acme", "stripe")).toBeNull();
  });

  it("does not cache not_configured", () => {
    setCachedProbe("acme", "stripe", { state: "not_configured" });
    expect(getCachedProbe("acme", "stripe")).toBeNull();
  });

  it("does not cache configured_no_token", () => {
    setCachedProbe("acme", "stripe", {
      state: "configured_no_token",
      url: "https://example.com/mcp",
    });
    expect(getCachedProbe("acme", "stripe")).toBeNull();
  });
});

describe("probe-cache: keying", () => {
  it("scopes entries by (project_slug, catalog_key)", () => {
    setCachedProbe("acme", "stripe", connected);
    expect(getCachedProbe("acme", "stripe")).toEqual(connected);
    expect(getCachedProbe("acme", "supabase")).toBeNull();
    expect(getCachedProbe("other-project", "stripe")).toBeNull();
  });
});

describe("probe-cache: replacement and invalidation", () => {
  it("clears a previously-cached connected entry when overwritten with a non-cacheable state", () => {
    setCachedProbe("acme", "stripe", connected);
    expect(getCachedProbe("acme", "stripe")).not.toBeNull();

    setCachedProbe("acme", "stripe", staleToken);
    expect(getCachedProbe("acme", "stripe")).toBeNull();
  });

  it("invalidateProbe drops the cached entry", () => {
    setCachedProbe("acme", "stripe", connected);
    invalidateProbe("acme", "stripe");
    expect(getCachedProbe("acme", "stripe")).toBeNull();
  });

  it("invalidateProbe on a missing entry is a no-op (no throw)", () => {
    expect(() => invalidateProbe("acme", "ghost")).not.toThrow();
  });

  it("overwriting a connected entry resets its TTL window", () => {
    setCachedProbe("acme", "stripe", connected);
    vi.advanceTimersByTime(50_000);
    // Refresh — the second write resets the 60s window.
    setCachedProbe("acme", "stripe", connected);
    vi.advanceTimersByTime(50_000);
    // 100s since the first write; 50s since the refresh — still valid.
    expect(getCachedProbe("acme", "stripe")).toEqual(connected);
  });
});

describe("probe-cache: read-time eviction", () => {
  it("removes expired entries on read so the next setCachedProbe starts clean", () => {
    setCachedProbe("acme", "stripe", connected);
    vi.advanceTimersByTime(120_000);
    expect(getCachedProbe("acme", "stripe")).toBeNull();
    // After eviction, a write with a non-cacheable state is still a clear-no-op.
    setCachedProbe("acme", "stripe", staleToken);
    expect(getCachedProbe("acme", "stripe")).toBeNull();
  });
});
