import { open, stat } from 'fs/promises'
import { CLAUDE_CODE_GUIDE_AGENT_TYPE } from '../../tools/AgentTool/built-in/claudeCodeGuideAgent.js'
import { getSettingsFilePathForSource } from '../../utils/settings/settings.js'
import { enableDebugLogging, getDebugLogPath } from '../../utils/debug.js'
import { errorMessage, isENOENT } from '../../utils/errors.js'
import { formatFileSize } from '../../utils/format.js'
import { registerBundledSkill } from '../bundledSkills.js'

const DEFAULT_DEBUG_LINES_READ = 20
const TAIL_READ_BYTES = 64 * 1024

export function registerDebugSkill(): void {
  registerBundledSkill({
    name: 'debug',
    description:
      process.env.USER_TYPE === 'ant'
        ? '调试当前 Claude Code 会话，通过读取会话调试日志（含所有事件日志）来排查问题'
        : '为此会话启用调试日志记录并帮助诊断问题',
    allowedTools: ['Read', 'Grep', 'Glob'],
    argumentHint: '[issue description]',
    // disableModelInvocation so that the user has to explicitly request it in
    // interactive mode and so the description does not take up context.
    disableModelInvocation: true,
    userInvocable: true,
    async getPromptForCommand(args) {
      // Non-ants don't write debug logs by default — turn logging on now so
      // subsequent activity in this session is captured.
      const wasAlreadyLogging = enableDebugLogging()
      const debugLogPath = getDebugLogPath()

      let logInfo: string
      try {
        // Tail the log without reading the whole thing - debug logs grow
        // unbounded in long sessions and reading them in full spikes RSS.
        const stats = await stat(debugLogPath)
        const readSize = Math.min(stats.size, TAIL_READ_BYTES)
        const startOffset = stats.size - readSize
        const fd = await open(debugLogPath, 'r')
        try {
          const { buffer, bytesRead } = await fd.read({
            buffer: Buffer.alloc(readSize),
            position: startOffset,
          })
          const tail = buffer
            .toString('utf-8', 0, bytesRead)
            .split('\n')
            .slice(-DEFAULT_DEBUG_LINES_READ)
            .join('\n')
          logInfo = `Log size: ${formatFileSize(stats.size)}\n\n### Last ${DEFAULT_DEBUG_LINES_READ} lines\n\n\`\`\`\n${tail}\n\`\`\``
        } finally {
          await fd.close()
        }
      } catch (e) {
        logInfo = isENOENT(e)
          ? 'No debug log exists yet — logging was just enabled.'
          : `Failed to read last ${DEFAULT_DEBUG_LINES_READ} lines of debug log: ${errorMessage(e)}`
      }

      const justEnabledSection = wasAlreadyLogging
        ? ''
        : `

## 刚刚启用了调试日志

本次会话的调试日志此前处于关闭状态，从现在开始才启用。在本次 /debug 调用之前的所有内容均未被捕获。

告知用户调试日志现在已在 \`${debugLogPath}\` 激活，请他们复现问题，然后重新读取日志。如果他们无法复现，也可以通过 \`claude --debug\` 重新启动以捕获从启动开始的日志。
`

      const prompt = `# 调试技能

帮助用户调试他们在当前 Claude Code 会话中遇到的问题。
${justEnabledSection}
## 会话调试日志

当前会话的调试日志位于：\`${debugLogPath}\`

${logInfo}

为了获取更多上下文，请在整个文件中搜索 [ERROR] 和 [WARN] 行。

## 问题描述

${args || '用户未描述具体问题。请阅读调试日志并总结任何错误、警告或值得注意的问题。'}

## 设置

请记住设置位于：
* 用户配置 - ${getSettingsFilePathForSource('userSettings')}
* 项目配置 - ${getSettingsFilePathForSource('projectSettings')}
* 本地配置 - ${getSettingsFilePathForSource('localSettings')}

## 操作指南

1. 回顾用户的问题描述
2. 最后 ${DEFAULT_DEBUG_LINES_READ} 行展示了调试文件格式。请查找 [ERROR] 和 [WARN] 条目、堆栈跟踪以及跨文件的失败模式
3. 考虑启动 ${CLAUDE_CODE_GUIDE_AGENT_TYPE} 子代理以理解相关的 Claude Code 功能
4. 用通俗语言解释你的发现
5. 提出具体的修复方案或下一步建议
`
      return [{ type: 'text', text: prompt }]
    },
  })
}
