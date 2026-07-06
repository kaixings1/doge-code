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
Follow teams/fractalmind-ai-maintenance.md 工作流
EOF
```

## 备注

- 需要 `tmux` and `python3`.
- Agents are configured under an `agents/` directory (see the repo for examples).

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
