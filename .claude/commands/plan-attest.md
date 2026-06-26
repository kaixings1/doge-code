---
description: "使用 SHA-256 验证锁定当前 task_plan.md 内容。如果文件与验证哈希不一致，钩子将拒绝注入计划内容，阻止静默篡改。使用 --show 打印存储的哈希，--clear 移除验证。v2.37.0 起可用。"
disable-model-invocation: true
allowed-tools: "Bash"
---

Run the plan attestation helper for the active plan.

Steps:
1. Resolve the active plan: prefer `${PLAN_ID}` env var, then `.planning/.active_plan`, then newest `.planning/<dir>/`, then legacy `./task_plan.md`.
2. Compute the SHA-256 of the resolved `task_plan.md`.
3. Write the hex digest to `.planning/<active-plan>/.attestation` (parallel-plan mode) or `./.plan-attestation` (legacy mode).
4. Confirm to the user with the short hash (first 12 hex chars) and the storage path.

Implementation:
- On Linux/macOS/Git Bash: `sh ${CLAUDE_PLUGIN_ROOT}/scripts/attest-plan.sh`
- On Windows PowerShell: `& "$env:USERPROFILE\.claude\skills\planning-with-files\scripts\attest-plan.ps1"`

Flags:
- `--show` — print the currently stored hash and where it lives.
- `--clear` — remove the attestation (re-open the plan to free editing).

After running this command, every UserPromptSubmit and PreToolUse hook fire compares `task_plan.md` against the stored hash. If they diverge, the hook emits `[PLAN TAMPERED — injection blocked]` instead of feeding plan content into the model. Re-run `/plan-attest` whenever you intentionally edit and re-approve the plan.
