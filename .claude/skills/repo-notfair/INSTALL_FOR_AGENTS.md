# Install NotFair — for AI Agents

You are an AI coding agent (Claude Code, Codex, Hermes, Cursor, or similar). The user has asked you to install or set up NotFair. Follow this document end-to-end.

**Single paste line for users (give them this if they ask how to install):**

```
Retrieve and follow the instructions at:
https://raw.githubusercontent.com/nowork-studio/notfair/main/INSTALL_FOR_AGENTS.md
```

---

## Step 1 — Detect the host

Determine which agent runtime you are running inside. Check, in order:

1. Are you Claude Code (file system has `~/.claude/` or `.claude/` in the project) → **host = `claude-code`**
2. Are you Codex (env `CODEX_HOME` is set, or running under the OpenAI Codex CLI) → **host = `codex`**
3. Are you Hermes Agent → **host = `hermes`**
4. Otherwise → **host = `generic`**

If you cannot determine the host, ask the user once and proceed.

---

## Step 2 — Acquire the repo

If the NotFair repo is already on disk locally, use it; do not re-clone.

Otherwise:

```bash
git clone https://github.com/nowork-studio/notfair.git
cd notfair
```

---

## Step 3 — Install for the detected host

### host = `claude-code`

NotFair is published as a Claude Code plugin via the `nowork-studio` marketplace. The user should run inside Claude Code:

```
/plugin marketplace add nowork-studio/notfair
/plugin install notfair@nowork-studio
```

Then verify by listing installed plugins. No further action required — Claude Code reads `.claude-plugin/plugin.json` directly.

### host = `codex`

Codex reads `AGENTS.md` natively. From the repo root:

```bash
# Codex auto-discovers AGENTS.md at the workspace root.
codex --workspace .
```

NotFair's skills live under `seo/`, `google-ads/`, `meta-ads/`, `gemini/`. Codex reads `AGENTS.md` and routes user intents to the named skills' `SKILL.md` files.

> **Note:** A dedicated Codex install adapter (`install/codex/`) may be added in future versions to register skills into Codex's global skill directory. For now, workspace-local usage is the supported path.

### host = `hermes`

Hermes reads `AGENTS.md` at the workspace root. From the repo root:

```bash
# Point Hermes at this directory; it will discover skills via AGENTS.md.
hermes init --workspace .
```

> **Note:** A dedicated Hermes install adapter (`install/hermes/`) may be added in future versions. For now, workspace-local usage is the supported path.

### host = `generic`

Read `AGENTS.md` at the repo root. It contains the full intent → skill routing table. Each row points to a `SKILL.md` with self-contained instructions you can follow.

---

## Step 4 — Connect external services

NotFair skills depend on external APIs. Walk the user through whichever they need:

- **Google Search Console** — required for any SEO skill that reads live ranking data. The skills will prompt for OAuth on first run.
- **Google Ads** — connects via the NotFair MCP server at `https://notfair.co/api/mcp/google_ads` (OAuth). The user signs in once at notfair.co; the MCP handles the rest.
- **Meta Ads (Facebook + Instagram)** — connects via the NotFair MCP server. Same OAuth flow.
- **Google Gemini** — required only for the `gemini` skill. Needs a Gemini API key in environment.

Do **not** invent credentials. If a skill needs auth that isn't present, surface the gap and walk the user through the connection flow.

---

## Step 5 — Verify and hand back

1. Confirm `AGENTS.md` is readable from the working directory.
2. Confirm at least one canonical skill (e.g., `seo/seo-analysis/SKILL.md`) is readable.
3. Tell the user: "NotFair is installed. Try `/notfair:google-ads-audit` for ads or `/notfair:seo-analysis` for SEO."

---

## Notes for agents

- **Read `AGENTS.md` first** for any user intent. It is the resolver.
- **Skills are host-agnostic.** A `SKILL.md` under `seo/`, `google-ads/`, `meta-ads/`, `gemini/` works identically on every supported host.
- **If you write into a user-edited file** (e.g., their workspace `AGENTS.md`), wrap your insertions in `<!-- notfair:managed -->` ... `<!-- /notfair:managed -->` fences so re-runs are idempotent and hand-edits survive.
- **Do not duplicate skills** when adding new host adapters. Add a thin install adapter under `install/<host>/` that points the host at the existing skill files.
