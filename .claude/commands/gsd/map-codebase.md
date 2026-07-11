---
name: gsd:map-codebase
使用并行映射代理分析代码库以生成 .planning/codebase/ 文档。
argument-hint: "[--fast [--focus tech|arch|quality|concerns]] [--query <term>|status|diff|refresh] [area]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Agent
requires: [config, new-project, plan-phase]
---

<objective>
使用并行的 gsd-codebase-mapper 智能体分析现有代码库，生成结构化的代码库文档。

每个映射器智能体探索一个关注区域并**直接将文档写入** `.planning/codebase/`。编排器仅接收确认，保持上下文使用最小化。

输出：包含 7 个关于代码库状态的结构化文档的 .planning/codebase/ 文件夹。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/map-codebase.md
</execution_context>

<flags>
- **--fast**：轻量级扫描模式——生成一个映射器智能体而非四个。接受可选的 `--focus` 值：`tech`、`arch`、`quality`、`concerns` 或 `tech+arch`（默认）。比完整映射更快且上下文消耗更低。
- **--query**：代码库智能查询模式。子命令：`query <term>`、`status`、`diff`、`refresh`。需要在配置中启用 intel（`intel.enabled: true`）。query/status/diff 内联运行；refresh 生成智能体。
- **（无标志）**：完整并行映射——生成 4 个映射器智能体以生成全部 7 个代码库文档。
</flags>

<context>
Arguments: $ARGUMENTS

Parse the first token of $ARGUMENTS:
- If it is `--fast`: strip the flag, run the scan workflow (passing remaining args including optional --focus).
- If it is `--query`: strip the flag, run the intel workflow (passing remaining args as the subcommand).
- Otherwise: pass all of $ARGUMENTS as focus area to the map-codebase workflow.

**Load project state if exists:**
Check for .planning/STATE.md - loads context if project already initialized

**This command can run:**
- Before /gsd:new-project (brownfield codebases) - creates codebase map first
- After /gsd:new-project (greenfield codebases) - updates codebase map as code evolves
- Anytime to refresh codebase understanding
</context>

<when_to_use>
**Use map-codebase for:**
- Brownfield projects before initialization (understand existing code first)
- Refreshing codebase map after significant changes
- Onboarding to an unfamiliar codebase
- Before major refactoring (understand current state)
- When STATE.md references outdated codebase info

**Skip map-codebase for:**
- Greenfield projects with no code yet (nothing to map)
- Trivial codebases (<5 files)
</when_to_use>

<process>
1. Check if .planning/codebase/ already exists (offer to refresh or skip)
2. Create .planning/codebase/ directory structure
3. Spawn 4 parallel gsd-codebase-mapper agents:
   - Agent 1: tech focus → writes STACK.md, INTEGRATIONS.md
   - Agent 2: arch focus → writes ARCHITECTURE.md, STRUCTURE.md
   - Agent 3: quality focus → writes CONVENTIONS.md, TESTING.md
   - Agent 4: concerns focus → writes CONCERNS.md
4. Wait for agents to complete, collect confirmations (NOT document contents)
5. Verify all 7 documents exist with line counts
6. Commit codebase map
7. Offer next steps (typically: /gsd:new-project or /gsd:plan-phase)
</process>

<success_criteria>
- [ ] .planning/codebase/ directory created
- [ ] All 7 codebase documents written by mapper agents
- [ ] Documents follow template structure
- [ ] Parallel agents completed without errors
- [ ] User knows next steps
</success_criteria>
