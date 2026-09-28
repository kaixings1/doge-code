---
description: 打开 Backlot 实时故事板——一个浏览器面板，在生产运行中实时展示管道阶段、脚本、场景规划和生成的素材。
argument-hint: [project-id (optional — defaults to the current/most recent project)]
---

Open the Backlot board for the requested project:

```bash
python -m backlot open $ARGUMENTS
```

- No argument → open the library view (all projects): `python -m backlot open`
- The command is idempotent: it starts the Backlot server if it isn't running, then opens the browser at the project's board.
- If the command fails, report it and continue with whatever the user asked — the board is an observer, never a blocker.
- The board derives everything from disk (`projects/<id>/` checkpoints, artifacts, assets, events). You never update the UI manually; keep checkpoints and artifacts honest per `skills/meta/checkpoint-protocol.md` and the board stays honest too.
