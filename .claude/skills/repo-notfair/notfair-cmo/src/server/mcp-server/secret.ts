import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Shared secret used to authenticate calls from OpenClaw-side agents into our
 * outbound-facing MCP server. Lives in a file with 0600 perms inside the
 * notfair-cmo data dir (NOT the project SQLite DB — keeping it in a small
 * dedicated file lets the file's own mode bits enforce single-user access
 * and lets the OpenClaw registration step read it with a one-liner).
 *
 * Single-user local CLI: we mint one secret per install and reuse it across
 * every project + every agent. No rotation in V1 — easy to add later by
 * deleting the file and re-running `notfair-cmo mcp register`.
 */

const DATA_DIR = process.env.NOTFAIR_CMO_DATA_DIR ?? join(homedir(), ".notfair-cmo");
const SECRET_PATH = join(DATA_DIR, "mcp-server-secret");

/** Read the secret, minting + persisting one the first time. */
export function getOrCreateMcpServerSecret(): string {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
  if (existsSync(SECRET_PATH)) {
    const value = readFileSync(SECRET_PATH, "utf8").trim();
    if (value) return value;
  }
  const minted = randomBytes(32).toString("hex");
  writeFileSync(SECRET_PATH, `${minted}\n`, { mode: 0o600 });
  return minted;
}

/**
 * Constant-time compare of a presented bearer against the stored secret.
 * Returns false rather than throwing when the input is malformed so callers
 * can map all unauth paths to 401 without special-casing exceptions.
 */
export function verifyMcpServerSecret(presented: string | null | undefined): boolean {
  if (!presented) return false;
  const expected = getOrCreateMcpServerSecret();
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(
    Buffer.from(presented, "utf8"),
    Buffer.from(expected, "utf8"),
  );
}

/** Where the secret lives on disk — surfaced for CLI registration helpers. */
export function getMcpServerSecretPath(): string {
  return SECRET_PATH;
}
