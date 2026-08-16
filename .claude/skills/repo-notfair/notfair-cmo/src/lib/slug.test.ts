import { describe, expect, it } from "vitest";
import { isValidSlug, slugify } from "./slug";

describe("slugify", () => {
  it("returns slug for a normal name", () => {
    const r = slugify("Acme Q4 launch");
    expect(r).toEqual({ ok: true, slug: "acme-q4-launch" });
  });

  it("collapses runs of whitespace and hyphens", () => {
    const r = slugify("  Acme   --   Q4  ");
    expect(r).toEqual({ ok: true, slug: "acme-q4" });
  });

  it("strips non-ascii characters", () => {
    const r = slugify("Café — naïve résumé");
    expect(r).toEqual({ ok: true, slug: "cafe-naive-resume" });
  });

  it("rejects empty input", () => {
    expect(slugify("")).toEqual({ ok: false, reason: "input is empty" });
    expect(slugify("   ")).toEqual({ ok: false, reason: "input is empty" });
  });

  it("rejects input with no valid characters", () => {
    const r = slugify("✨🔥");
    expect(r).toEqual({ ok: false, reason: "no valid characters" });
  });

  it("rejects reserved slugs", () => {
    const r = slugify("CMO");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/reserved/);
  });

  it("caps at maxLen and trims trailing hyphens after the cap", () => {
    const r = slugify("a".repeat(60), 10);
    expect(r).toEqual({ ok: true, slug: "aaaaaaaaaa" });
  });

  it("does not leave a trailing hyphen when cap falls mid-word", () => {
    const r = slugify("ab-cd-ef-gh", 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.slug).not.toMatch(/-$/);
  });
});

describe("isValidSlug", () => {
  it("accepts valid lowercase hyphenated slugs", () => {
    expect(isValidSlug("acme-q4")).toBe(true);
    expect(isValidSlug("acme")).toBe(true);
    expect(isValidSlug("a1b2c3")).toBe(true);
  });

  it("rejects uppercase, underscores, leading/trailing hyphens", () => {
    expect(isValidSlug("Acme")).toBe(false);
    expect(isValidSlug("acme_q4")).toBe(false);
    expect(isValidSlug("-acme")).toBe(false);
    expect(isValidSlug("acme-")).toBe(false);
  });

  it("rejects reserved slugs", () => {
    expect(isValidSlug("cmo")).toBe(false);
    expect(isValidSlug("api")).toBe(false);
    expect(isValidSlug("openclaw")).toBe(false);
  });
});
