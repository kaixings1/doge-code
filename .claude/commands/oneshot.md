---
description: 研究工单并启动规划会话
---

1. 使用 SlashCommand() 调用 /ralph_research，传入给定的工单编号
2. 使用 `npx humanlayer launch --model opus --dangerously-skip-permissions --dangerously-skip-permissions-timeout 14m --title "plan ENG-XXXX" "/oneshot_plan ENG-XXXX"` 启动新会话
