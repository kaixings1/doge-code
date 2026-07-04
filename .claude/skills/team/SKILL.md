---
name: team
description: "Team — 团队协作技能。生成 N 个协调的代理，在共享任务列表上协作。支持执行器、调试器、设计者、Codex、Gemini 等代理类型。包含团队计划→PRD→执行→验证→修复的流水线。"
argument-hint: "[N:代理类型] [ralph] <任务描述>"
aliases: []
level: 4
---

# Team Skill

Spawn N coordinated agents working on a shared task list using Claude Code's implicit agent team. Claude Code 2.1.178+ removed native `TeamCreate`/`TeamDelete`; with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, each session has one implicit team and teammates are spawned directly with the Agent/Task tool using distinct `name` values. This skill still preserves OMC's legacy tmux/CLI worker orchestration where documented (`omc team` / `/omc-teams`).

The `swarm` compatibility alias was removed in #1131.

## Usage

```
/oh-my-claudecode:team N:agent-type "task description"
/oh-my-claudecode:team "task description"
/oh-my-claudecode:team ralph "task description"
```

### Parameters

- **N** - Number of teammate agents (1-20). Optional; defaults to auto-sizing based on task decomposition.
- **agent-type** - OMC agent to spawn for the `team-exec` stage (e.g., executor, debugger, designer, codex, gemini, antigravity). Optional; defaults to stage-aware routing. Use `codex` to spawn Codex CLI workers, `gemini` for Gemini CLI workers (enterprise/API-key tier), or `antigravity` for Antigravity CLI (`agy`) workers (Google's successor to the Gemini CLI; requires respective CLIs installed). See Stage Agent Routing below.
- **task** - High-level task to decompose and distribute among teammates
- **ralph** - Optional modifier. When present, wraps the team pipeline in Ralph's persistence loop (retry on failure, architect verification before completion). See Team + Ralph Composition below.

### Examples

```bash
/team 5:executor "fix all TypeScript errors across the project"
/team 3:debugger "fix build errors in src/"
/team 4:designer "implement responsive layouts for all page components"
/team "refactor the auth module with security review"
/team ralph "build a complete REST API for user management"
# With Codex CLI workers (requires: npm install -g @openai/codex)
/team 2:codex "review architecture and suggest improvements"
# With Gemini CLI workers (requires: npm install -g @google/gemini-cli)
/team 2:gemini "redesign the UI components"
# With Antigravity CLI workers (requires: install per https://antigravity.google)
/team 2:antigravity "redesign the UI components"
# Mixed: Codex for backend analysis, Gemini/Antigravity for frontend (use /ccg instead for this)
```

## Architecture

```
User: "/team 3:executor fix all TypeScript errors"
              |
              v
      [TEAM ORCHESTRATOR (Lead)]
              |
              +-- Use the session's implicit Claude Code team
              |       -> no TeamCreate call; lead remains current session
              |
              +-- Analyze & decompose task into subtasks
              |       -> explore/architect produces subtask list
              |
              +-- Create task list entries from the implementation plan
              |       -> TODO/task entries #1, #2, #3 with dependencies
              |
              +-- Update task-list entries (pre-assign owners)
              |       -> task #1 owner=worker-1, etc.
              |
              +-- Task(name="worker-1") x 3
              |       -> spawns teammates into the team
              |
              +-- Monitor loop
              |       <- teammate messages (auto-delivered by the active team surface)
              |       -> task-list/TodoWrite review for progress
              |       -> message teammates through the active team surface to unblock/coordinate
              |
              +-- Completion
                      -> request shutdown from each teammate through the active team surface
                      <- shutdown acknowledgement from teammates
                      -> clear OMC team state (no TeamDelete call)
                      -> rm .omc/state/team-state.json
```

**Native Claude Code team model (2.1.178+):**

```
- No per-team ~/.claude/teams/<name>/ directory is created by this skill.
- No TeamCreate/TeamDelete calls are available.
- `team_name` is accepted by native Claude Code only as ignored legacy metadata; do not rely on it for routing.
- Spawn teammates directly via Agent/Task with `name="worker-N"`.
```

## Goal Workflow Relationship

Team is the OMC authority for parallel, staged execution. Use the deterministic conflict policies `refuse`, `adopt_existing`, and `artifact_only` rather than non-deterministic warning handling. If a task mentions Claude Code `/goal`, Ralph, UltraQA, or artifact-only Ultragoal, keep Team as the primary loop authority unless the leader explicitly hands off. Use `/goal` only as a documented native Claude Code handoff target or as visible evidence from the lead session; do not claim the `/goal` evaluator independently runs commands, reads files, or replaces `team-verify` / `team-fix`. Artifact-only Ultragoal references should be treated as durable goal ledger/checkpoint/evidence artifacts, not as worker execution by themselves.

## Staged Pipeline (Canonical Team Runtime)

Team execution follows a staged pipeline:

`team-plan -> team-prd -> team-exec -> team-verify -> team-fix (loop)`

### Stage Agent Routing

Each pipeline stage uses **specialized agents** -- not just executors. The lead selects agents based on the stage and task characteristics.

| Stage           | Required Agents                     | Optional Agents                                                                                         | Selection Criteria                                                                                                                                                                                |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| * *团队计划* * | “探索” （俳句）、“规划师” （作品） | “分析师” （作品）、“建筑师” （作品）