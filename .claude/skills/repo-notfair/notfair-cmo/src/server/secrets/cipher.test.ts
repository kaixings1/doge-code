import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY_A = Buffer.alloc(32, 0xab);
const KEY_B = Buffer.alloc(32, 0xcd);

const getMasterKeyMock = vi.fn();

vi.mock("./master-key", () => ({
  getMasterKey: () => getMasterKeyMock(),
}));

import { decrypt, encrypt } from "./cipher";

describe("cipher", () => {
  beforeEach(() => {
    getMasterKeyMock.mockReset();
    getMasterKeyMock.mockResolvedValue(KEY_A);
  });

  describe("encrypt", () => {
    it("returns a base64 string distinct from plaintext", async () => {
      const out = await encrypt("hello world");
      expect(typeof out).toBe("string");
      expect(out).not.toContain("hello world");
      const buf = Buffer.from(out, "base64");
      // 12-byte IV + ciphertext("hello world" = 11 bytes) + 16-byte tag
      expect(buf.length).toBe(12 + 11 + 16);
    });

    it("produces different output for the same plaintext on each call (random IV)", async () => {
      const a = await encrypt("same input");
      const b = await encrypt("same input");
      expect(a).not.toBe(b);
    });

    it("handles empty string plaintext", async () => {
      const out = await encrypt("");
      const buf = Buffer.from(out, "base64");
      expect(buf.length).toBe(12 + 0 + 16);
      const round = await decrypt(out);
      expect(round).toBe("");
    });

    it("handles unicode plaintext", async () => {
      const text = "héllo 世界 🚀";
      const out = await encrypt(text);
      const round = await decrypt(out);
      expect(round).toBe(text);
    });
  });

  describe("decrypt — round trip", () => {
    it("round-trips plaintext through encrypt → decrypt", async () => {
      const text = "the quick brown fox jumps over the lazy dog";
      const blob = await encrypt(text);
      const round = await decrypt(blob);
      expect(round).toBe(text);
    });

    it("round-trips longer plaintext", async () => {
      const text = "x".repeat(10_000);
      const blob = await encrypt(text);
      const round = await decrypt(blob);
      expect(round).toBe(text);
    });
  });

  describe("decrypt — failure modes", () => {
    it("throws on a blob shorter than IV + tag", async () => {
      const tooShort = Buffer.alloc(12 + 16 - 1).toString("base64");
      await expect(decrypt(tooShort)).rejects.toThrow(/malformed/);
    });

    it("throws on an empty blob", async () => {
      await expect(decrypt("")).rejects.toThrow(/malformed/);
    });

    it("throws when decrypting with the wrong key", async () => {
      const blob = await encrypt("secret payload");
      getMasterKeyMock.mockResolvedValue(KEY_B);
      await expect(decrypt(blob)).rejects.toThrow();
    });

    it("throws when the auth tag has been tampered with", async () => {
      const blob = await encrypt("secret payload");
      const buf = Buffer.from(blob, "base64");
      // Flip a bit in the tag (last 16 bytes).
      buf[buf.length - 1] = buf[buf.length - 1]! ^ 0x01;
      const tampered = buf.toString("base64");
      await expect(decrypt(tampered)).rejects.toThrow();
    });

    it("throws when the ciphertext has been tampered with", async () => {
      const blob = await encrypt("secret payload");
      const buf = Buffer.from(blob, "base64");
      // Flip a bit somewhere in the ciphertext region (after IV, before tag).
      const idx = 12 + 2;
      buf[idx] = buf[idx]! ^ 0x01;
      const tampered = buf.toString("base64");
      await expect(decrypt(tampered)).rejects.toThrow();
    });

    it("throws when the IV has been tampered with", async () => {
      const blob = await encrypt("secret payload");
      const buf = Buffer.from(blob, "base64");
      buf[0] = buf[0]! ^ 0x01;
      const tampered = buf.toString("base64");
      await expect(decrypt(tampered)).rejects.toThrow();
    });
  });
});
