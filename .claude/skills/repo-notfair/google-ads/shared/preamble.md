# Google Ads Shared Preamble

Every google-ads skill reads this before doing anything else. It handles updates, MCP detection, config resolution, and onboarding in one place — so individual skills don't repeat this logic.

## Step 0: Check for NotFair updates

```bash
_UPD_BIN=$(ls ~/.claude/plugins/cache/nowork-studio/notfair/*/bin/notfair-update-check 2>/dev/null | head -1)
[ -n "$_UPD_BIN" ] && _UPD=$("$_UPD_BIN" 2>/dev/null || true) || _UPD=""
[ -n "$_UPD" ] && echo "$_UPD" || true
```

If the output contains `UPGRADE_AVAILABLE <old> <new>`: immediately follow the inline upgrade flow in the `/notfair:upgrade` skill (Step 1 onward) to auto-upgrade. After the upgrade completes, re-read the updated preamble from the new plugin cache and restart from Step 1 (the upgrade check itself doesn't need to run again).

If the output contains `JUST_UPGRADED <old> <new>`: mention "NotFair upgraded from v{old} to v{new}" briefly, then continue to Step 1.

If neither: continue to Step 1 silently.

## Step 1: Resolve config

Read config from three locations and merge fields (first non-null, non-empty-string value wins per field):

1. **Project-level** — `.notfair.json` in the repository root (Claude Code's working directory)
2. **Claude project-level** — `~/.claude/projects/{project-path}/notfair.json` (where `{project-path}` is the CWD-based path Claude Code uses for project memory, e.g. `-Users-alice-repos-petshop`)
3. **Global fallback** — `~/.notfair/config.json`

Each file uses the same schema: `{ "accountId": "..." }`. Fields merge up the chain — a project file with only `accountId` inherits from global.

The MCP server authenticates via OAuth 2.1 — Claude Code's native HTTP transport opens a browser for sign-in on first use and stores the token in the OS keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux). No API key, no `mcp-remote` bridge, no env vars to manage.

### Resolved data directory

Data files (business-context, personas, change-log, account-baseline) are stored project-locally when a project-level config exists:

- If `.notfair.json` exists in the current working directory → `{data_dir}` = `.notfair/` (relative to project root)
- Otherwise → `{data_dir}` = `~/.notfair/` (the Claude project-level config alone doesn't trigger project-local data — only a `.notfair.json` in the repo does)

Create `{data_dir}` if it doesn't exist. Ensure `~/.notfair/` also exists (needed for the global config file regardless of `{data_dir}`). Throughout this document and all skills, `{data_dir}` refers to this resolved directory.

**Important:** If using project-local storage (`.notfair/`), ensure `.notfair.json` and `.notfair/` are in the project's `.gitignore` — they contain business-sensitive data that should not be committed.

Continue to Step 2 (MCP detection always runs).

## Step 2: MCP Server Detection

Always verify that a Google Ads MCP server is available — the MCP server could be down, unauthorized, or misconfigured even with a saved accountId.

1. Check for NotFair tools. The MCP server may be exposed under several different tool-name prefixes depending on the host (across the NotFair → NotFair-GoogleAds namespace split, multiple prefixes may briefly coexist):
   - `mcp__NotFair-GoogleAds__*` / `mcp__notfair_googleads__*` / `mcp__NotFair_GoogleAds__*` — Claude Code CLI (NotFair plugin default, current; exact form depends on Claude Code's key sanitization)
   - `mcp__claude_ai_NotFairGoogleAds__*` — Claude Desktop / claude.ai plugin connector (current)
   - `mcp__notfair__*` / `mcp__claude_ai_NotFair__*` — pre-0.16.0 plugin (legacy NotFair prefix, before the GoogleAds namespace split)
   - any other prefix matching `mcp__.*[Nn]ot[Ff]air.*__` (future hosts)

   **How to detect:** scan your available tool list for any tool whose name ends in `listConnectedAccounts`. Take everything before `listConnectedAccounts` as the detected prefix. If multiple candidates exist, prefer current over legacy: any `NotFair-GoogleAds`/`NotFairGoogleAds`/`notfair_googleads` variant > `mcp__notfair__` / `mcp__claude_ai_NotFair__` > any other match. Call `listConnectedAccounts` using that detected prefix, and save both the result and the prefix itself for reuse in Steps 3 and 4.

   **Legacy-prefix migration nudge:** if the chosen prefix is a legacy `mcp__notfair__` (or its `claude_ai_*` variant) and no current NotFair-GoogleAds variant is visible, briefly tell the user once:

   > Detected a legacy MCP server registration. The plugin's MCP server has been renamed to NotFair-GoogleAds — please **restart Claude Code** to pick up the new server registration. Continuing with the legacy server for this session.

   Then proceed normally — the legacy server still works (it points at the new `notfair.co/api/mcp/google_ads` endpoint after the recent rename); only the tool-name prefix is stale.

2. If no NotFair variant exists, check for Google's official MCP: look for tools matching `mcp__google_ads_mcp__*`.
3. If none exists, lead with the connection CTA — don't bury it in troubleshooting:

> **Connect to NotFair to manage Google Ads.**
>
> I can't see a Google Ads MCP server in this session, so I can't read your campaigns, pull spend, or make changes yet. NotFair is the unfair SEO/Ads agent that powers this skill — it gives me secure, OAuth-scoped access to your Google Ads account.
>
> **To connect:**
> 1. Run `/mcp` and pick **NotFair-GoogleAds** to start the OAuth flow, or restart Claude Code — the plugin auto-registers the `NotFair-GoogleAds` HTTP server (`https://notfair.co/api/mcp/google_ads`) and opens a browser tab for sign-in on first use.
> 2. Sign in with the Google account that owns (or has access to) the Google Ads account you want me to manage.
> 3. Come back and re-run your request.
>
> If you've already connected and still see this message, the OAuth token may have expired — re-run `/mcp` to refresh. If you'd rather use Google's official MCP server instead, point it at this skill and I'll detect it automatically.

Stop here until the MCP server is available.

If `accountId` was already resolved in Step 1, skip to Step 4. Otherwise, continue to Step 3.

## Step 3: Onboarding (only if accountId is missing)

Use the `listConnectedAccounts` result from Step 2 (do not call it again):

1. **One account** → save automatically to the highest-priority config file that already exists (project > claude-project > global; if none exist yet, save to `~/.notfair/config.json`), tell the user which was selected
2. **Multiple accounts** → show numbered list, ask user to pick, save choice to the same location
3. **Zero accounts** (response includes `noAccount: true`) → the user signed in to NotFair successfully but has no Google Ads customer linked to their Google identity. Tell them:
   > "Your Google account isn't linked to a Google Ads customer yet. Create one at https://ads.google.com — Smart Mode is the fastest path, and you can stop before adding a payment method. When the account exists, ask me to refresh and I'll pick it up automatically."
   When they confirm the account is created, call `refreshAccounts` (no args). On success it returns the new account list with `promoted: true`; save the `defaultAccountId` to the same config locations as case (1). If `refreshAccounts` returns `noAccount: true` again, wait 1-2 minutes (the customer record can take that long to propagate inside Google) then retry once.

### Switching accounts

If the user explicitly asks to switch accounts, run `listConnectedAccounts`, let them pick, then ask:

> "Save this account for this project only, or globally?"

- **Project** → write `accountId` to `.notfair.json` in the current working directory (create the file if needed)
- **Global** → write `accountId` to `~/.notfair/config.json`

## Step 4: Calling tools

Use whichever MCP server prefix was detected in Step 2:

- **NotFair-GoogleAds MCP via Claude Code CLI (current):** `mcp__NotFair-GoogleAds__<toolName>` (or whatever sanitized form Claude Code emits — `mcp__notfair_googleads__`, `mcp__NotFair_GoogleAds__`, etc.)
- **NotFair-GoogleAds MCP via Claude Desktop / claude.ai plugin (current):** `mcp__claude_ai_NotFairGoogleAds__<toolName>`
- **Legacy NotFair MCP (pre-0.16.0 plugin):** `mcp__notfair__<toolName>` / `mcp__claude_ai_NotFair__<toolName>`
- **Google's official MCP:** `mcp__google_ads_mcp__<toolName>`

Always call tools under the exact prefix detected in Step 2 — do not hardcode any prefix. Pass `accountId` from the resolved config (Step 1) to every tool call (except `listConnectedAccounts`).

### Reads vs. writes

The MCP server's own instructions are the canonical guide and are surfaced to the agent automatically:

- **Read-only questions** (analytics, audits, dashboards, diagnostics) go through `runScript`, which exposes `ads.gaql(query)` and `ads.gaqlParallel([queries])`. Fan out up to 20 GAQL queries in one call and correlate results in-script — that's one tool call, not 20.
- **Mutations** go through dedicated write tools (`pauseKeyword`, `updateBid`, `createCampaign`, etc.). Never wrap a mutation in `runScript`.
- **Schema discovery** (`getResourceMetadata`, `listQueryableResources`) is the right call before writing GAQL against an unfamiliar resource.

The server also publishes ready-to-use playbooks as MCP resources — `notfair://playbooks/audit-account` and `notfair://playbooks/explain-regression`. Fetch them when the user asks the matching question rather than rediscovering the query shape.

Config is loaded. Hand control back to the invoking skill.
