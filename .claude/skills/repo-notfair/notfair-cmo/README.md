# notfair-cmo

> Local AI marketing portal. Spin up specialist marketing agents per project on top of Claude Code or Codex, chat with them, manage their scheduled work, connect their tools.

Open source. Runs entirely on your machine. Bring your own LLM credentials (via the harness CLI you already authenticate to) and your own ad-platform OAuth.

## What it gives you

- **Per-agent chat** scoped to each project — talk to a marketing-shaped agent that can launch campaigns, audit SEO, propose recurring jobs. Tool calls + MCP invocations stream inline as collapsible step rows.
- **Specialist agents** (CMO + Google Ads + SEO) auto-provisioned per project, isolated in their own workspace dir. Clone or create more from the sidebar.
- A **cron tab** (calendar + list) backed by a native SQLite scheduler. Agents create jobs via the `schedule_recurring_work` MCP tool; the tick loop in the Next.js process fires them on time.
- **Project-scoped MCP connections** — one-click PKCE OAuth to bring third-party tools (Google Ads via NotFair's hosted MCP) into the agents' toolbox. Tokens stored in SQLite, never in env vars, and wired into the chosen harness automatically.
- A **live audit log** of every autonomous decision and scheduled run, append-only.
- An **approvals inbox**, **abandoned-task recovery**, and **task board** — when an agent forgets to close a task, you get Resume / Mark done / Cancel actions instead of an infinite spinner.

## Pick your harness

At onboarding you pick which local AI coding agent runs the work:

| Harness | Status | Notes |
|---|---|---|
| **Claude Code** | Recommended | Uses your existing `claude` login. Per-agent `.mcp.json` for isolation. |
| **Codex** | Supported | Uses your existing `codex` login. Per-server env-var bearers. Requires `--dangerously-bypass-approvals-and-sandbox` (set by the adapter) so tool calls and loopback reach your local orchestration MCP. |

Different projects can run on different harnesses; the choice persists on the project row.

## Prerequisites

- **Node 20+** (Node 24 recommended for native-module prebuilds).
- **At least one harness installed and authenticated**:
  - [Claude Code](https://docs.claude.com/en/docs/agents-and-tools/claude-code/overview), or
  - [Codex CLI](https://github.com/openai/codex)

Run `notfair-cmo doctor` to verify Node, both harnesses, data dir, and port.

## Install + run

```bash
# One-shot, no install:
npx notfair-cmo@latest doctor      # verify env
npx notfair-cmo@latest             # launch UI on http://127.0.0.1:3327

# Or install globally:
npm install -g notfair-cmo
notfair-cmo
```

The UI opens in your browser. Sidebar is project-scoped; create one to start.

## CLI

```
notfair-cmo                 Launch local server + open UI (default)
notfair-cmo start           Same as above
notfair-cmo doctor          Run preflight checks (see below)
notfair-cmo --version
notfair-cmo --help
```

Options on `start`: `--port <n>` (default 3327), `--no-open`, `--data-dir <path>`.
Options on `doctor`: `--port <n>`, `--data-dir <path>`.

`doctor` runs five checks: Node ≥ 20 (24 recommended), Claude Code on PATH, Codex on PATH, at least one harness ready, data dir writable, and the preferred port free. Exits 0 if every check is passing, 1 otherwise, with a `Fix:` line under each failure naming the exact command to run.

## What happens when you create a project

1. SQLite row written at `~/.notfair-cmo/db.sqlite` with your harness choice (`projects.harness_adapter`).
2. Default agents provisioned under the project's slug:
   - `<slug>-cmo-<name>` — Chief Marketing Officer
   - `<slug>-google-ads-<name>` — Google Ads specialist
   - SEO is opt-in, provisioned on demand.

   Each gets its own workspace at `~/.notfair-cmo/agents/<id>/` with an `IDENTITY.md` system prompt scoped to its role + the chosen harness's native config (`.mcp.json` for Claude Code, sections in `~/.codex/config.toml` for Codex).
3. The orchestration MCP server (`/api/mcp/orchestration`) is registered for every agent so they can call `create_task`, `submit_task_status`, `set_project_brief`, `schedule_recurring_work`, etc.
4. The onboarding stream walks you through the "magic moment" preview steps over SSE, then redirects to the project home.

## Scheduling recurring work

Agents call the `schedule_recurring_work` MCP tool to create cron-style jobs that fire as synthetic task assignments to themselves (or another agent in the project). The tick loop is a `setInterval` in the Next.js process polling `scheduled_jobs` every 30 s; due jobs are dispatched through the project's harness adapter.

You can also schedule manually via the **+ New cron** button on the Crons tab.

## Connecting MCP servers (for live ad-platform data)

The Connections page lists the MCP servers in our catalog (currently: NotFair Google Ads). Click **Connect** to start a one-click PKCE OAuth flow — no environment variables to set, no Google Cloud project of your own to register.

The token is persisted into `mcp_tokens` (SQLite) and the catalog MCP is automatically registered with every agent in the project via the chosen harness's config. New agents provisioned later get the same wiring.

OAuth refresh tokens are AES-256-GCM encrypted with a master key stored in your OS keychain (via `keytar`) and persisted to your local SQLite.

## Live transcript

Chat events (deltas, tool calls, lifecycle) are persisted to `transcript_events` and **also** pushed through an in-process `EventEmitter` keyed by session id. Open tabs subscribe via SSE; new events land in milliseconds. Re-attach to a streaming thread (open the URL in a second tab while the agent is mid-turn) is race-free: the server backfills from cursor=0 before attaching the live subscription, with dedup-by-seq.

## Data location

- App state: `~/.notfair-cmo/db.sqlite` (override with `--data-dir` or `NOTFAIR_CMO_DATA_DIR`)
- Agent workspaces: `~/.notfair-cmo/agents/<agent-id>/`
- Harness configs: `~/.claude/` for Claude Code; `~/.codex/config.toml` for Codex (managed by the respective CLI)
- Orchestration MCP secret: `~/.notfair-cmo/mcp-server-secret` (0600 perms)

## What V1 is and isn't

**Is:** an agent runner + per-agent chat portal + native cron scheduler + MCP connection hub + activity audit log + abandoned-task recovery. Runs on Claude Code or Codex, no proprietary agent runtime.

**Isn't (yet):** a fully autonomous CMO. Auto-approve rule editor, per-LLM-call cost tracking, eval harness, and cross-channel portfolio coordination are scaffolded but not wired end-to-end. They land in subsequent releases.

See `ARCHITECTURE.md` for the design and `CONTRIBUTING.md` for development setup.

## License

MIT — see LICENSE.
