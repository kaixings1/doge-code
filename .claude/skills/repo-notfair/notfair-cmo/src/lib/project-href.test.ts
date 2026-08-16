import { describe, it, expect } from "vitest";
import { projectHref, subPathFromPathname } from "./project-href";

describe("projectHref", () => {
  it("returns /:slug for empty path", () => {
    expect(projectHref("acme")).toBe("/acme");
    expect(projectHref("acme", "")).toBe("/acme");
    expect(projectHref("acme", "/")).toBe("/acme");
  });

  it("prefixes paths missing a leading slash", () => {
    expect(projectHref("acme", "agents/cmo")).toBe("/acme/agents/cmo");
  });

  it("prefixes paths with a leading slash", () => {
    expect(projectHref("acme", "/agents/cmo")).toBe("/acme/agents/cmo");
  });

  it("preserves nested segments and query strings verbatim", () => {
    expect(projectHref("acme", "/agents/cmo/chat/abc-123")).toBe(
      "/acme/agents/cmo/chat/abc-123",
    );
    expect(projectHref("acme", "/tasks?status=running")).toBe(
      "/acme/tasks?status=running",
    );
  });

  it("rejects an empty slug", () => {
    expect(() => projectHref("", "/agents")).toThrow();
  });

  it("works with hyphenated slugs", () => {
    expect(projectHref("my-cool-co", "/connections")).toBe(
      "/my-cool-co/connections",
    );
  });
});

describe("subPathFromPathname", () => {
  it("returns empty for the project home", () => {
    expect(subPathFromPathname("/acme", "acme")).toBe("");
  });

  it("strips the project slug from a nested path", () => {
    expect(subPathFromPathname("/acme/agents/cmo/tasks", "acme")).toBe(
      "/agents/cmo/tasks",
    );
    expect(subPathFromPathname("/acme/crons", "acme")).toBe("/crons");
  });

  it("returns empty when pathname is missing or doesn't match", () => {
    expect(subPathFromPathname(null, "acme")).toBe("");
    expect(subPathFromPathname(undefined, "acme")).toBe("");
    expect(subPathFromPathname("/onboarding", "acme")).toBe("");
    expect(subPathFromPathname("/other/agents", "acme")).toBe("");
  });

  it("returns empty when slug is missing", () => {
    expect(subPathFromPathname("/acme/agents", null)).toBe("");
    expect(subPathFromPathname("/acme/agents", "")).toBe("");
  });

  it("handles hyphenated slugs", () => {
    expect(
      subPathFromPathname("/my-cool-co/agents/cmo", "my-cool-co"),
    ).toBe("/agents/cmo");
  });

  it("does not strip when the slug is a partial prefix", () => {
    // "/acmeful/agents" shouldn't match slug "acme"
    expect(subPathFromPathname("/acmeful/agents", "acme")).toBe("");
  });

  it("supports round-tripping through projectHref", () => {
    const original = "/acme/agents/cmo/tasks";
    const sub = subPathFromPathname(original, "acme");
    expect(projectHref("zeta", sub)).toBe("/zeta/agents/cmo/tasks");
  });
});
