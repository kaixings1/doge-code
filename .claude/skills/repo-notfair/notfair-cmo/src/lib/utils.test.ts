import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins simple class strings", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("returns an empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("filters out falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("supports conditional object syntax via clsx", () => {
    expect(cn("a", { b: true, c: false, d: true })).toBe("a b d");
  });

  it("supports nested arrays via clsx", () => {
    expect(cn(["a", ["b", "c"]], "d")).toBe("a b c d");
  });

  it("dedupes conflicting tailwind utilities via twMerge (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });

  it("keeps non-conflicting tailwind utilities", () => {
    expect(cn("p-2", "text-sm")).toBe("p-2 text-sm");
  });

  it("merges variant prefixes correctly", () => {
    // sm:p-2 and p-4 are different variants → both kept.
    expect(cn("sm:p-2", "p-4")).toBe("sm:p-2 p-4");
    // Same variant → last wins.
    expect(cn("sm:p-2", "sm:p-4")).toBe("sm:p-4");
  });

  it("handles a mix of conditional + tailwind merge inputs", () => {
    expect(cn("p-2", { "p-4": true }, ["text-sm", { "text-lg": false }]))
      .toBe("p-4 text-sm");
  });
});
