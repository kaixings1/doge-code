# Evals

Golden-case prompt evaluations for prompts that matter. Per the V1 ship gate in PLAN.md ("eval harness, light"), these are critical for surfaces where a silent prompt regression would degrade product behavior without any test failing.

## Running

```bash
pnpm eval
```

Requires `OPENAI_API_KEY` in env (or `~/.gstack/openai.json`). If absent, eval suites skip automatically — they never fail-by-not-running. The default `pnpm test` does NOT run evals; they live under `tests/evals/` and use `*.eval.ts` instead of `*.test.ts`.

## What's covered

| Eval file | What it checks | Decision |
|---|---|---|
| `cmo-first-turn.eval.ts` | When the CMO opens a chat session with `FIRST_TURN.md` present in its workspace, the first reply must reference a specific audit finding by name + dollar figure. With an empty-account `FIRST_TURN.md`, the reply must offer launch help. With no `FIRST_TURN.md`, the reply must NOT fabricate audit findings. | D15 + D19 |

## How the eval works

The CMO's production system prompt (from `src/server/agent-templates.ts`) is used unchanged. For each golden case:

1. The case JSON specifies whether `FIRST_TURN.md` is present + its content.
2. The eval simulates the workspace by prepending the file content to the system prompt with a clear marker. (In production the agent reads it via `exec cat FIRST_TURN.md`; the eval approximates by injecting the read result.)
3. The LLM is called with the system prompt and a minimal opening user message ("Hi") to elicit the first assistant turn.
4. The reply is checked against `must_contain_any_of` (regex/string match — permissive enough to absorb wording variation) and `must_not_contain` (strict — used to catch fabrication when no audit context is present).

If a case fails, the eval prints the full reply for inspection. Iterate on the system prompt in `agent-templates.ts` until the case passes again.

## When to add a new eval case

- A new product surface introduces a prompt that, if regressed, would silently degrade behavior.
- A bug report turns out to be a prompt-following failure — capture it as a golden case so the regression doesn't recur.

## Caveats

- Evals are inherently non-deterministic. Use generous `must_contain_any_of` (alternatives are forgiving) and strict `must_not_contain` (only block clear violations).
- Cost: each case is ~1 LLM call. The full suite at V1 is ~3 calls = single-digit cents per run.
