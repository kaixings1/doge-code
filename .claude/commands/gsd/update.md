---
name: gsd:update
更新 GSD 到最新版本并显示更新日志。
argument-hint: "[--sync | --reapply]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

<objective>
检查 GSD 更新，如果可用则安装，并显示更改内容。

路由到 update 工作流，它处理：
- 版本检测（本地 vs 全局安装）
- npm 版本检查
- 更新日志获取和展示
- 带有干净安装警告的用户确认
- 更新执行和缓存清理
- 重启提醒
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/update.md
</execution_context>

<flags>
- **--sync**：跨运行时根同步托管的 GSD 技能，使多运行时用户在更新后保持一致。运行 sync-skills 工作流（支持 --from、--to、--dry-run、--apply 标志）。
- **--reapply**：在 GSD 更新后重新应用本地修改。使用三方比较（原始基线、用户修改的备份、新安装的版本）合并用户自定义内容。运行 reapply-patches 工作流。
- **（无标志）**：标准更新——检查新版本、显示更新日志、安装。
</flags>

<process>
Parse the first token of $ARGUMENTS:
- If it is `--sync`: strip the flag, execute the sync-skills workflow (passing remaining args for --from/--to/--dry-run/--apply).
- If it is `--reapply`: strip the flag, execute the reapply-patches workflow.
- Otherwise: execute the update workflow end-to-end.

</process>

<execution_context_extended>
@~/.claude/get-shit-done/workflows/sync-skills.md
@~/.claude/get-shit-done/workflows/reapply-patches.md
</execution_context_extended>
