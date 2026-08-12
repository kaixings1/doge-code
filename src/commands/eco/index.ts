import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { getEcoStats, isEcoEnabled, resetEcoStats, setEcoEnabled } from '../../engine/ecoFilter.js'
import { getSessionId } from '../../bootstrap/state.js'

const eco = {
  type: 'local',
  name: 'eco',
  description: 'Bash 输出压缩模式：减少 token 消耗（on/off/status）',
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_ECO),
  supportsNonInteractive: true,
  argumentHint: '[on|off|status]',
  load: () => Promise.resolve({ call }),
} satisfies Command

const call = async (args: string): Promise<{ type: string; value: string }> => {
  const arg = (args || '').trim().toLowerCase()
  const sessionId = getSessionId()

  if (arg === 'status' || arg === 'stats') {
    const stats = getEcoStats()
    const state = isEcoEnabled() ? 'on' : 'off'
    const lines = [`Eco mode: ${state}`]
    if (stats.commands > 0) {
      lines.push(
        `  压缩 ${stats.commands} 次 Bash 输出: ` +
          `~${stats.baselineTokens.toLocaleString()} → ~${stats.ecoTokens.toLocaleString()} tokens ` +
          `(节省 ~${stats.savedTokens.toLocaleString()}, ${stats.savingsPct.toFixed(0)}%)`,
      )
      const sorted = Object.entries(stats.byFilter).sort(([, a], [, b]) => b[1] - a[1])
      for (const [name, [uses, saved]] of sorted) {
        lines.push(`    ${name}: ${uses} 次, ~${saved.toLocaleString()} tokens 节省`)
      }
    } else {
      lines.push('  本会话暂无压缩记录')
    }
    return { type: 'text', value: lines.join('\n') }
  }

  if (arg === '' || arg === 'toggle') {
    const newState = !isEcoEnabled()
    setEcoEnabled(sessionId, newState)
    return {
      type: 'text',
      value: newState
        ? '❌ 错误: Eco 模式已开启：Bash 输出将在发送给模型前压缩（测试失败保留，噪音 stripping，长输出截断）。原始输出保存到 session tee 文件。使用 /eco off 关闭。'
        : 'Eco 模式已关闭：Bash 输出将原样发送给模型。',
    }
  }

  if (arg === 'on' || arg === 'enable' || arg === 'true' || arg === '1') {
    setEcoEnabled(sessionId, true)
    return {
      type: 'text',
      value: 'Eco 模式已开启：Bash 输出将在发送给模型前压缩。使用 /eco status 查看节省统计。',
    }
  }

  if (arg === 'off' || arg === 'disable' || arg === 'false' || arg === '0') {
    setEcoEnabled(sessionId, false)
    return { type: 'text', value: 'Eco 模式已关闭。' }
  }

  return {
    type: 'text',
    value:
      '用法: /eco [on|off|status]\n\n' +
      '压缩 Bash 输出以减少 token 消耗（测试失败保留，噪音 stripping，长输出截断）。' +
      '原始输出保存到 session tee 文件。',
  }
}

export default eco
