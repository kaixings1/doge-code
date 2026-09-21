# Dead code — modules present in `src/` but never referenced

Measured: for each file, `grep -rl --include=*.js -F "<name>.js" src mcp bin` returned 0 hits.

## 1. `src/core/` modules with zero references (16)

| Module | Note |
|---|---|
| `src/core/engine-behavior.js` | test archived — never wired into `think()` |
| `src/core/engine-constructor.js` | test archived — never wired into `think()` |
| `src/core/engine-dispatcher.js` | test archived — never wired into `think()` |
| `src/core/engine-hook-points.js` | test archived — never wired into `think()` |
| `src/core/engine-initializer.js` | test archived — never wired into `think()` |
| `src/core/engine-state.js` | test archived — never wired into `think()` |
| `src/core/event-hooks.js` | test archived — never wired into `think()` |
| `src/core/hook-bus.js` | test archived — never wired into `think()` |
| `src/core/code-verifier.js` | no reference found; likely abandoned scaffolding |
| `src/core/config-hooks.js` | no reference found; likely abandoned scaffolding |
| `src/core/config-v2.js` | no reference found; likely abandoned scaffolding |
| `src/core/request-hooks.js` | no reference found; likely abandoned scaffolding |
| `src/core/route-whitelist.js` | no reference found; likely abandoned scaffolding |
| `src/core/module-registry.js` | no reference found; likely abandoned scaffolding |
| `src/core/stats-engine.js` | no reference found; likely abandoned scaffolding |
| `src/core/openalex-client.js` | no reference found; likely abandoned scaffolding |

## 2. What was done

- The 2 tests that can never pass (`engine-dispatcher`, `engine-hook-points`) were moved
  to `test/archive/dead-tests/`. The other 6 tests in this family still pass and are kept.
- The modules themselves were **not deleted**: removing them is irreversible and nothing
  here can prove no external consumer imports them.

## 3. To revive

1. Decide whether the module belongs in the engine at all.
2. Wire it (lazy registry + dispatch route), then move its test back from `test/archive/`.
3. If it is abandoned, delete the module and its test together — a module nobody calls is
   not capability, and the audit counted it as if it were.
