---
description: 启动 NanoClaw 智能体 (Agent) REPL — 一个由 claude CLI 驱动的持久化、会话感知 (session-aware) 的 AI 助手。
---

# Claw 命令

启动一个交互式 AI 智能体 (Agent) 会话，该会话会将对话历史记录持久化保存到磁盘，并可选择加载 ECC 技能 (Skill) 上下文。

## 使用方法

```bash
node scripts/claw.js
```

或通过 npm：

```bash
npm run claw
```

## 环境变量

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `CLAW_SESSION` | `default` | 会话名称 (字母数字 + 连字符) |
| `CLAW_SKILLS` | *(空)* | 以逗号分隔的技能 (Skill) 名称，用于加载系统上下文 |

## REPL 命令

在 REPL 内部，直接在提示符处输入这些命令：

```
/clear      清除当前会话历史
/history    打印完整对话历史
/sessions   列出所有已保存的会话
/help       显示可用命令
exit        退出 REPL
```

## 工作原理

1. 读取 `CLAW_SESSION` 环境变量以选择命名的会话 (默认: `default`)
2. 从 `~/.claude/claw/{session}.md` 加载对话历史记录
3. 可选地从 `CLAW_SKILLS` 环境变量加载 ECC 技能 (Skill) 上下文
4. 进入阻塞式的提示词 (Prompt) 循环 — 每个用户消息都会连同完整历史记录发送到 `claude -p`
5. 响应会被追加到会话文件中，以便在重启后实现持久化

## 会话存储

会话以 Markdown 文件形式存储在 `~/.claude/claw/` 中：

```
~/.claude/claw/default.md
~/.claude/claw/my-project.md
```

每一轮对话的格式如下：

```markdown
### [2025-01-15T10:30:00.000Z] 用户
What does this function do?
---
### [2025-01-15T10:30:05.000Z] 助手
This function calculates...
---
```

## 示例

```bash
# 启动默认会话
node scripts/claw.js

# 命名会话
CLAW_SESSION=my-project node scripts/claw.js

# 带有技能 (Skill) 上下文
CLAW_SKILLS=tdd-workflow,security-review node scripts/claw.js
```
