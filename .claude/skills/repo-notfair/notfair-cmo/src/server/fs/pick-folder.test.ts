import { describe, expect, it, vi, beforeEach } from "vitest";

// child_process.execFile lives behind a barrier — mock it before importing
// the module under test so we exercise the parsing branches without
// actually opening a real Finder dialog during CI.
const execFileMock = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

// Force platform=darwin for the macOS branch test. The unsupported-platform
// branch is exercised by overriding the mock in-test.
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    platform: vi.fn(() => "darwin"),
  };
});

import { pickFolder } from "./pick-folder";
import * as os from "node:os";

beforeEach(() => {
  execFileMock.mockReset();
  (os.platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("darwin");
});

describe("pickFolder (darwin)", () => {
  it("returns the chosen path with the trailing slash stripped", async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      cb(null, "/Users/yuting/Workspace/acme/\n", "");
      return { } as unknown;
    });
    const r = await pickFolder({ prompt: "Pick a folder" });
    expect(r).toEqual({ ok: true, path: "/Users/yuting/Workspace/acme" });
  });

  it("reports cancelled when the AppleScript returns the cancel sentinel", async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      cb(null, "__USER_CANCELLED__\n", "");
      return { } as unknown;
    });
    const r = await pickFolder({});
    expect(r).toEqual({ ok: false, kind: "cancelled" });
  });

  it("reports cancelled on empty stdout", async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      cb(null, "", "");
      return { } as unknown;
    });
    const r = await pickFolder({});
    expect(r).toEqual({ ok: false, kind: "cancelled" });
  });

  it("surfaces stderr when osascript exits non-zero", async () => {
    execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
      const err: NodeJS.ErrnoException = new Error("boom");
      err.code = 1 as unknown as string;
      cb(err, "", "some applescript error\n");
      return { } as unknown;
    });
    const r = await pickFolder({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.message).toContain("some applescript error");
    }
  });

  it("escapes prompt double-quotes so they can't break the AppleScript string", async () => {
    let captured: string | undefined;
    execFileMock.mockImplementation((_bin, args: string[], _opts, cb) => {
      captured = args[1]; // ["-e", "<script>"]
      cb(null, "/tmp/\n", "");
      return { } as unknown;
    });
    await pickFolder({ prompt: 'Quote " inside' });
    expect(captured).toContain('Quote \\" inside');
  });
});

describe("pickFolder (other platforms)", () => {
  it("returns unsupported on linux", async () => {
    (os.platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("linux");
    const r = await pickFolder({});
    expect(r).toEqual({ ok: false, kind: "unsupported", platform: "linux" });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("returns unsupported on win32", async () => {
    (os.platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      "win32",
    );
    const r = await pickFolder({});
    expect(r).toEqual({ ok: false, kind: "unsupported", platform: "win32" });
  });
});
