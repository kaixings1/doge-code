---
name: agent-manager-skill
description: "通过 tmux 会话管理多个本地 CLI 代理（启动/停止/监控/分配），支持 cron 友好的调度。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Agent Manager Skill

## 使用场景
使用此技能当 you need to:

- run multiple local CLI agents in parallel (separate tmux sessions)
- start/stop agents and tail their logs
- assign tasks to agents and monitor output
- schedule recurring agent work (cron)

## 前提条件

Install `agent-manager-skill` in your workspace:

```bash
git clone https://github.com/fractalmind-ai/agent-manager-skill.git
```

## Common commands

```bash
python3 agent-manager/scripts/main.py doctor
python3 agent-manager/scripts/main.py list
python3 agent-manager/scripts/main.py start EMP_0001
python3 agent-manager/scripts/main.py monitor EMP_0001 --follow
python3 agent-manager/scripts/main.py assign EMP_0002 <<'EOF'
Follow teams/fractalmind-ai-maintenance.md Workflow
EOF
```

## 备注

- 需要 `tmux` and `python3`.
- Agents are configured under an `agents/` directory (see the repo for examples).

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
