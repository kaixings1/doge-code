---
description: "/plan 的简短别名。启动 Manus 风格的文件规划：task_plan.md、findings.md、progress.md。v3.0.0 起可用。"
---

调用 planning-with-files:planning-with-files 技能，并严格按照其指示执行。将参数视为要规划的任务。

如果当前项目目录中不存在以下三个规划文件，请创建它们：
- task_plan.md — 用于阶段、进度和决策
- findings.md — 用于研究和发现
- progress.md — 用于会话日志

如果用户要求自主模式或门控模式（例如 "autonomous"、"gated"、"不要停直到完成"），则使用 `init-session.sh --autonomous` 或 `init-session.sh --gated` 初始化；否则按默认方式初始化。

然后引导用户完成规划工作流。
