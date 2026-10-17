---
name: git-guardrails-claude-code
description: 设置 Claude Code hooks，在危险的 git 命令（push、reset --hard、clean、branch -D 等）执行前拦截并阻止。当用户希望防止破坏性 git 操作、添加 git 安全 hooks，或在 Claude Code 中阻止 git push/reset 时使用。
---

# 设置 Git 防护栏（Git Guardrails）

设置一个 PreToolUse hook，在 Claude 执行危险的 git 命令之前拦截并阻止它们。

## 会被阻止的命令

- `git push`（所有变体，包括 `--force`）
- `git reset --hard`
- `git clean -f` / `git clean -fd`
- `git branch -D`
- `git checkout .` / `git restore .`

当命令被阻止时，Claude 会看到一条消息，告知它没有权限使用这些命令。

## 步骤

### 1. 询问作用范围

询问用户：是仅为**当前项目**（`.claude/settings.json`）安装，还是为**所有项目**（`~/.claude/settings.json`）安装？

### 2. 复制 hook 脚本

随附的脚本位于：[scripts/block-dangerous-git.sh](scripts/block-dangerous-git.sh)

根据作用范围将其复制到目标位置：

- **项目级**：`.claude/hooks/block-dangerous-git.sh`
- **全局级**：`~/.claude/hooks/block-dangerous-git.sh`

使用 `chmod +x` 使其可执行。

### 3. 将 hook 添加到设置中

添加到相应的设置文件中：

**项目级**（`.claude/settings.json`）：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-dangerous-git.sh"
          }
        ]
      }
    ]
  }
}
```

**全局级**（`~/.claude/settings.json`）：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/block-dangerous-git.sh"
          }
        ]
      }
    ]
  }
}
```

如果设置文件已存在，请将该 hook 合并到现有的 `hooks.PreToolUse` 数组中——不要覆盖其他设置。

### 4. 询问是否需要自定义

询问用户是否需要在阻止列表中添加或移除某些模式。相应地编辑已复制的脚本。

### 5. 验证

运行一个快速测试：

```bash
echo '{"tool_input":{"command":"git push origin main"}}' | <path-to-script>
```

应该以退出码 2 结束，并在 stderr 中输出一条 BLOCKED 消息。