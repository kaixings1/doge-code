---
name: promote
description: 将项目级直觉（Instincts）提升至全局作用域
command: true
---

# 提升（Promote）命令

在 continuous-learning-v2 中，将项目级直觉（Project-scoped instincts）提升至全局作用域。

## 实现方法

使用插件根路径运行直觉命令行界面（Instinct CLI）：

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/scripts/instinct-cli.py" promote [instinct-id] [--force] [--dry-run]
```

如果未设置 `CLAUDE_PLUGIN_ROOT`（手动安装）：

```bash
python3 ~/.claude/skills/continuous-learning-v2/scripts/instinct-cli.py promote [instinct-id] [--force] [--dry-run]
```

## 使用方法

```bash
/promote                      # 自动检测可提升的候选直觉
/promote --dry-run            # 预览自动提升候选直觉
/promote --force              # 无需提示直接提升所有符合条件的候选直觉
/promote grep-before-edit     # 提升当前项目中某个特定的直觉
```

## 执行步骤

1. 检测当前项目
2. 如果提供了 `instinct-id`，仅提升该直觉（如果它存在于当前项目中）
3. 否则，查找符合以下条件的跨项目候选直觉：
   - 在至少 2 个项目中出现过
   - 达到置信度阈值（Confidence threshold）
4. 将提升后的直觉以 `scope: global` 写入 `~/.claude/homunculus/instincts/personal/`
