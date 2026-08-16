# Contributing

Thanks for poking around! notfair-cmo is small, opinionated, and willing to grow.

## Dev setup

```bash
git clone https://github.com/notfair-co/notfair-cmo.git
cd notfair-cmo
pnpm install
```

Native deps (`better-sqlite3`, `keytar`) need build approvals on pnpm — already
configured in `package.json` under `pnpm.onlyBuiltDependencies`, so they build
on install with no extra prompts.

Make sure you have:
- Node 20+ (24 preferred — that's what the prebuilt `better-sqlite3` / `keytar` binaries target)
- OpenClaw installed and `openclaw gateway` running (`openclaw health` should return ok)
- Whatever LLM provider your OpenClaw uses configured under `agents.defaults.model`

Quickest way to verify the host machine is set up is the doctor, which the
shipped CLI exposes and which you can run against the dev source too:

```bash
pnpm cli doctor             # same checks the published `notfair-cmo doctor` runs
```

## Dev loop

```bash
pnpm dev          # next dev --turbopack on port 3326 (avoids the 3000 prod default)
pnpm typecheck    # tsc --noEmit
pnpm lint         # next lint
pnpm build        # next build + scripts/copy-standalone-assets.mjs (npm-tarball-ready)
pnpm cli          # tsx bin/cli.ts in dev (the published CLI is bin/cli.mjs)
```

`pnpm dev` is the day-to-day. The dev server points at the same
`~/.notfair-cmo/db.sqlite` as a globally installed `notfair-cmo` does, so if
you also run the published CLI on this machine, point one of them at a
different data dir to avoid stomping each other's state:

```bash
NOTFAIR_CMO_DATA_DIR=$PWD/.notfair-cmo-dev pnpm dev
```

`.notfair-cmo-dev/` is already gitignored.

To reset local state for a clean run, stop any running server and:

```bash
rm ~/.notfair-cmo/db.sqlite                    # blow away product state
rm -rf ~/.notfair-cmo/agents/                  # blow away agent workspaces
openclaw agents rm <agent-name>                # remove any orphaned agents
```

Migrations are forward-only (`src/server/db/migrations/00N_<name>.sql`,
mirrored into `src/server/db/migrations.ts`), so the next start re-creates
schema cleanly.

## Project shape

See `ARCHITECTURE.md`. Short version:
- Frontend: Next.js 16 App Router + React 19 + Tailwind 4 + shadcn/ui (zinc palette, Inter font)
- Backend: Next.js server actions + SQLite (better-sqlite3) + subprocess wrapper around `openclaw` + pooled WebSocket client into OpenClaw's gateway
- AI SDK v4 today (the `ai` package + `@ai-sdk/{anthropic,openai}` v1) — v6 migration tracked in PLAN.md
- We don't host an MCP server; agents talk to third-party MCP servers (e.g. NotFair Google Ads) that OpenClaw connects to. Connections page is the UI for that.

## Adding a feature

1. Open an issue describing the user-facing change (the *what* and *why*).
2. Branch off `main`.
3. Build it. Keep modules small. shadcn primitives over custom CSS.
4. Run `pnpm typecheck && pnpm lint && pnpm build`. All three must pass.
5. If you're touching cron / agent / approvals / OAuth / MCP flows, exercise it end-to-end against a real OpenClaw install — `scripts/e2e-provision.ts` is a starting point for spinning up a fresh project + agents from a script.
6. Update README / ARCHITECTURE if behavior changed.
7. Open a PR. Describe what you changed and how to verify.

## Module conventions

- **Server-only modules** live in `src/server/`. Anything in there can use `node:*` modules + native deps.
- **Client components**: start the file with `"use client";`.
- **Server actions**: `"use server";`. Throw on validation failure (form actions) or return discriminated `{ ok: true, ... } | { ok: false, error }` (programmatic).
- **Database access**: only via helpers in `src/server/db/`. Don't reach for `getDb()` from a component or route.
- **OpenClaw access**: only via helpers in `src/server/openclaw/`. Don't shell out to `openclaw` directly from a route; don't open a fresh gateway WS — use `gateway-client.ts` (it's pooled).
- **Slugs**: only via `src/lib/slug.ts`. Reserved words checked.
- **Types**: shared types go in `src/types/`. Server-only types stay near their server module.

## Style

- TypeScript strict mode. No `any` unless interfacing with untyped externals.
- Prefer named exports. Default exports only for Next.js pages/layouts/route handlers.
- shadcn/ui defaults — no custom color palette, no custom typography, no decorative blobs. The zinc neutral palette is the brand for V1.
- No comments unless the *why* is non-obvious. Identifiers do the explaining; PR descriptions carry the context.

## Commits + PRs

- One logical change per commit. Subject line in active voice (`add`, `fix`, `wire`, `remove`) and conventional-commit prefix when natural (`feat:`, `fix:`, `perf:`, `build:`, `feat(chat):`). Look at `git log` — recent history is the template.
- End every commit with the Paperclip co-author trailer (this is how the founding engineer + future contributors are credited):

  ```
  Co-Authored-By: Paperclip <noreply@paperclip.ing>
  ```

- Never bypass hooks (`--no-verify`), never skip signing, never force-push without an explicit ask.
- Don't commit secrets. If a `.env`, OAuth token, or API key shows up in a diff, stop and fix the diff before pushing.

## Known lint noise

`pnpm lint` currently reports a handful of React-19 strictness warnings
(`react-hooks/set-state-in-effect`, `react-hooks/purity`,
`react-hooks/static-components`) that were not surfaced by Next 15's
`next lint`. None of them are runtime bugs — they flag patterns React 19
wants migrated (set-state-in-effect → derived state or `key` resets;
`Math.random` / `Date.now` in render → memoize or move outside render).
Tracked for cleanup before broad public push. New code should not add to
the list — if you hit one, fix it in the same PR.

## Testing

V1 doesn't ship a test suite (intentionally — we validated end-to-end against a real OpenClaw install instead of writing mocks). Test infrastructure lands in V1.1 along with the eval harness.

If you want to add tests now: Vitest for unit, Playwright for E2E. Mock OpenClaw at the subprocess wrapper level (`src/server/openclaw/cli.ts`) and the gateway WS at `gateway-client.ts`.

## License

By contributing, you agree your contributions are licensed under MIT.
