/**
 * One-off: force the MCP refresh path against live tokens.
 *
 * For each (project_slug, server_name) pair on argv (or a default set), this
 * loads the stored row, calls refreshMcpToken(), and prints a short summary
 * showing whether the access token actually rotated and whether the refresh
 * token rotated alongside it.
 *
 * Usage:
 *   pnpm tsx scripts/force-refresh-mcp-tokens.ts
 *   pnpm tsx scripts/force-refresh-mcp-tokens.ts demo1 stripe demo1 supabase
 */
import { findMcpToken } from "../src/server/mcp/tokens";
import { refreshMcpToken, isExpiringSoon } from "../src/server/mcp/refresh";

const DEFAULT_TARGETS: Array<[string, string]> = [
  ["demo1", "supabase"],
  ["demo1", "mixpanel"],
  ["demo1", "stripe"],
  ["demo1", "posthog"],
  ["demo1", "notfair-googleads"],
  ["demo1", "notfair-meta-ads"],
];

function tailMask(s: string | null, head = 6, tail = 4): string {
  if (!s) return "<null>";
  if (s.length <= head + tail + 1) return `${s.slice(0, head)}…`;
  return `${s.slice(0, head)}…${s.slice(-tail)} (len=${s.length})`;
}

function ms(value: string | null): string {
  if (!value) return "<null>";
  const t = Date.parse(value);
  if (Number.isNaN(t)) return value;
  const deltaMs = t - Date.now();
  const mins = Math.round(deltaMs / 60_000);
  return `${value} (${deltaMs >= 0 ? "+" : ""}${mins}m)`;
}

async function refreshOne(project_slug: string, server_name: string): Promise<void> {
  console.log(`\n── ${project_slug}/${server_name} ────────────────────`);
  const before = findMcpToken(project_slug, server_name);
  if (!before) {
    console.log("  no row stored — skip");
    return;
  }

  console.log("  before:");
  console.log(`    access_token  = ${tailMask(before.access_token_enc)}`);
  console.log(`    refresh_token = ${tailMask(before.refresh_token_enc)}`);
  console.log(`    expires_at    = ${ms(before.expires_at)}`);
  console.log(`    token_endpoint= ${before.token_endpoint ?? "<null>"}`);
  console.log(`    client_id     = ${before.client_id ?? "<null>"}`);
  console.log(`    has client_secret = ${before.client_secret ? "yes" : "no"}`);
  console.log(`    is expiring soon (default 60s) = ${isExpiringSoon(before)}`);

  if (!before.refresh_token_enc || !before.token_endpoint || !before.client_id) {
    console.log(
      "  ⇒ refresh path will short-circuit (missing refresh_token/token_endpoint/client_id)",
    );
  }

  const refreshed = await refreshMcpToken(before);

  if (!refreshed) {
    console.log("  ❌ refreshMcpToken returned null");
    return;
  }

  const accessRotated = refreshed.access_token_enc !== before.access_token_enc;
  const refreshRotated =
    refreshed.refresh_token_enc !== before.refresh_token_enc;

  console.log("  after:");
  console.log(
    `    access_token  = ${tailMask(refreshed.access_token_enc)} ${
      accessRotated ? "✅ ROTATED" : "(same)"
    }`,
  );
  console.log(
    `    refresh_token = ${tailMask(refreshed.refresh_token_enc)} ${
      refreshRotated ? "🔁 ROTATED" : "(same)"
    }`,
  );
  console.log(`    expires_at    = ${ms(refreshed.expires_at)}`);
  console.log(`  ✅ refresh succeeded`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const targets: Array<[string, string]> = [];
  if (argv.length === 0) {
    targets.push(...DEFAULT_TARGETS);
  } else if (argv.length % 2 !== 0) {
    console.error("Args must come in (project_slug, server_name) pairs");
    process.exit(2);
  } else {
    for (let i = 0; i < argv.length; i += 2) {
      targets.push([argv[i]!, argv[i + 1]!]);
    }
  }

  for (const [slug, name] of targets) {
    try {
      await refreshOne(slug, name);
    } catch (err) {
      console.error(`  ❌ threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
