import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { encrypt, decrypt } from "@/server/secrets/cipher";
import type { OAuthProvider, OAuthToken } from "@/types";

export type StoreTokenInput = {
  project_slug: string;
  provider: OAuthProvider;
  account_label: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
};

export async function storeOAuthToken(input: StoreTokenInput): Promise<OAuthToken> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  const access_token_enc = await encrypt(input.access_token);
  const refresh_token_enc = await encrypt(input.refresh_token);

  db.prepare(
    `INSERT INTO oauth_tokens
       (id, project_slug, provider, account_label, access_token_enc, refresh_token_enc, expires_at, scope, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_slug, provider, account_label) DO UPDATE SET
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc,
       expires_at = excluded.expires_at,
       scope = excluded.scope,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    input.project_slug,
    input.provider,
    input.account_label,
    access_token_enc,
    refresh_token_enc,
    input.expires_at,
    input.scope,
    now,
    now,
  );

  return getOAuthTokenRecord(input.project_slug, input.provider, input.account_label)!;
}

export function listOAuthTokens(project_slug: string): OAuthToken[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM oauth_tokens WHERE project_slug = ? ORDER BY provider, account_label")
    .all(project_slug) as OAuthToken[];
}

export function getOAuthTokenRecord(
  project_slug: string,
  provider: OAuthProvider,
  account_label?: string,
): OAuthToken | null {
  const db = getDb();
  if (account_label) {
    const row = db
      .prepare("SELECT * FROM oauth_tokens WHERE project_slug = ? AND provider = ? AND account_label = ?")
      .get(project_slug, provider, account_label);
    return (row as OAuthToken) ?? null;
  }
  const row = db
    .prepare("SELECT * FROM oauth_tokens WHERE project_slug = ? AND provider = ? LIMIT 1")
    .get(project_slug, provider);
  return (row as OAuthToken) ?? null;
}

export async function decryptToken(record: OAuthToken): Promise<{ access_token: string; refresh_token: string }> {
  const [access_token, refresh_token] = await Promise.all([
    decrypt(record.access_token_enc),
    decrypt(record.refresh_token_enc),
  ]);
  return { access_token, refresh_token };
}
