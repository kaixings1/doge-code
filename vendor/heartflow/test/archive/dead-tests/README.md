# Archived tests — target modules were deleted

These test files reference `src/` modules that no longer exist. They were moved here
rather than deleted so the intent and the assertions stay readable, but they are **not
executed**: `test/run-all.js` skips the `test/archive/` tree.

Each file below failed with `MODULE_NOT_FOUND` before archiving, which meant it
contributed a permanent failure to every test run without testing anything.

| Test file | Missing module |
|-----------|----------------|
| intuition-engine.test.js | `src/intuition/intuition-engine.js` |
| ethics-engine.test.js | `src/ethics/ethics-engine.js` |
| self-cognitive-engine.test.js | `src/self_cognitive/self-cognitive-engine.js` |
| humor-generator.test.js | `src/humor/humor-generator.js` |
| culture-engine.test.js | `src/culture/culture-engine.js` |
| desire-cognition.test.js | `src/emotion/desire-cognition.js` |
| end-to-end.test.js | `src/emotion/emotion-optimizer.js` (+2) |
| creativity-engine.test.js | `src/creativity/creativity-engine.js` |
| mind-wanderer.test.js | `src/consciousness/mind-wanderer.js` |
| empathy-responder.test.js | `src/emotion/empathy-responder.js` |
| world-knowledge.test.js | `src/knowledge/world-knowledge.js` |
| strategy-orchestrator.test.js | `src/cortex/self-evolution/strategy-orchestrator.js` |
| experience-distiller.test.js | `src/cortex/experience-distiller.js` |
| strategy-signal-map.test.js | `src/cortex/self-evolution/strategy-signal-map.js` |
| social-engine.test.js | `src/social/social-engine.js` |
| psychology/psychology-dialogue-engine.test.js | `src/psychology/psychology-dialogue-engine.js` |
| cortex/autopilot.test.js | `src/cortex/autopilot.js` |
| cortex/experience-validator.test.js | `src/cortex/experience-validator.js` |
| cortex/fewshot-calibrator.test.js | `src/cortex/fewshot-calibrator.js` |

## To revive one

1. Restore or rewrite the module under `src/`.
2. Move the test file back into `test/` (preserving its relative depth, so
   `require('../src/...')` resolves correctly).
3. Confirm it runs: `node test/<path>.test.js`.

Do not move a test back before its module exists — a test that cannot load is not
coverage, it is noise.
