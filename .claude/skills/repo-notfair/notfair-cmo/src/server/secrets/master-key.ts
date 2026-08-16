import { randomBytes } from "node:crypto";

const KEYTAR_SERVICE = "notfair-cmo";
const KEYTAR_ACCOUNT = "master-key";

type Keytar = {
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
};

let cachedKey: Buffer | null = null;
let loadAttempted = false;

async function loadKeytar(): Promise<Keytar | null> {
  try {
    const mod = (await import("keytar")) as unknown as { default?: Keytar } & Keytar;
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

/**
 * Get or create the project's master encryption key.
 * Returns a 32-byte (256-bit) Buffer suitable for AES-256-GCM.
 *
 * V1: stored in OS keychain via keytar. If keytar is unavailable, throws.
 * Future: file-based fallback with prompt-based password unlock.
 */
export async function getMasterKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;
  if (loadAttempted) throw new Error("Master key unavailable (keytar not loadable)");
  loadAttempted = true;

  const keytar = await loadKeytar();
  if (!keytar) {
    throw new Error(
      "OS keychain (keytar) not available on this platform. OAuth credentials cannot be stored securely.",
    );
  }

  let stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  if (!stored) {
    const fresh = randomBytes(32).toString("base64");
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, fresh);
    stored = fresh;
  }
  cachedKey = Buffer.from(stored, "base64");
  return cachedKey;
}
