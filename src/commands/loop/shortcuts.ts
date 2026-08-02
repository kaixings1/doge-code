/**
 * Loop Strategy Shortcuts
 *
 * Creates shortcut commands for each loop strategy:
 *   /loop-langgraph → /loop <goal> --strategy langgraph
 *   /loop-crew      → /loop <goal> --strategy crew
 *   /loop-autogpt   → /loop <goal> --strategy autogpt
 *   /loop-openhands → /loop <goal> --strategy openhands
 *   /loop-swe       → /loop <goal> --strategy swe-agent
 */

import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { executeLoop, isValidStrategy } from './engine.js'
import type { LoopStrategyName } from './types.js'

function createShortcutCommand(strategyName: LoopStrategyName, aliases: string[]): Command {
  const call: LocalCommandCall = async (args) => {
    const goal = (args ?? '').trim()
    if (!goal) {
      return {
        type: 'text',
        value: `🔄 /loop-${strategyName} — 请描述你的目标\n\n示例:\n  /loop-${strategyName} "你的目标描述"\n  /loop-${strategyName} "目标" --criteria "成功标准"`,
      }
    }

    try {
      const result = await executeLoop({
        strategy: strategyName,
        goal: { description: goal, maxIterations: 20 },
      })

      const statusIcon = result.success ? '✅' : '⏸️'
      const lines = [
        `${statusIcon} [${strategyName}] 循环完成 — ${result.iterations} 轮`,
        `结果: ${result.reason}`,
        '',
        ...result.subTasks.map((t, i) => `  ${i + 1}. [${t.status}] ${t.description}`),
      ]
      return { type: 'text', value: lines.join('\n') }
    } catch (error) {
      return { type: 'text', value: `❌ 执行失败: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  return {
    type: 'local',
    name: `loop-${strategyName}`,
    description: `循环引擎 (${strategyName} 策略)`,
    aliases,
    supportsNonInteractive: true,
    call: call as unknown as Command['call'],
  } satisfies Command
}

/** Export all shortcut commands */
export const loopShortcuts: Command[] = [
  createShortcutCommand('langgraph', ['/loop-langgraph', '/lg']),
  createShortcutCommand('crew', ['/loop-crew', '/crew']),
  createShortcutCommand('autogpt', ['/loop-autogpt', '/agpt']),
  createShortcutCommand('openhands', ['/loop-openhands', '/oh']),
  createShortcutCommand('swe-agent', ['/loop-swe', '/swe']),
]
