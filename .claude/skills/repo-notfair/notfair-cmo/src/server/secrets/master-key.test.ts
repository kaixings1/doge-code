import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadFreshMasterKey() {
  vi.resetModules();
  return await import("./master-key");
}

describe("getMasterKey", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("keytar");
  });

  it("returns existing key from keychain as a 32-byte Buffer", async () => {
    const existing = Buffer.alloc(32, 7).toString("base64");
    const getPassword = vi.fn().mockResolvedValueOnce(existing);
    const setPassword = vi.fn();
    vi.doMock("keytar", () => ({
      default: { getPassword, setPassword },
      getPassword,
      setPassword,
    }));

    const mod = await loadFreshMasterKey();
    const key = await mod.getMasterKey();

    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
    expect(key.equals(Buffer.alloc(32, 7))).toBe(true);
    expect(getPassword).toHaveBeenCalledWith("notfair-cmo", "master-key");
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("generates and persists a fresh 32-byte key when none stored", async () => {
    const getPassword = vi.fn().mockResolvedValueOnce(null);
    const setPassword = vi.fn().mockResolvedValueOnce(undefined);
    vi.doMock("keytar", () => ({
      default: { getPassword, setPassword },
      getPassword,
      setPassword,
    }));

    const mod = await loadFreshMasterKey();
    const key = await mod.getMasterKey();

    expect(key.length).toBe(32);
    expect(setPassword).toHaveBeenCalledTimes(1);
    const [service, account, stored] = setPassword.mock.calls[0]!;
    expect(service).toBe("notfair-cmo");
    expect(account).toBe("master-key");
    expect(typeof stored).toBe("string");
    const decoded = Buffer.from(stored as string, "base64");
    expect(decoded.length).toBe(32);
    expect(key.equals(decoded)).toBe(true);
  });

  it("caches the key across calls — only reads keychain once", async () => {
    const getPassword = vi
      .fn()
      .mockResolvedValueOnce(Buffer.alloc(32, 1).toString("base64"));
    const setPassword = vi.fn();
    vi.doMock("keytar", () => ({
      default: { getPassword, setPassword },
      getPassword,
      setPassword,
    }));

    const mod = await loadFreshMasterKey();
    const k1 = await mod.getMasterKey();
    const k2 = await mod.getMasterKey();

    expect(k1).toBe(k2);
    expect(getPassword).toHaveBeenCalledTimes(1);
  });

  it("throws when keytar import fails", async () => {
    vi.doMock("keytar", () => {
      throw new Error("module not installed");
    });

    const mod = await loadFreshMasterKey();
    await expect(mod.getMasterKey()).rejects.toThrow(
      /OS keychain \(keytar\) not available/,
    );
  });

  it("throws a follow-up error on subsequent calls after load failure", async () => {
    vi.doMock("keytar", () => {
      throw new Error("module not installed");
    });

    const mod = await loadFreshMasterKey();
    await expect(mod.getMasterKey()).rejects.toThrow(
      /OS keychain \(keytar\) not available/,
    );
    await expect(mod.getMasterKey()).rejects.toThrow(
      /Master key unavailable \(keytar not loadable\)/,
    );
  });

  it("uses the default export when keytar exposes one", async () => {
    const getPassword = vi
      .fn()
      .mockResolvedValueOnce(Buffer.alloc(32, 9).toString("base64"));
    const setPassword = vi.fn();
    vi.doMock("keytar", () => ({
      default: { getPassword, setPassword },
    }));

    const mod = await loadFreshMasterKey();
    const key = await mod.getMasterKey();
    expect(key.equals(Buffer.alloc(32, 9))).toBe(true);
    expect(getPassword).toHaveBeenCalledWith("notfair-cmo", "master-key");
  });

  it("falls back to namespace export when default is null", async () => {
    const getPassword = vi
      .fn()
      .mockResolvedValueOnce(Buffer.alloc(32, 3).toString("base64"));
    const setPassword = vi.fn();
    vi.doMock("keytar", () => ({
      default: null,
      getPassword,
      setPassword,
    }));

    const mod = await loadFreshMasterKey();
    const key = await mod.getMasterKey();
    expect(key.equals(Buffer.alloc(32, 3))).toBe(true);
    expect(getPassword).toHaveBeenCalledWith("notfair-cmo", "master-key");
  });
});
