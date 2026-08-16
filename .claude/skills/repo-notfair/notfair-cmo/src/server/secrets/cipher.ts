import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getMasterKey } from "./master-key";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Encrypt a plaintext string with AES-256-GCM using the project master key
 * (loaded from OS keychain). Output format: base64(iv | ciphertext | tag).
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

export async function decrypt(blob: string): Promise<string> {
  const key = await getMasterKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LEN + TAG_LEN) throw new Error("Encrypted blob is malformed");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
