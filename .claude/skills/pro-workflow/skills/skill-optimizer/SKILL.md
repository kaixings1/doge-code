---
name: skill-optimizer
description: "Pro Workflow\Skills\Skill Optimizer — Pro Workflow\Skills\Skill Optimizer 相关功能和最佳实践"
---

# Skill Optimizer

Train an existing SKILL.md the way a deep-learning optimizer trains weights: via rollouts, gradient-like reflections, validation-gated acceptance. No model retraining; only the skill markdown changes.

## 何时使用

在以下情况下使用此技能：
- pro-workflow 技能已积累了 8 条以上的学习规则
- 用户报告该技能"变得臃肿"或"规则不断重复"
- 用户希望在多个会话中进行离线、预算限制的改进

Do not use when:
- Skill has fewer than 8 trajectories (nothing to learn from)
- The user wants real-time edits (this is offline, single-shot)
- No `ANTHROPIC_API_KEY` (or equivalent provider key) is available

## Architecture (mirrors SkillOpt's six-stage loop)

```text
rollout      pull recent learnings from SQLite (existing learn-rule rows)
reflect      optimizer LLM analyzes a minibatch, proposes add/delete/replace patches
aggregate    vote-merge patches across minibatches
select       clip by LR budget (default: 3 adds, 2 deletes, 3 replaces per step)
update       apply selected patches to a candidate skill content
evaluate     evaluator LLM scores candidate against held-out validation items
gate         accept candidate only if weighted score >= current + acceptThreshold
slow update  at epoch boundary, consolidate accepted edits into a coherent rewrite
```

Failed candidates are stored in a rejection buffer and fed back to the next reflect step so the optimizer doesn't propose the same patch twice.

## Run it

```bash
/skill-optimize <slug> [options]
```

Options (all optional; sensible defaults shown):

| Flag | Default | Notes |
|---|---|---|
| `--epochs N` | 3 | Outer loop count |
| `--batch-size N` | 8 | Trajectories per minibatch |
| `--minibatches N` | 2 | Minibatches per epoch |
| `--holdout N` | 6 | Validation items reserved (max ~25% of trajectories) |
| `--budget-usd X` | 0.50 | Hard cap; loop aborts when spent |
| `--optimizer-model M` | `claude-sonnet-4-6` | Reflect + slow-update model |
| `--evaluator-model M` | `claude-haiku-4-5-20251001` | Gate model (cheaper) |
| `--max-adds N` | 3 | LR budget per step |
| `--max-deletes N` | 2 | |
| `--max-replaces N` | 3 | |
| `--accept-threshold X` | 0.0 | Minimum score delta to accept candidate |
| `--max-skill-tokens N` | 2000 | Hard cap on candidate length |
| `--slow-every N` | 2 | Epochs between consolidation passes |
| `--json` | off | Machine-readable output |

Kill switch: `touch ~/.pro-workflow/STOP` aborts the loop between steps.

## 输出

- Candidate accepted → SKILL.md overwritten, hash stamp appended in HTML comment
- Run details persist in `optimization_runs`, `optimization_candidates`, `optimization_patches`, `optimization_rejections`
- Validation set persists in `optimization_validation` (reusable across runs)

Inspect after:

```bash
sqlite3 ~/.pro-workflow/data.db "SELECT id, skill_slug, initial_score, best_score, accepted_steps, rejected_steps, spent_usd FROM optimization_runs ORDER BY id DESC LIMIT 5"
```

## 规则

- Validation set is frozen at run start. Never re-derive from new corrections mid-run.
- One candidate per step. No parallel branches.
- Slow-update output is itself a candidate; it must pass the gate to replace the best.
- The optimizer LLM and evaluator LLM may be different models. Mixing a strong optimizer with a cheap evaluator is the SkillOpt-recommended config.
- If `spent_usd >= budget_usd` at any step boundary, the loop ends with `stopped_reason="budget exhausted"`.
- Patches whose anchor is no longer present in the skill (because a prior patch in the same step removed it) are recorded as rejected with reason `anchor_missing`.

## Provenance

Inspired by Microsoft SkillOpt (arXiv:2605.23904). The six-stage rollout/reflect/aggregate/select/update/evaluate pipeline, LR budget, rejection buffer, and slow / meta update mechanics are adapted to pro-workflow's existing SQLite + learn-rule data plane. No SkillOpt code is reused. "ReflACT" is not a SkillOpt term and is not used here; the loop is referred to by stage names only.
