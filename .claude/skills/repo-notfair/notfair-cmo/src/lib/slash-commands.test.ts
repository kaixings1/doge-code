import { describe, expect, it } from "vitest";
import {
  SLASH_COMMANDS,
  executeLocalSlashCommand,
  filterSlashCommands,
  findCommand,
  parseSlashMessage,
} from "./slash-commands";

describe("SLASH_COMMANDS catalog", () => {
  it("has unique command keys", () => {
    const keys = SLASH_COMMANDS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique command names", () => {
    const names = SLASH_COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("marks clear/new/stop/help as executeLocal", () => {
    for (const name of ["clear", "new", "stop", "help"]) {
      const cmd = findCommand(name);
      expect(cmd?.executeLocal).toBe(true);
    }
  });

  it("does not mark pass-through commands as executeLocal", () => {
    for (const name of ["status", "compact", "model", "think", "elevated"]) {
      const cmd = findCommand(name);
      expect(cmd?.executeLocal).toBeFalsy();
    }
  });
});

describe("filterSlashCommands", () => {
  it("returns all commands for empty query", () => {
    expect(filterSlashCommands("")).toEqual(SLASH_COMMANDS);
    expect(filterSlashCommands("   ")).toEqual(SLASH_COMMANDS);
  });

  it("returns all commands for a bare slash", () => {
    expect(filterSlashCommands("/")).toEqual(SLASH_COMMANDS);
  });

  it("prefix-matches with or without leading slash", () => {
    const a = filterSlashCommands("cl");
    const b = filterSlashCommands("/cl");
    expect(a).toEqual(b);
    expect(a.some((c) => c.name === "clear")).toBe(true);
  });

  it("is case-insensitive", () => {
    const lower = filterSlashCommands("CL");
    expect(lower.some((c) => c.name === "clear")).toBe(true);
  });

  it("falls back to substring match when no prefix hits", () => {
    // "mp" does not prefix any command name, but `compact` contains it,
    // so the substring fallback should surface it.
    const r = filterSlashCommands("mp");
    const names = r.map((c) => c.name);
    expect(names).toContain("compact");
    expect(names.every((n) => n.toLowerCase().startsWith("mp"))).toBe(false);
  });

  it("returns empty list when nothing matches", () => {
    expect(filterSlashCommands("zzzzzz")).toEqual([]);
  });

  it("prefers prefix matches over substring matches", () => {
    // "co" prefix-matches commands starting with co (`compact`, `commands`).
    // It should NOT fall back to substring, so e.g. `reasoning` (no "co") is
    // excluded — and the result must contain only prefix hits.
    const r = filterSlashCommands("co");
    expect(r.every((c) => c.name.toLowerCase().startsWith("co"))).toBe(true);
    expect(r.length).toBeGreaterThan(0);
  });
});

describe("parseSlashMessage", () => {
  it("returns null for plain text", () => {
    expect(parseSlashMessage("hello")).toBeNull();
    expect(parseSlashMessage("")).toBeNull();
  });

  it("returns null for whitespace-only", () => {
    expect(parseSlashMessage("   ")).toBeNull();
  });

  it("parses a bare slash command", () => {
    expect(parseSlashMessage("/clear")).toEqual({ command: "clear", args: "" });
  });

  it("parses a slash command with args", () => {
    expect(parseSlashMessage("/skill audit ads")).toEqual({
      command: "skill",
      args: "audit ads",
    });
  });

  it("trims trailing whitespace from args", () => {
    expect(parseSlashMessage("/model gpt-5   ")).toEqual({
      command: "model",
      args: "gpt-5",
    });
  });

  it("trims leading whitespace from the message", () => {
    expect(parseSlashMessage("   /help")).toEqual({ command: "help", args: "" });
  });

  it("treats a lone slash as an empty command", () => {
    expect(parseSlashMessage("/")).toEqual({ command: "", args: "" });
  });
});

describe("findCommand", () => {
  it("finds a known command by name", () => {
    const cmd = findCommand("status");
    expect(cmd).toBeDefined();
    expect(cmd?.key).toBe("status");
  });

  it("returns undefined for an unknown command", () => {
    expect(findCommand("nope")).toBeUndefined();
  });

  it("is case-sensitive on the canonical name", () => {
    expect(findCommand("CLEAR")).toBeUndefined();
  });
});

describe("executeLocalSlashCommand", () => {
  it("returns a clear action for /clear", () => {
    expect(executeLocalSlashCommand("clear")).toEqual({ kind: "clear" });
  });

  it("returns a new-session action for /new", () => {
    expect(executeLocalSlashCommand("new")).toEqual({ kind: "new-session" });
  });

  it("returns a stop action for /stop", () => {
    expect(executeLocalSlashCommand("stop")).toEqual({ kind: "stop" });
  });

  it("returns a help action with rendered markdown content", () => {
    const r = executeLocalSlashCommand("help");
    expect(r?.kind).toBe("help");
    if (r?.kind !== "help") return;
    expect(r.content).toContain("Available commands");
    expect(r.content).toContain("/clear");
    expect(r.content).toContain("/status");
    // Local commands marked, pass-through commands marked differently.
    expect(r.content).toContain("local");
    expect(r.content).toContain("sent to agent");
    // Commands that declare args render them.
    expect(r.content).toContain("/skill <name>");
  });

  it("returns null for a pass-through command", () => {
    expect(executeLocalSlashCommand("status")).toBeNull();
    expect(executeLocalSlashCommand("compact")).toBeNull();
  });

  it("returns null for an unknown command", () => {
    expect(executeLocalSlashCommand("nope")).toBeNull();
  });
});
