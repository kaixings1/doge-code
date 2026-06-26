---
name: projects
description: 列出已知项目及其直觉（instinct）统计数据
command: true
---

# 项目管理命令 (Projects Command)

列出项目注册表条目以及 continuous-learning-v2 中每个项目的直觉/观察（instinct/observation）计数。

## 实现 (Implementation)

使用插件根路径运行 instinct CLI：

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/scripts/instinct-cli.py" projects
```

或者如果未设置 `CLAUDE_PLUGIN_ROOT`（手动安装）：

```bash
python3 ~/.claude/skills/continuous-learning-v2/scripts/instinct-cli.py projects
```

## 用法 (Usage)

```bash
/projects
```

## 执行逻辑 (What to Do)

1. 读取 `~/.claude/homunculus/projects.json`
2. 为每个项目显示：
   - 项目名称（name）、ID（id）、根目录（root）、远程仓库（remote）
   - 个人直觉（Personal instinct）和继承直觉（inherited instinct）计数
   - 观察事件（Observation event）计数
   - 最后出现时间戳（Last seen timestamp）
3. 同时显示全局直觉（Global instinct）总量
