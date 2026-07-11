---
name: gsd:ingest-docs
从仓库中现有的 ADR、PRD、SPEC 和文档启动或合并 .planning/ 设置。
argument-hint: "[path] [--mode new|merge] [--manifest <file>] [--resolve auto|interactive]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
---

<objective>
从多个预先存在的规划文档——ADR、PRD、SPEC、DOC——一次性构建完整的 `.planning/` 设置（或合并到现有设置中）。

- **全新引导**（`--mode new`，当 `.planning/` 不存在时的默认行为）：从综合文档内容生成 PROJECT.md + REQUIREMENTS.md + ROADMAP.md + STATE.md，将最终生成委托给 `gsd-roadmapper`。
- **合并到现有**（`--mode merge`，当 `.planning/` 存在时的默认行为）：追加从摄入文档中推导的阶段和需求；硬阻断与现有锁定决策的任何矛盾。

使用优先级规则 `ADR > SPEC > PRD > DOC`（可通过清单覆盖）自动综合大多数冲突。在 `.planning/INGEST-CONFLICTS.md` 中将未解决的案例分为三类：自动解决、竞争变体、未解决阻断器。当存在未解决的矛盾时，共享冲突引擎的 BLOCKER 关卡阻止任何目标文件被写入。

**输入：** 目录约定发现（`docs/adr/`、`docs/prd/`、`docs/specs/`、`docs/rfc/`、根级别 `{ADR,PRD,SPEC,RFC}-*.md`），或显式的 `--manifest <file>` YAML，列出每个文档的 `{path, type, precedence?}`。

**v1 约束：** 每次调用硬限制 50 个文档；`--resolve interactive` 保留给未来版本。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/ingest-docs.md
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/references/gate-prompts.md
@~/.claude/get-shit-done/references/doc-conflict-engine.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute the ingest-docs workflow end-to-end. Preserve all approval gates (discovery, conflict report, routing) and the BLOCKER safety rule.
</process>
