---
name: local-build-reminder
description: "Local Build Reminder — Local Build Reminder 相关功能和最佳实践"
level: 1
---

# Local Build Reminder

**Always-on reminder for OMC fork development.** When OMC is running in local
mode (HUD shows `[OMC#X.Y.ZL]` with an `L` suffix), Claude Code loads compiled
JavaScript from `dist/` — NOT TypeScript source from `src/`. Edits to `.ts`
files are invisible to the running plugin until `npm run build` regenerates
`dist/`.

## When to invoke this skill

The AI should mention this reminder whenever **any of these** happens:

1. The user (or the AI itself) just edited `src/**/*.ts` in this repo.
2. The user asks "why isn't my change working?" / "I edited X but it does the same" after a TS edit.
3. The user is about to restart Claude Code and the working tree has TS edits with no rebuild.
4. The user runs an OMC command and expects new behavior tied to a TS edit.

## What to say

Surface one clear sentence followed by the exact command. Don't repeat the
reminder on every turn — once per "round" of TS editing is enough. Example:

> Heads up: you edited `src/...`. Run `npm run build` before restarting
> Claude Code — `dist/` won't reflect the change otherwise.

If multiple TS files were edited in a row, just remind once at the end.

## When NOT to remind

- The user only edited `.mjs` / `.cjs` / `.md` / `.json` — those load directly
  from disk, no build needed.
- The user is in a Claude Code session that isn't running OMC locally
  (no `L` in the HUD).
- A `tsc --watch` / `npm run dev:full` is already running in the background
  — those rebuild automatically on save.
- The user just asked an unrelated question; don't shoehorn the reminder
  into off-topic responses.

## File-type cheat sheet

| Path                           | Restart picks up edit? | Needs build? |
| ---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 35 MINUTES 02 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE