# Architecture

> Single-user local app. No auth, no multi-tenancy, no hosted backend.

## Process layout

```
USER'S MACHINE
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ┌────────────────────────────────────┐    ┌──────────────────────┐  │
│  │  notfair-cmo (Next.js)             │    │  OpenClaw daemon     │  │
│  │  npx notfair-cmo → localhost:3000  │◀──▶│  WebSocket gateway   │  │
│  │                                    │    │  on loopback         │  │
│  │  ┌──────────────────────────────┐  │    └──────────┬───────────┘  │
│  │  │ Frontend (React + shadcn)    │  │               │ subprocess   │
│  │  │  - Sidebar + project switcher│  │               ▼              │
│  │  │  - Per-agent chat (SSE)      │  │    ┌──────────────────────┐  │
│  │  │    + threads + tool steps    │  │    │  openclaw CLI        │  │
│  │  │  - Cron tab + calendar       │  │    │  - agents add/list   │  │
│  │  │  - Approvals inbox (V1.1)    │  │    │  - cron add/list/rm  │  │
│  │  │  - Tasks board (V1.1)        │  │    │  - mcp set/show/unset│  │
│  │  │  - Activity (audit log)      │  │    │  - agent (chat turn) │  │
│  │  │  - Connections (MCP catalog) │  │    │  - memory search     │  │
│  │  │  - Settings (guardrails)     │  │    │  - skills add/rm     │  │
│  │  │  - Paired OpenClaw pill      │  │    └──────────────────────┘  │
│  │  │  - Onboarding (SSE stream)   │  │                              │
│  │  └──────────────────────────────┘  │                              │
│  │  ┌──────────────────────────────┐  │                              │
│  │  │ Server actions + API routes  │  │                              │
│  │  │  - createProject (provisions │  │                              │
│  │  │    3 agents + MCPs)          │  │                              │
│  │  │  - clone/create/rename/      │  │                              │
│  │  │    delete agent              │  │                              │
│  │  │  - schedule/pause/resume/    │  │                              │
│  │  │    delete cron               │  │                              │
│  │  │  - archive project (cascade  │  │                              │
│  │  │    disables crons)           │  │                              │
│  │  │  - MCP connect/disconnect    │  │                              │
│  │  │    (one-click PKCE OAuth)    │  │                              │
│  │  │  - /api/chat (SSE)           │  │                              │
│  │  │  - /api/onboarding/stream    │  │                              │
│  │  │  - /api/mcp-oauth/callback   │  │                              │
│  │  │  - /api/oauth/{provider}/*   │  │                              │
│  │  │    (env-var scaffold, V1.1)  │  │                              │
│  │  └──────────────────────────────┘  │                              │
│  │  ┌──────────────────────────────┐  │                              │
│  │  │ Local SQLite                 │  │                              │
│  │  │  ~/.notfair-cmo/db.sqlite    │  │                              │
│  │  │  - projects                  │  │                              │
│  │  │  - tasks (V1.1 wires up)     │  │                              │
│  │  │  - approvals (V1.1)          │  │                              │
│  │  │  - cost_events (V1.1)        │  │                              │
│  │  │  - oauth_tokens (encrypted)  │  │                              │
│  │  │  - guardrails (config)       │  │                              │
│  │  │  - agent_actions (audit log) │  │                              │
│  │  │  - sequence_runs             │  │                              │
│  │  └──────────────────────────────┘  │                              │
│  └────────────────────────────────────┘                              │
└──────────────────────────────────────────────────────────────────────┘
```

## Why this shape

**Don't rebuild the wheels.** OpenClaw already provides:
- Agent runtime (per-agent isolated workspaces, model fallback chains)
- Cron scheduler with agent attribution + run history
- Built-in memory subsystem with REM (reflective episodic memory)
- WebSocket gateway with auth modes
- MCP client (`openclaw mcp set/show/unset`) with per-agent allowlists
- Multi-channel delivery (Telegram, Slack, iMessage, etc.)

We don't reimplement any of that. notfair-cmo adds:
- A product-shaped chat + management UI scoped per marketing project
- A consistent naming convention (`<project> / <agent> / <cron>`) so OpenClaw's flat namespace becomes hierarchical to the user
- A project-scoped MCP catalog with one-click PKCE OAuth onboarding (`/connections`)
- Local SQLite for product-specific state (tasks, approvals, cost events, OAuth tokens) that doesn't belong in OpenClaw's model
- AES-256-GCM encrypted OAuth token vault with OS-keychain master key
- An append-only `agent_actions` audit log surfaced as the Activity tab

## Agent ↔ notfair-cmo interaction (V1)

Two interaction layers:

