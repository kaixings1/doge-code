import { registerBundledSkill } from '../bundledSkills.js'

// Prompt text contains `ps` commands as instructions for Claude to run,
// not commands this file executes.
// eslint-disable-next-line custom-rules/no-direct-ps-commands
const STUCK_PROMPT = `# /stuck — 诊断冻结/缓慢的 Claude Code 会话

用户认为此机器上的另一个 Claude Code 会话已冻结、卡住或非常慢。调查并向 #claude-code-feedback 发布报告。

## 需要关注的

扫描其他 Claude Code 进程（排除当前进程 — PID 在 \`process.pid\` 中，但对于 shell 命令只需排除你在此提示中看到的 PID）。进程名称通常为 \`claude\`（已安装）或 \`cli\`（原生开发构建）。

卡住会话的迹象：
- **持续高 CPU (≥90%)** — 可能是无限循环。采样两次，间隔 1-2 秒，以确认不是瞬态尖峰。
- **进程状态 \`D\`（不可中断睡眠）** — 通常是 I/O 挂起。在 \`ps\` 输出的 \`state\` 列中；第一个字符很重要（忽略修饰符如 \`+\`、\`s\`、\`<\`）。
- **进程状态 \`T\`（已停止）** — 用户可能不小心按了 Ctrl+Z。
- **进程状态 \`Z\`（僵尸）** — 父进程未回收。
- **非常高的 RSS (≥4GB)** — 可能的内存泄漏使会话变慢。
- **卡住的子进程** — 一个挂起的 \`git\`、\`node\` 或 shell 子进程可能导致父进程冻结。检查每个会话的 \`pgrep -lP <pid>\`。

## 调查步骤

1. **列出所有 Claude Code 进程**（macOS/Linux）：
   \`\`\`
   ps -axo pid=,pcpu=,rss=,etime=,state=,comm=,command= | grep -E '(claude|cli)' | grep -v grep
   \`\`\`
   过滤到 \`comm\` 为 \`claude\` 或 (\`cli\` 且命令路径包含 "claude") 的行。

2. **对任何可疑内容**，收集更多上下文：
   - 子进程：\`pgrep -lP <pid>\`
   - 如果 CPU 高：1-2 秒后再次采样以确认是持续的
   - 如果子进程看起来卡住了（例如，git 命令），用 \`ps -p <child_pid> -o command=\` 记下它的完整命令行
   - 如果你能推断出会话 ID，检查会话的调试日志：\`~/.claude/debug/<session-id>.txt\`（最后几百行通常显示挂起前在做什么）

3. **考虑对真正冻结的进程进行堆栈转储**（高级，可选）：
   - macOS：\`sample <pid> 3\` 给出 3 秒的原生堆栈采样
   - 这很大——只有在进程明显卡住且你想知道*为什么*时才抓取

## 报告

**只有在你确实发现了卡住的东西时才发布到 Slack。** 如果每个会话看起来都健康，直接告诉用户——不要向频道发布全部正常的消息。

如果你确实发现了卡住/慢的会话，向 **#claude-code-feedback**（频道 ID: \`C07VBSHV7EV\`）发布报告，使用 Slack MCP 工具。如果 ToolSearch 中未加载 \`slack_send_message\`，请查找它。

**使用两条消息的结构**以保持频道可扫描：

1. **顶级消息** — 一行简短内容：hostname、Claude Code 版本和简洁的症状（例如 "session PID 12345 pegged at 100% CPU for 10min" 或 "git subprocess hung in D state"）。无代码块，无详情。
2. **线程回复** — 完整的诊断转储。将顶级消息的 \`ts\` 作为 \`thread_ts\` 传递。包括：
   - PID、CPU%、RSS、状态、运行时间、命令行、子进程
   - 你对可能问题的诊断
   - 相关的调试日志尾部或 \`sample\` 输出（如果抓到了）

如果 Slack MCP 不可用，将报告格式化为一条用户可以复制粘贴到 #claude-code-feedback 的消息（并让他们知道自行在线程中发布详情）。

## 备注
- 不要杀死或发送信号给任何进程——这只是诊断。
- 如果用户提供了参数（例如，特定的 PID 或症状），首先关注那里。
`

export function registerStuckSkill(): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }

  registerBundledSkill({
    name: 'stuck',
    description:
      '[ANT-ONLY] 调查此机器上冻结/卡住/缓慢的 Claude Code 会话，并向 #claude-code-feedback 发布诊断报告。',
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = STUCK_PROMPT
      if (args) {
        prompt += `\n## 用户提供的上下文\n\n${args}\n`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
