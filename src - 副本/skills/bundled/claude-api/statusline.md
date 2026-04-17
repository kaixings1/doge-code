# statusline.md

## 状态栏技能 (statusline)

### 功能说明

该技能用于配置和显示 **Claude Code 状态栏**，在终端中展示当前会话信息。

#### 显示内容

- 当前使用的模型（如 `claude-opus-4.6`）
- 当前分支名称
- 已运行的命令数量
- 剩余时间/进度提示

### 输出示例

```
┌─────────────────────────────────────────────────────────────┐
│ Claude Code Status                                        │
├─────────────────────────────────────────────────────────────┤
│ Model:    claude-opus-4.6                                  │
│ Branch:   main                                            │
│ Commands: 3                                              │
│ Session:  2026-04-15                                       │
└─────────────────────────────────────────────────────────────┘
```

### 配置方式

#### 方法一：通过命令行创建

```bash
# 交互式创建（会提示输入）
claude agents create --name statusline-setup --type statusline-setup

# 或手动指定参数
claude agents create \
  --name "statusline-setup" \
  --subagent-type "statusline-setup" \
  --prompt "显示当前会话状态信息"
```

#### 方法二：通过 settings.json 配置

**settings.json 示例：**
```json
{
  "agents": {
    "statusline-setup": {
      "name": "statusline-setup",
      "description": "设置 Claude Code 的状态栏 UI",
      "subagent_type": "statusline-setup",
      "prompt": "Configure my statusLine from my shell PS1 configuration"
    }
  },
  "hooks": {
    "ps1": "echo \"\\n\"; claude agents statusline-setup"
  }
}
```

### 配置步骤详解

#### 1. 创建状态栏 Agent

**方式 A：使用命令行工具**
```bash
claude agents create --name statusline-setup \
  --subagent-type "statusline-setup" \
  --prompt "显示当前会话状态信息"
```

**方式 B：手动编辑 settings.json**
```json
{
  "agents": {
    "statusline-setup": [
      {
        "name": "statusline-setup",
        "description": "设置 Claude Code 的状态栏 UI",
        "subagent_type": "statusline-setup"
      }
    ]
  }
}
```

#### 2. 配置 PS1 钩子

**~/.bashrc / ~/.zshrc:**
```bash
# Bash (Bash It)
export PROMPT_COMMAND="claude agents statusline-setup"

# Zsh (Zsh Prompt)
autoload -Ux prompt_sockets
prompt_sockets() {
  # ... existing config ...
  
  if [[ "$PROMPT_COMMAND" != *"statusline"* ]]; then
    PROMPT_COMMAND="claude agents statusline-setup"
  fi
}
```

**Zsh 配置示例：**
```zsh
# 在 .zshrc 中添加
autoload -Ux prompt_sockets
prompt_sockets() {
  # ... existing config ...
  
  local socket_output=$(claude agents statusline-setup)
  if [[ -n "$socket_output" ]]; then
    printf '\n'
    printf '%s\n' "$socket_output"
  fi
  
  # ... rest of prompt configuration ...
}

# 设置 PS1
zstyle ':prompt_sockets:statusline*' socket-content pre-prompt
```

#### 3. 启用状态栏显示

**settings.json:**
```json
{
  "hooks": {
    "ps1": [
      "claude agents statusline-setup"
    ]
  }
}
```

### 手动配置 PS1 (Zsh)

如果不想使用钩子，可以手动在 PS1 中嵌入状态栏：

**~/.zshrc:**
```zsh
# 定义状态栏函数
statusline_setup() {
  local output=$(claude agents statusline-setup)
  
  if [[ -n "$output" ]]; then
    # 格式化输出（添加边框、颜色等）
    printf '\n'
    printf '┌─%s─┐\n' "$(tput bold);$(echo "$output" | sed 's/./&/g');$(tput normal)"
    printf '└───────────────────────┘\n'
  fi
  
  # 返回其他 prompt 配置...
}

# 添加到 PS1
autoload -Ux prompt_sockets
prompt_sockets() {
  local socket_output=$(statusline_setup)
  
  if [[ -n "$socket_output" ]]; then
    printf '%s\n' "$socket_output"
  fi
  
  # ... rest of prompt configuration ...
}

# 设置 PS1，包含状态栏钩子
zstyle ':prompt_sockets:statusline*' socket-content pre-prompt
```

### 手动配置 PS1 (Bash It)

**~/.bashrc:**
```bash
export PROMPT_COMMAND="claude agents statusline-setup"
```

---