1. **Chat turn over the gateway WebSocket.** `/api/chat` proxies to OpenClaw's gateway via a pooled WS connection (`server/openclaw/gateway-client.ts`), streams tool calls + assistant text back as SSE, and persists the thread file through the gateway so reloads see full history.

2. **Cron creation by the agent.** Agents are taught (via system prompt in `IDENTITY.md`) to use OpenClaw's built-in `exec` tool to run `openclaw cron add ...` directly. The system prompt enforces the project-namespaced naming convention so our cron tab parses + groups correctly.

**No MCP server hosted by notfair-cmo.** We don't expose tools as an MCP server — agents call third-party MCP servers (e.g. `notfair-googleads`) that OpenClaw connects to on their behalf. The Connections page is the UI for that wiring; cross-project visibility is enforced by OpenClaw's `codex.agents` allowlist which `actions/mcp.ts` keeps in sync with the active project's agent ids.

The autonomy/cost/approval features land in V1.1 — the SQLite tables, server helpers, and UI stubs are in place; the agent-side `record_cost` / `approve_action` enforcement hooks aren't wired yet.

## Distribution

- npm package (`notfair-cmo` bin)
- Next.js standalone build (`.next/standalone/server.js` shipped, started by `bin/cli.mjs`)
- Native deps: `better-sqlite3` (Node 24 prebuilds available), `keytar` (prebuilds for major platforms)
- Runtime requires: Node 20+, OpenClaw installed and gateway running
- `scripts/copy-standalone-assets.mjs` runs after `next build` so the npm tarball ships a runnable `.next/standalone` tree (Next omits `.next/static` + `public` by default).

## Module map

```
bin/
  cli.mjs                # CLI entry: `notfair-cmo` (start, doctor, stop)

scripts/
  copy-standalone-assets.mjs   # post-build: dereference symlinks into standalone tree
  e2e-provision.ts             # dev helper: create a project + provision its agents

src/
  app/
    layout.tsx                 # Root layout (TooltipProvider, Toaster, theme)
    globals.css
    (app)/                     # Sidebar-shell route group
      layout.tsx               # SidebarProvider + AppSidebar + main
      page.tsx                 # Project home (KPIs + recent actions)
      agents/                  # Per-agent surface
        page.tsx               # Agent index for the active project
        [agent]/
          page.tsx              # Agent overview
          chat/                 # Threaded chat (SSE)
            page.tsx
            [thread]/page.tsx
          cron/page.tsx         # Per-agent crons
          files/page.tsx        # Workspace files
          settings/page.tsx     # Rename + danger zone
          skills/page.tsx       # OpenClaw skills assigned to this agent
      activity/page.tsx         # Append-only agent_actions audit log
      approvals/page.tsx        # Pending approvals (V1.1 wires fully)
      tasks/page.tsx            # Task board (V1.1 wires fully)
      crons/page.tsx            # All crons for the project (calendar + list)
      connections/page.tsx      # MCP catalog: connect/disconnect per project
      settings/page.tsx         # Autonomy guardrails + project rename/danger
      projects/                 # List + new
        page.tsx
        new/page.tsx
    onboarding/                 # Magic-moment first run
      layout.tsx
      page.tsx
    api/
      chat/route.ts                          # POST → SSE stream via gateway WS
      onboarding/stream/route.ts             # SSE: magic-moment provisioning
      mcp-oauth/callback/route.ts            # One-click MCP PKCE callback
      oauth/[provider]/start/route.ts        # Env-var direct OAuth (scaffold)
      oauth/[provider]/callback/route.ts     # Env-var direct OAuth (scaffold)
      projects/[slug]/provision/route.ts     # Re-provision agents for a project

  server/
    active-project.ts          # cookie-backed current project
    agent-meta.ts              # per-agent display metadata (name, role, color)
    agent-templates.ts         # CMO / google_ads / seo definitions + IDENTITY.md writer
    mcp-catalog.ts             # static known-MCP catalog (notfair-googleads, …)
    mcp-pending.ts             # in-memory pending OAuth flows (PKCE state)
    mcp-state.ts               # merged config + health probe per MCP
    actions/
      projects.ts              # create (+provision), archive (cascade), rename, switch
      agents.ts                # clone, create, rename, delete (cascade)
      crons.ts                 # schedule, pause, resume, delete
      cron-runs.ts             # surface run history from OpenClaw
      approvals.ts             # approve, reject (V1.1 fully wired)
      guardrails.ts            # update thresholds
      mcp.ts                   # one-click PKCE connect/disconnect
      skills.ts                # assign/remove OpenClaw skills on agents
    openclaw/
      cli.ts                   # subprocess wrapper: openclaw(args)
      gateway-client.ts        # pooled WebSocket client + token discovery
      gateway-rpc.ts            # request/response over the gateway WS
      agent-turn.ts            # streaming agent invocation
      sessions.ts              # chat-session lookup + pending-key registry
      crons.ts                 # cron list parser + naming convention + cache
      cron-schedule.ts         # next-fire calculation (cron-parser)
      clone-agent.ts           # `openclaw agents clone` wrapper
      project-delete.ts        # cascade-delete a project's agents + crons
    db/
      db.ts                    # better-sqlite3 singleton + migration runner
      migrations.ts            # embedded SQL migration manifest
      migrations/001_init.sql  # canonical SQL (mirrored into migrations.ts)
      projects.ts, tasks.ts, approvals.ts, cost.ts,
      oauth.ts, guardrails.ts, agent-actions.ts
    secrets/
      master-key.ts            # OS keychain (keytar) master key
      cipher.ts                # AES-256-GCM encrypt / decrypt

  components/
    app-sidebar.tsx            # Sidebar with project switcher + nav + status pill
    project-switcher.tsx
    paired-openclaw-pill.tsx   # Sidebar pill → opens gateway dashboard with token
    agent-nav.tsx              # Sidebar's per-agent navigation
    agent-tabs.tsx             # Agent sub-nav (chat / cron / files / settings / skills)
    agent-chat.tsx             # Streamed chat with Stop button + inline tool steps
    thread-selector.tsx        # Thread picker in the agent chat
    markdown.tsx               # GFM markdown renderer (assistant output)
    slash-command-popover.tsx  # /command popover in chat composer
    schedule-cron-dialog.tsx
    cron-row-actions.tsx
    cron-calendar.tsx
    create-agent-button.tsx
    create-agent-dialog.tsx
    agent-rename-card.tsx
    agent-danger-zone.tsx
    reprovision-button.tsx
    project-rename-card.tsx
    danger-zone.tsx
    disable-source-crons-dialog.tsx
    mcp-card.tsx               # Per-MCP card on the Connections page
    mcp-flash-banner.tsx       # Post-redirect success/error banner
    google-ads-mcp-banner.tsx  # Inline prompt in Google Ads chat to connect MCP
    approval-card.tsx
    skills-list.tsx
    onboarding-flow.tsx
    client-mount-gate.tsx      # Defer client-only children until after mount
    ui/                        # shadcn primitives

  hooks/
    use-mobile.ts

  lib/
    slug.ts                    # slugify + reserved-word check
    utils.ts                   # cn() for shadcn
    agent-colors.ts            # deterministic per-agent accent
    slash-commands.ts          # /command registry for the chat composer
    onboarding/steps.ts        # magic-moment step definitions

  types/
    index.ts                   # Project, Task, Approval, CostEvent, etc.
```

