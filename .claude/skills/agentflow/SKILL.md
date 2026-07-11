---
name: AgentFlow 开发流水线
description: "通过你的看板（Asana、GitHub Projects、Linear）编排自主 AI 开发流水线。管理多工作节点 Claude Code 调度、确定性质量门、对抗性审查、每任务成本跟踪和防崩溃流水线执行。"
risk: safe
source: community
date_added: "2026-04-02"
---

# AgentFlow

## 概述

AgentFlow turns your existing Kanban board into a fully autonomous AI development pipeline. Instead of building custom orchestration infrastructure, it treats your project management tool (Asana, GitHub Projects, Linear) as a distributed state machine — tasks move through stages, AI agents read and write state via comments, and humans intervene through the same UI they already use.

The result is complete pipeline observability from your phone, free crash recovery (state lives in your PM tool, not in memory), and human override at any point by dragging a card.

## 使用场景 This Skill

- Use when you need to orchestrate multiple Claude Code workers across a full development lifecycle (build, review, test, integrate)
- Use when you want deterministic quality gates (tsc/eslint/tests) before AI review on AI-generated code
- Use when you want full pipeline visibility from your Kanban board or phone
- Use when running a solo or team project that needs autonomous task dispatch with cost tracking
- Use when you need crash-proof orchestration that survives 会话 restarts

## 核心概念

### 7-Stage Kanban Pipeline

Tasks flow through: Backlog, Research, Build, Review, Test, Integrate, Done. Each stage has specific gates. The Kanban board IS the orchestration layer — no separate database, no message queue, no custom infrastructure.

### Stateless Orchestrator

A crontab-driven one-shot sweep runs every 15 minutes. No daemon, no 会话 dependency. If it crashes, the next sweep picks up where it left off because all state lives in your PM tool.

### Deterministic Before Probabilistic

Hard gates (tsc + eslint + tests) run before any AI review, catching roughly 60% of issues at near-zero cost. AI review comes after, as a second layer.

### Adversarial Review

A different AI agent reviews code and must list 3 things wrong before deciding to pass. This prevents rubber-stamp approvals.

### Transitive Priority Dispatch

Tasks that unblock the most downstream work get built first, automatically computing the critical path.

## Skills / Commands

### `/spec-to-board`
Decomposes a SPEC.md into atomic tasks on your Kanban board with dependencies mapped.

### `/sdlc-orchestrate`
Dispatches tasks to workers based on transitive priority and conflict detection. Runs as a crontab sweep.

### `/sdlc-worker --slot <N>`
Runs a worker in a terminal slot that picks up tasks, builds code, and creates PRs. Run 3-4 workers in parallel.

### `/sdlc-health`
Real-time pipeline status dashboard showing current stage, assigned agent, retry count, and accumulated cost for every task.

### `/sdlc-stop`
Graceful shutdown: active workers finish their current task, unstarted tasks return to Backlog.

## 分步指南

### 1. Write Your Spec

Create a `SPEC.md` for your project describing what you want to build.

### 2. Decompose Into Tasks

```
claude -p "/spec-to-board"
```

This reads your SPEC.md, decomposes it into atomic tasks, maps dependencies, and creates them on your Kanban board.

### 3. Start Workers

Open 3-4 terminal windows, each as a worker slot:

```bash
# Terminal 2 — Builder
claude -p "/sdlc-worker --slot T2"

# Terminal 3 — Builder
claude -p "/sdlc-worker --slot T3"

# Terminal 4 — Reviewer
claude -p "/sdlc-worker --slot T4"

# Terminal 5 — Tester
claude -p "/sdlc-worker --slot T5"
```

### 4. Start the Orchestrator

```bash
# Add to crontab (runs every 15 minutes)
crontab -e
# Add: */15 * * * * ~/.claude/sdlc/agentflow-cron.sh >> /tmp/agentflow-orchestrate.log 2>&1
```

### 5. Monitor and Intervene

