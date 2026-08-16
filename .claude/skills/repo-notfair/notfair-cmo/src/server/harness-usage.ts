import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Read what each local AI-agent harness exposes about the user's account
 * so the sidebar footer can surface real account state instead of just
 * the harness name.
 *
 *  - **codex-local** → hits `https://chatgpt.com/backend-api/wham/usage`
 *    using the access token from `~/.codex/auth.json`. That's the same
 *    endpoint the ChatGPT settings page reads to render the 5-hour and
 *    weekly usage bars. Returns `used_percent`, the rolling window
 *    duration, and the unix-epoch `reset_at` for both windows.
 *    Cached in-process so navigating between pages doesn't beat on
 *    chatgpt.com once per render.
 *
 *  - **claude-code-local** → `~/.claude/stats-cache.json`. Updated by
 *    the `claude` CLI on each run; contains per-day message/session/
 *    token rollups. Goes stale when `claude` hasn't run today, which
 *    we surface so the UI doesn't pretend a stale snapshot is "today".
 *
 * Failure modes (network error, missing/expired token, missing file,
 * malformed JSON) all fall through to the harness-specific `unknown`
 * shape — the sidebar footer must never break because chatgpt.com is
 * unreachable or `auth.json` was rotated.
 */

export type RateLimitWindow = {
  /** Fractional percent already consumed in the rolling window. */
  used_percent: number;
  /** Length of the rolling window (e.g. 18000 = 5h, 604800 = 7d). */
  limit_window_seconds: number;
  /** Unix epoch (seconds) when this window's usage tally resets. */
  reset_at: number;
};

export type CodexUsage = {
  kind: "codex";
  /** Codex plan name from wham/usage (e.g. "prolite", "pro", "free"). */
  plan: string | null;
  /** Account email from the JWT — used as a tooltip / accessibility hint. */
  email: string | null;
  /** Two-window rate limits, or null when the API call failed.
   *  primary = short rolling window (~5h); secondary = ~7d window. */
  rateLimit: { primary: RateLimitWindow; secondary: RateLimitWindow } | null;
};

export type ClaudeUsage = {
  kind: "claude-code";
  messagesToday: number;
  sessionsToday: number;
  /** Sum across every model that ran today. */
  tokensToday: number;
  /** True when stats-cache.json hasn't been recomputed today. The UI
   *  shows a quieter message in this state so the row doesn't read as
   *  "0 messages today" (true but misleading). */
  stale: boolean;
  /** YYYY-MM-DD of the latest day stats were rolled up. */
  lastComputedDate: string | null;
};

export type HarnessUsage =
  | CodexUsage
  | ClaudeUsage
  | { kind: "unknown" };

// In-process cache keyed by adapter. The chatgpt.com usage endpoint
// updates whenever the user runs codex, so a 60s TTL keeps the bars
// responsive without hammering the backend on every sidebar render.
type CacheEntry = { until: number; value: HarnessUsage };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

export async function readHarnessUsage(
  adapter: "claude-code-local" | "codex-local",
): Promise<HarnessUsage> {
  const hit = cache.get(adapter);
  if (hit && hit.until > Date.now()) return hit.value;
  let value: HarnessUsage;
  try {
    if (adapter === "codex-local") value = await readCodexUsage();
    else if (adapter === "claude-code-local") value = readClaudeUsage();
    else value = { kind: "unknown" };
  } catch {
    value = { kind: "unknown" };
  }
  cache.set(adapter, { until: Date.now() + CACHE_TTL_MS, value });
  return value;
}

async function readCodexUsage(): Promise<HarnessUsage> {
  const authFile = path.join(os.homedir(), ".codex", "auth.json");
  if (!fs.existsSync(authFile)) {
    return { kind: "codex", plan: null, email: null, rateLimit: null };
  }
  const auth = JSON.parse(fs.readFileSync(authFile, "utf-8")) as {
    tokens?: { access_token?: string; id_token?: string };
  };
  const accessToken = auth.tokens?.access_token;
  if (!accessToken) {
    return { kind: "codex", plan: null, email: null, rateLimit: null };
  }

  // Decode just to pull the email + chatgpt account id (needed as the
  // ChatGPT-Account-Id header so the backend scopes the response to
  // the right workspace).
  const { email, accountId } = decodeIdToken(auth.tokens?.id_token);

  let plan: string | null = null;
  let rateLimit: CodexUsage["rateLimit"] = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };
    if (accountId) headers["ChatGPT-Account-Id"] = accountId;
    const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      headers,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      const body = (await res.json()) as {
        plan_type?: string;
        rate_limit?: {
          primary_window?: RateLimitWindow;
          secondary_window?: RateLimitWindow;
        };
      };
      if (typeof body.plan_type === "string") plan = body.plan_type;
      const p = body.rate_limit?.primary_window;
      const s = body.rate_limit?.secondary_window;
      if (p && s) {
        rateLimit = { primary: p, secondary: s };
      }
    }
  } catch {
    // Network error / abort — leave rateLimit null; the footer falls
    // back to the plan chip only.
  }

  return { kind: "codex", plan, email, rateLimit };
}

function decodeIdToken(idToken: string | undefined): {
  email: string | null;
  accountId: string | null;
} {
  if (!idToken) return { email: null, accountId: null };
  const parts = idToken.split(".");
  if (parts.length < 2) return { email: null, accountId: null };
  try {
    const claims = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf-8"),
    ) as Record<string, unknown>;
    const authClaims =
      (claims["https://api.openai.com/auth"] as
        | Record<string, unknown>
        | undefined) ?? {};
    return {
      email: typeof claims.email === "string" ? claims.email : null,
      accountId:
        typeof authClaims.chatgpt_account_id === "string"
          ? authClaims.chatgpt_account_id
          : null,
    };
  } catch {
    return { email: null, accountId: null };
  }
}

function readClaudeUsage(): HarnessUsage {
  const file = path.join(os.homedir(), ".claude", "stats-cache.json");
  if (!fs.existsSync(file)) {
    return {
      kind: "claude-code",
      messagesToday: 0,
      sessionsToday: 0,
      tokensToday: 0,
      stale: true,
      lastComputedDate: null,
    };
  }
  const stats = JSON.parse(fs.readFileSync(file, "utf-8")) as {
    dailyActivity?: Array<{
      date: string;
      messageCount?: number;
      sessionCount?: number;
    }>;
    dailyModelTokens?: Array<{
      date: string;
      tokensByModel?: Record<string, number>;
    }>;
    lastComputedDate?: string;
  };
  const today = new Date().toISOString().slice(0, 10);
  const todayActivity = stats.dailyActivity?.find((d) => d.date === today);
  const todayTokens = stats.dailyModelTokens?.find((d) => d.date === today);
  const tokensSum = todayTokens
    ? Object.values(todayTokens.tokensByModel ?? {}).reduce(
        (sum, v) => sum + (typeof v === "number" ? v : 0),
        0,
      )
    : 0;
  return {
    kind: "claude-code",
    messagesToday: todayActivity?.messageCount ?? 0,
    sessionsToday: todayActivity?.sessionCount ?? 0,
    tokensToday: tokensSum,
    stale: stats.lastComputedDate !== today,
    lastComputedDate: stats.lastComputedDate ?? null,
  };
}
