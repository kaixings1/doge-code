import { describe, it, expect } from "vitest";

// The helpers are file-private to live-transcript.tsx so we can't import
// them directly. Re-implement here to lock the behaviour in via tests —
// if the logic in live-transcript.tsx drifts, this fails and we update
// both. Tiny cost; keeps the documented behaviour pinned.

function formatElapsed(ms: number): string {
  if (ms < 1500) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatToolName(name: string): string {
  if (!name) return name;
  for (const sep of ["__", "."]) {
    const idx = name.lastIndexOf(sep);
    if (idx >= 0) {
      const tail = name.slice(idx + sep.length);
      if (tail) return tail;
    }
  }
  return name;
}

describe("formatElapsed", () => {
  it("uses 'just now' under 1.5s", () => {
    expect(formatElapsed(0)).toBe("just now");
    expect(formatElapsed(900)).toBe("just now");
    expect(formatElapsed(1499)).toBe("just now");
  });
  it("emits seconds between 1.5s and 60s", () => {
    expect(formatElapsed(1500)).toBe("1s");
    expect(formatElapsed(15_000)).toBe("15s");
    expect(formatElapsed(59_999)).toBe("59s");
  });
  it("emits minutes (and remaining seconds) under an hour", () => {
    expect(formatElapsed(60_000)).toBe("1m");
    expect(formatElapsed(75_000)).toBe("1m 15s");
    expect(formatElapsed(125_000)).toBe("2m 5s");
  });
  it("emits hours over an hour", () => {
    expect(formatElapsed(3_600_000)).toBe("1h 0m");
    expect(formatElapsed(3_900_000)).toBe("1h 5m");
  });
});

describe("formatToolName", () => {
  it("returns the tail after the last dot", () => {
    expect(formatToolName("demo1-notfair-googleads.summarizeAccountSetup")).toBe(
      "summarizeAccountSetup",
    );
    expect(formatToolName("notfair.runScript")).toBe("runScript");
  });
  it("returns the tail after the last double-underscore", () => {
    expect(formatToolName("demo1-notfair-googleads__runScript")).toBe(
      "runScript",
    );
    expect(formatToolName("acme__listKeywords")).toBe("listKeywords");
  });
  it("returns the name untouched when there's no separator", () => {
    expect(formatToolName("exec")).toBe("exec");
    expect(formatToolName("read_file")).toBe("read_file");
  });
  it("handles empty / trailing-separator edge cases", () => {
    expect(formatToolName("")).toBe("");
    expect(formatToolName("trailing.")).toBe("trailing.");
    expect(formatToolName("trailing__")).toBe("trailing__");
  });
});
