import { describe, expect, it } from "vitest";
import { colorForAgentSlug } from "./agent-colors";

describe("colorForAgentSlug", () => {
  it("returns the reserved blue palette for cmo", () => {
    const c = colorForAgentSlug("cmo");
    expect(c.dot).toBe("bg-blue-500");
    expect(c.chip).toContain("bg-blue-100");
    expect(c.label).toContain("text-blue-700");
  });

  it("returns the amber palette for google-ads (hyphenated slug)", () => {
    const c = colorForAgentSlug("google-ads");
    expect(c.dot).toBe("bg-amber-500");
    expect(c.chip).toContain("bg-amber-100");
    expect(c.label).toContain("text-amber-700");
  });

  it("returns the amber palette for google_ads (underscored key)", () => {
    const c = colorForAgentSlug("google_ads");
    expect(c.dot).toBe("bg-amber-500");
  });

  it("returns the emerald palette for seo", () => {
    const c = colorForAgentSlug("seo");
    expect(c.dot).toBe("bg-emerald-500");
    expect(c.label).toContain("text-emerald-700");
  });

  it("returns a non-template color for custom slugs", () => {
    const c = colorForAgentSlug("growth-engineer");
    // Custom slugs must never land on a template dot color (they would clash
    // with the reserved cmo/google_ads/seo legend swatches).
    expect(c.dot).not.toBe("bg-blue-500");
    expect(c.dot).not.toBe("bg-amber-500");
    expect(c.dot).not.toBe("bg-emerald-500");
  });

  it("maps the same custom slug to the same color across calls", () => {
    const a = colorForAgentSlug("growth-engineer");
    const b = colorForAgentSlug("growth-engineer");
    expect(a).toEqual(b);
  });

  it("returns a color from the extras palette for an empty slug", () => {
    const c = colorForAgentSlug("");
    const extraDots = [
      "bg-violet-500",
      "bg-rose-500",
      "bg-cyan-500",
      "bg-fuchsia-500",
      "bg-teal-500",
      "bg-orange-500",
      "bg-indigo-500",
      "bg-lime-500",
    ];
    expect(extraDots).toContain(c.dot);
  });

  it("returns chip/dot/label fields for every input", () => {
    for (const slug of ["cmo", "seo", "custom-1", "custom-2", "another"]) {
      const c = colorForAgentSlug(slug);
      expect(typeof c.chip).toBe("string");
      expect(typeof c.dot).toBe("string");
      expect(typeof c.label).toBe("string");
      expect(c.chip.length).toBeGreaterThan(0);
      expect(c.dot.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it("distributes different custom slugs across more than one extras bucket", () => {
    const dots = new Set<string>();
    for (const slug of [
      "alpha",
      "beta",
      "gamma",
      "delta",
      "epsilon",
      "zeta",
      "eta",
      "theta",
      "iota",
      "kappa",
      "lambda",
      "mu",
      "nu",
      "xi",
      "omicron",
      "pi",
    ]) {
      dots.add(colorForAgentSlug(slug).dot);
    }
    expect(dots.size).toBeGreaterThan(1);
  });
});