Open your Kanban board on your phone. Watch tasks flow through the pipeline. Drag any card to "Needs Human" to intervene. Run `/sdlc-health` for a terminal dashboard.

### 6. Stop the Pipeline

```
claude -p "/sdlc-stop"
```

## 质量门

Each stage enforces specific gates before promotion:

- **Build to Review**: `tsc` + `eslint` + `npm test` must all pass (deterministic)
- **Review to Test**: Adversarial reviewer must list 3 issues before passing
- **Test to Integrate**: 80% coverage threshold on new files
- **Integrate to Done**: Full test suite on main after merge; auto-reverts on failure

## Cost Tracking

Per-task cost tracking with stage ceilings (Sonnet defaults):

- Research: ~$0.10
- Build: ~$0.40
- Review: ~$0.10
- Test: ~$0.05
- Integrate: ~$0.03

Automatic guardrails: warning at $3/$8, hard stop at $10/$20 (Sonnet/Opus) with human escalation.

## Safety and Recovery

- **Auto-revert**: 集成 failures trigger `git revert` (new commit, never force-push)
- **Blocked tasks**: After 2 failed attempts, tasks escalate to human review
- **Dead agent detection**: Heartbeat every 5 min, reassign after 10 min timeout
- **Graceful shutdown**: `/sdlc-stop` drains workers, returns unstarted tasks to backlog
- **范围 creep detection**: PR diff files compared against predicted files list
- **Spec drift detection**: SHA-256 hash comparison catches requirement changes mid-sprint

## 安装

```bash
# Clone the repo
git clone https://github.com/UrRhb/agentflow.git

# Copy skills and prompts to your Claude Code config
cp -r agentflow/skills/* ~/.claude/skills/
cp -r agentflow/prompts/* ~/.claude/sdlc/prompts/
cp agentflow/conventions.md ~/.claude/sdlc/conventions.md
```

Or install as a Claude Code plugin:

```bash
/plugin marketplace add UrRhb/agentflow
/plugin install agentflow
```

## 最佳实践

- Do: Write a clear SPEC.md before running `/spec-to-board`
- Do: Start with 3-4 workers for a typical project
- Do: Monitor from your Kanban board and drag cards to "Needs Human" when needed
- Do: Review LEARNINGS.md periodically — it captures common failure patterns
- Don't: Skip the deterministic quality gates — they catch most issues cheaply
- Don't: Force-push to main — AgentFlow uses `git revert` for safety
- Don't: Run more workers than your project's parallelism supports

## 故障排除

### Problem: Worker appears stuck or dead
**Symptoms:** Task card hasn't moved in 15+ minutes, no new comments
**Solution:** The orchestrator detects dead agents via heartbeat and reassigns after 10 minutes. If the issue persists, run `/sdlc-health` to check status and manually drag the card back to Backlog.

### Problem: Cost guardrail triggered
**Symptoms:** Task moved to "Needs Human" with COST:CRITICAL tag
**Solution:** Review the task's comment thread for accumulated context. Decide whether to increase the budget, simplify the task, or split it into smaller pieces.

### Problem: 集成 test failure after merge
**Symptoms:** Task auto-reverted from main
**Solution:** The auto-revert preserves main stability. Check the task's retry context in comments, which carries what was tried and what failed. The next worker assigned will use this context.

## 相关 Skills

- `@brainstorming` - Use before AgentFlow to design your SPEC.md
- `@writing-plans` - Complements spec writing for task decomposition
- `@test-driven-development` - Works well with AgentFlow's quality gates
- `@subagent-driven-development` - Alternative 方法 to multi-agent coordination

## Additional 资源

- [AgentFlow Repository](https://github.com/UrRhb/agentflow)
- [架构 Documentation](https://github.com/UrRhb/agentflow/blob/main/docs/architecture.md)
- [Gap Registry (45 failure modes)](https://github.com/UrRhb/agentflow/blob/main/docs/gap-registry.md)
- [入门指南 Guide](https://github.com/UrRhb/agentflow/blob/main/docs/getting-started.md)

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
