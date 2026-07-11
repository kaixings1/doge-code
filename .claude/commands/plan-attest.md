---
description: "使用 SHA-256 验证锁定当前 task_plan.md 内容。如果文件与验证哈希不一致，钩子将拒绝注入计划内容，阻止静默篡改。使用 --show 打印存储的哈希，--clear 移除验证。v2.37.0 起可用。"
disable-model-invocation: true
allowed-tools: "Bash"
---

为当前计划运行计划认证助手。

步骤：
1. 解析当前计划：优先使用 `${PLAN_ID}` 环境变量，然后是 `.planning/.active_plan`，然后是最新的 `.planning/<dir>/`，最后是遗留的 `./task_plan.md`。
2. 计算已解析的 `task_plan.md` 的 SHA-256。
3. 将十六进制摘要写入 `.planning/<active-plan>/.attestation`（并行计划模式）或 `./.plan-attestation`（遗留模式）。
4. 使用短哈希（前 12 个十六进制字符）和存储路径向用户确认。

实现：
- 在 Linux/macOS/Git Bash 上：`sh ${CLAUDE_PLUGIN_ROOT}/scripts/attest-plan.sh`
- 在 Windows PowerShell 上：`& "$env:USERPROFILE\.claude\skills\planning-with-files\scripts\attest-plan.ps1"`

标志：
- `--show` — 打印当前存储的哈希及其位置。
- `--clear` — 移除认证（重新开放计划以自由编辑）。

运行此命令后，每次 UserPromptSubmit 和 PreToolUse 钩子触发时都会将 `task_plan.md` 与存储的哈希进行比较。如果它们不一致，钩子会输出 `[计划被篡改 — 阻止注入]` 而不是将计划内容输入模型。每当你有意编辑并重新批准计划时，重新运行 `/plan-attest`。
