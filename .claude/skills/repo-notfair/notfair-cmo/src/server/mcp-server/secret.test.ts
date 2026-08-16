import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type SecretModule = typeof import("./secret");

async function loadSecret(): Promise<SecretModule> {
  return (await import("./secret")) as SecretModule;
}

let tmpDir: string;

beforeEach(() => {
  vi.resetModules();
  tmpDir = mkdtempSync(join(tmpdir(), "notfair-cmo-secret-"));
  process.env.NOTFAIR_CMO_DATA_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.NOTFAIR_CMO_DATA_DIR;
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe("getOrCreateMcpServerSecret", () => {
  it("mints + persists a 64-char hex secret on first call", async () => {
    const { getOrCreateMcpServerSecret, getMcpServerSecretPath } = await loadSecret();
    const s = getOrCreateMcpServerSecret();
    expect(s).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(getMcpServerSecretPath())).toBe(true);
    const onDisk = readFileSync(getMcpServerSecretPath(), "utf8").trim();
    expect(onDisk).toBe(s);
  });

  it("returns the same secret on subsequent calls (in-process and after reload)", async () => {
    const { getOrCreateMcpServerSecret } = await loadSecret();
    const first = getOrCreateMcpServerSecret();
    const second = getOrCreateMcpServerSecret();
    expect(second).toBe(first);
    // Simulate process restart by re-importing.
    vi.resetModules();
    const reloaded = await loadSecret();
    expect(reloaded.getOrCreateMcpServerSecret()).toBe(first);
  });

  it("writes the secret file with 0600 perms (POSIX only)", async () => {
    if (process.platform === "win32") return;
    const { getOrCreateMcpServerSecret, getMcpServerSecretPath } = await loadSecret();
    getOrCreateMcpServerSecret();
    const mode = statSync(getMcpServerSecretPath()).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe("verifyMcpServerSecret", () => {
  it("returns true for the stored secret", async () => {
    const { getOrCreateMcpServerSecret, verifyMcpServerSecret } = await loadSecret();
    const s = getOrCreateMcpServerSecret();
    expect(verifyMcpServerSecret(s)).toBe(true);
  });

  it("returns false for a wrong-but-same-length value", async () => {
    const { getOrCreateMcpServerSecret, verifyMcpServerSecret } = await loadSecret();
    const s = getOrCreateMcpServerSecret();
    const wrong = "0".repeat(s.length);
    expect(verifyMcpServerSecret(wrong)).toBe(false);
  });

  it("returns false for mismatched length (avoids timingSafeEqual throw)", async () => {
    const { verifyMcpServerSecret } = await loadSecret();
    expect(verifyMcpServerSecret("short")).toBe(false);
  });

  it("returns false for null/undefined/empty", async () => {
    const { verifyMcpServerSecret } = await loadSecret();
    expect(verifyMcpServerSecret(null)).toBe(false);
    expect(verifyMcpServerSecret(undefined)).toBe(false);
    expect(verifyMcpServerSecret("")).toBe(false);
  });
});
