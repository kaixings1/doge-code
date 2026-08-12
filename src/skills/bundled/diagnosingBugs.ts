import { registerBundledSkill } from '../bundledSkills.js'

const BUG_DIAGNOSE_PROMPT = `# Diagnosing Bugs

A discipline for hard bugs. Skip phases only when explicitly justified.

When exploring the codebase, read CONTEXT.md (if it exists) to get a clear mental model of the relevant modules, and check ADRs in the area you're touching.

## Phase 1 — Build a feedback loop

**This is the skill.** Everything else is mechanical. If you have a tight pass/fail signal for the bug — one that goes red on _this_ bug — you will find the cause; bisection, hypothesis-testing, and instrumentation all just consume it. If you don't have one, no amount of staring at code will save you.

Spend disproportionate effort here. **Be aggressive. Be creative. Refuse to give up.**

### Ways to construct one — try them in roughly this order

1. **Failing test** at whatever seam reaches the bug — unit, integration, e2e.
2. **Curl / HTTP script** against a running dev server.
3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot.
4. **Headless browser script** (Playwright / Puppeteer) — drives the UI, asserts on DOM/console/network.
5. **Replay a captured trace.** Save a real network request / payload / event log to disk; replay it through the code path in isolation.
6. **Throwaway harness.** Spin up a minimal subset of the system (one service, mocked deps) that exercises the bug code path with a single function call.
7. **Property / fuzz loop.** If the bug is "sometimes wrong output", run 1000 random inputs and look for the failure mode.
8. **Bisection harness.** If the bug appeared between two known states (commit, dataset, version), automate "boot at state X, check, repeat" so you can git bisect run it.
9. **Differential loop.** Run the same input through old-version vs new-version (or two configs) and diff outputs.
10. **HITL bash script.** Last resort. If a human must click, drive _them_ with a script so the loop is still structured.

### Tighten the loop

Treat the loop as a product. Once you have a loop, **tighten** it:
- Can I make it faster? (Cache setup, skip unrelated init, narrow the test scope.)
- Can I make the signal sharper? (Assert on the specific symptom, not "didn't crash".)
- Can I make it more deterministic? (Pin time, seed RNG, isolate filesystem, freeze network.)

### Completion criterion — a tight loop that goes red

Phase 1 is done when:
- **Red-capable** — it drives the actual bug code path and asserts the user's exact symptom
- **Deterministic** — same verdict every run
- **Fast** — seconds, not minutes
- **Agent-runnable** — you can run it unattended

## Phase 2 — Reproduce + minimise

Run the loop. Watch it go red — the bug appears.

Confirm:
- The loop produces the failure mode the user described
- The failure is reproducible across multiple runs
- You have captured the exact symptom

Then shrink the repro to the smallest scenario that still goes red. Cut inputs, callers, config, data, and steps one at a time, re-running the loop after each cut.

## Phase 3 — Hypothesise

Generate 3-5 ranked hypotheses before testing any of them.

Each hypothesis must be falsifiable: state the prediction it makes.
Format: "If X is the cause, then changing Y will make the bug disappear / changing Z will make it worse."

Show the ranked list to the user before testing.

## Phase 4 — Instrument

Each probe must map to a specific prediction from Phase 3. Change one variable at a time.

1. Debugger / REPL inspection if the env supports it.
2. Targeted logs at the boundaries that distinguish hypotheses.
3. Never "log everything and grep".

Tag every debug log with a unique prefix, e.g. [DEBUG-a4f2].

## Phase 5 — Fix + regression test

1. Turn the minimised repro into a failing test.
2. Watch it fail.
3. Apply the fix.
4. Watch it pass.
5. Re-run the Phase 1 feedback loop against the original scenario.

## Phase 6 — Cleanup + post-mortem

- Original repro no longer reproduces
- Regression test passes
- All debug instrumentation removed
- Throwaway prototypes deleted
- The hypothesis that turned out correct is stated in the commit / PR message

Then ask: what would have prevented this bug?
`

export function registerDiagnosingBugsSkill(): void {
  registerBundledSkill({
    name: 'diagnosing-bugs',
    description: '硬 Bug 和性能回退的系统化诊断循环。包含构建反馈回路、重现最小化、假设检验、修复和回归测试的完整流程。',
    whenToUse: '当用户说 "diagnose"/"debug this"，或报告某些东西崩溃/抛出异常/失败/缓慢时使用。',
    argumentHint: '❌ 错误: <要诊断的问题描述或错误信息>',
    userInvocable: true,
    getPromptForCommand(args) {
      let prompt = BUG_DIAGNOSE_PROMPT
      if (args.trim()) {
        prompt += '\n## 用户报告的问题\n\n' + args.trim()
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