## What we deliberately don't have

- No auth, no sessions, no users table — single-user local
- No multi-tenancy, no RLS — single SQLite file
- No webhook signing / reconciliation — loopback only, trusted
- No notfair-hosted MCP server — agents talk to OpenClaw's MCP clients
- No telemetry — opt-in only when added in a later version
- No Docker / Tauri distribution (V1) — npm only

## Deferred to V1.1

- Approval enforcement: the `approvals` table + UI are live; agent-side `approve_action` gating isn't wired
- Cost tracking: `cost_events` + helpers + Settings thresholds exist; per-LLM-call middleware that records cost isn't wired (the sidebar shows a Paired OpenClaw pill instead of a cost meter in V1)
- Task lifecycle UI: the `tasks` table + types exist; the board reflects them, but the proposer/approver loop isn't end-to-end
- Cross-project signal sharing (agents reading each other's REM)
- Eval harness + test suite (Vitest unit + Playwright E2E; mocked at the `openclaw/cli.ts` boundary)
- Direct env-var OAuth UI (Google Ads / GSC) — the API routes scaffold the flow; no Connections-page UI surface yet (the MCP one-click flow covers the V1 Google Ads path)

## Trade-offs to know about

- **Agent name discipline depends on system prompt.** If the agent forgets the `<project> / <agent> / <name>` convention, the cron lands in our "ungrouped" bucket — graceful degradation, not broken.
- **Connections is project-scoped, but OpenClaw's `mcp` config is workspace-global.** We namespace stored keys with the project slug (`<slug>-<catalog-key>`) and rewrite `codex.agents` to that project's agents so tokens don't bleed across projects.
- **No agent ↔ agent direct messaging.** Agents coordinate by reading each other's OpenClaw memory entries (which agents already do natively via `memory search`).
- **Gateway WS is pooled and reused per request.** Cold-start cost lives in the first chat turn; subsequent turns hit a warm connection via `gateway-client.ts`.
