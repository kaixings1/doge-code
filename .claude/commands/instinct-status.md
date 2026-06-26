---
name: instinct-status
description: 显示已学习的直觉（项目 + 全局）及其置信度
command: true
---

# 直觉状态命令 (Instinct Status Command)

显示当前项目的已学习直觉（Instincts）以及全局直觉，并按领域（Domain）进行分组。

## 实现 (Implementation)

使用插件根路径运行直觉 CLI：

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/scripts/instinct-cli.py" status
```

如果未设置 `CLAUDE_PLUGIN_ROOT`（手动安装），请使用：

```bash
python3 ~/.claude/skills/continuous-learning-v2/scripts/instinct-cli.py status
```

## 用法 (Usage)

```
/instinct-status
```

## 执行步骤 (What to Do)

1. 检测当前项目上下文（git remote/路径哈希）
2. 从 `~/.claude/homunculus/projects/<project-id>/instincts/` 读取项目直觉
3. 从 `~/.claude/homunculus/instincts/` 读取全局直觉
4. 按优先级规则合并（当 ID 冲突时，项目直觉覆盖全局直觉）
5. 按领域分组显示，并带有置信度进度条和观测统计数据

## 输出格式 (Output Format)

```
============================================================
  INSTINCT STATUS - 共 12 条
============================================================

  项目: my-app (a1b2c3d4e5f6)
  项目直觉: 8
  全局直觉: 4

## 项目级 (PROJECT-SCOPED) (my-app)
  ### 工作流 (WORKFLOW) (3)
    ███████░░░  70%  grep-before-edit [project]
              触发器 (trigger): 修改代码时

## 全局 (GLOBAL) (适用于所有项目)
  ### 安全 (SECURITY) (2)
    █████████░  85%  validate-user-input [global]
              触发器 (trigger): 处理用户输入时
```
