/**
 * Loop Strategy Shortcuts
 *
 * 快捷方式命令 — 无参数时显示超级说明书级别的手册
 */

import type { Command } from '../../commands.js'
import type { LocalCommandCall, LocalCommandModule } from '../../types/command.js'
import { executeLoop } from './engine.js'
import type { LoopStrategyName } from './types.js'
import { strategyManuals } from './strategy-manuals.js'

const complexityIcon = (c: string) => {
  if (c === '入门') return '🟢'
  if (c === '进阶') return '🟡'
  if (c === '高级') return '🟠'
  return '🔴'
}

/** 生成超级说明书级别的帮助文本 */
function generateManualText(strategyName: LoopStrategyName): string {
  const m = strategyManuals[strategyName]
  if (!m) {
    return `🔄 /loop-${strategyName} — 请描述你的目标`
  }

  const L = '━'
  const lines: string[] = []

  // 标题
  lines.push(`╔${L.repeat(58)}╗`)
  lines.push(`║  🔄 ${m.displayName.padEnd(52)}║`)
  lines.push(`║     ${m.tagline.padEnd(52)}║`)
  lines.push(`╚${L.repeat(58)}╝`)
  lines.push('')

  // 概述
  lines.push('📖 概述')
  lines.push('─'.repeat(60))
  for (const para of m.overview.split('\n').filter(p => p.trim())) {
    lines.push(para.trim())
  }
  lines.push('')

  // 适用场景
  lines.push('🎯 适用场景')
  lines.push('─'.repeat(60))
  for (const uc of m.useCases) lines.push(`  ✓ ${uc}`)
  lines.push('')

  lines.push('🚫 不适用场景')
  lines.push('─'.repeat(60))
  for (const nc of m.notSuitableFor) lines.push(`  ✗ ${nc}`)
  lines.push('')

  // 核心概念
  lines.push('⚙️ 核心概念')
  lines.push('─'.repeat(60))
  for (const c of m.coreConcepts) {
    lines.push(`  • ${c.term}: ${c.definition}`)
  }
  lines.push('')

  // 架构图
  lines.push('🏗️ 架构图')
  lines.push('─'.repeat(60))
  lines.push(m.architecture)
  lines.push('')

  // 执行流程
  lines.push('🔄 执行流程')
  lines.push('─'.repeat(60))
  for (const step of m.executionFlow) {
    lines.push(`  ${step}`)
  }
  lines.push('')

  // 参数说明
  lines.push('📋 参数说明')
  lines.push('─'.repeat(60))
  lines.push(`  /loop-${m.name} "目标" [选项]`)
  lines.push('')
  for (const p of m.parameters) {
    lines.push(`  --${p.name.padEnd(20)} ${p.type.padEnd(10)} 默认: ${p.default.padEnd(8)} ${p.description}`)
  }
  lines.push('')

  // 使用示例
  lines.push('💡 使用示例')
  lines.push('═'.repeat(60))
  for (const ex of m.examples) {
    const icon = complexityIcon(ex.complexity)
    lines.push('')
    lines.push(`${icon} ${ex.title} [${ex.complexity}]`)
    lines.push('─'.repeat(60))
    lines.push(`  📝 场景: ${ex.scenario}`)
    lines.push(`  ⌨️  命令: ${ex.command}`)
    lines.push(`  🔧 流程:`)
    for (const step of ex.flow) {
      lines.push(`     ${step}`)
    }
    lines.push(`  📊 输出: ${ex.output}`)
    lines.push(`  💡 提示:`)
    for (const tip of ex.tips) {
      lines.push(`     • ${tip}`)
    }
  }
  lines.push('')

  // 最佳实践
  lines.push('🎓 最佳实践')
  lines.push('─'.repeat(60))
  for (const bp of m.bestPractices) {
    lines.push(`  ✓ ${bp}`)
  }
  lines.push('')

  // 常见陷阱
  lines.push('⚠️ 常见陷阱')
  lines.push('─'.repeat(60))
  for (const cp of m.commonPitfalls) {
    lines.push(`  ${cp}`)
  }
  lines.push('')

  // 策略对比
  lines.push('🔗 与其他策略的对比')
  lines.push('─'.repeat(60))
  for (const c of m.comparison) {
    lines.push(`  ${c.strategy.padEnd(12)} 用: ${c.whenToUse}`)
    lines.push(`  ${' '.repeat(12)} 不用: ${c.whenNotToUse}`)
  }
  lines.push('')

  // 性能考量
  lines.push('📈 性能考量')
  lines.push('─'.repeat(60))
  for (const p of m.performance) {
    lines.push(`  • ${p}`)
  }
  lines.push('')

  // 扩展和定制
  lines.push('🔧 扩展和定制')
  lines.push('─'.repeat(60))
  for (const c of m.customization) {
    lines.push(`  • ${c}`)
  }
  lines.push('')

  // 底部提示
  lines.push('═'.repeat(60))
  lines.push('💬 快速使用:')
  lines.push(`  /loop-${m.name} "上面任意一个目标或你自己的目标"`)
  lines.push(`  /loop-${m.name} "目标" --criteria "成功标准"`)
  lines.push('')
  lines.push(`🔄 也可以使用主命令: /loop "目标" --strategy ${m.name}`)
  lines.push('═'.repeat(60))

  return lines.join('\n')
}

function createShortcutCommand(strategyName: LoopStrategyName, aliases: string[]): Command {
  const call: LocalCommandCall = async (args) => {
    const goal = (args ?? '').trim()
    if (!goal) {
      return {
        type: 'text',
        value: generateManualText(strategyName),
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
    load: async () => ({ call }) as LocalCommandModule,
  } satisfies Command
}

export const loopShortcuts: Command[] = [
  createShortcutCommand('langgraph', ['/loop-langgraph', '/lg']),
  createShortcutCommand('crew', ['/loop-crew', '/crew']),
  createShortcutCommand('autogpt', ['/loop-autogpt', '/agpt']),
  createShortcutCommand('openhands', ['/loop-openhands', '/oh']),
  createShortcutCommand('swe-agent', ['/loop-swe', '/swe']),
]
