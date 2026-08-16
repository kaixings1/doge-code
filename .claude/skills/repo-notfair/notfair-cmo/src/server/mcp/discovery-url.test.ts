import { describe, expect, it } from "vitest";

import { deriveDiscoveryUrl } from "./discovery-url";

describe("deriveDiscoveryUrl", () => {
  it("inserts the well-known suffix between origin and path", () => {
    expect(deriveDiscoveryUrl("https://notfair.co/api/mcp/google_ads")).toBe(
      "https://notfair.co/.well-known/oauth-protected-resource/api/mcp/google_ads",
    );
  });

  it("handles path-less origins (trailing /)", () => {
    expect(deriveDiscoveryUrl("https://mcp.stripe.com/")).toBe(
      "https://mcp.stripe.com/.well-known/oauth-protected-resource",
    );
  });

  it("handles bare origins (no path)", () => {
    expect(deriveDiscoveryUrl("https://mcp.stripe.com")).toBe(
      "https://mcp.stripe.com/.well-known/oauth-protected-resource",
    );
  });

  it("strips trailing slashes from the resource path", () => {
    expect(deriveDiscoveryUrl("https://example.com/api/v1/")).toBe(
      "https://example.com/.well-known/oauth-protected-resource/api/v1",
    );
  });

  it("strips multiple trailing slashes", () => {
    expect(deriveDiscoveryUrl("https://example.com/api///")).toBe(
      "https://example.com/.well-known/oauth-protected-resource/api",
    );
  });

  it("preserves non-default ports", () => {
    expect(deriveDiscoveryUrl("https://example.com:8443/mcp")).toBe(
      "https://example.com:8443/.well-known/oauth-protected-resource/mcp",
    );
  });

  it("accepts http origins (for local dev)", () => {
    expect(deriveDiscoveryUrl("http://localhost:3326/api/mcp")).toBe(
      "http://localhost:3326/.well-known/oauth-protected-resource/api/mcp",
    );
  });

  it("returns null for malformed URLs", () => {
    expect(deriveDiscoveryUrl("")).toBeNull();
    expect(deriveDiscoveryUrl("not a url")).toBeNull();
    expect(deriveDiscoveryUrl("/api/mcp")).toBeNull();
  });

  it("rejects non-http(s) schemes", () => {
    expect(deriveDiscoveryUrl("ftp://example.com/mcp")).toBeNull();
    expect(deriveDiscoveryUrl("file:///tmp/mcp")).toBeNull();
    expect(deriveDiscoveryUrl("javascript:alert(1)")).toBeNull();
  });
});
