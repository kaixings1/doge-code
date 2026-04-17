import { formatTotalCost } from '../../cost-tracker.js'
import { currentLimits } from '../../services/claudeAiLimits.js'
import type { LocalCommandCall } from '../../types/command.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'

export const call: LocalCommandCall = async () => {
  if (isClaudeAISubscriber()) {
    let value: string

    if (currentLimits.isUsingOverage) {
      value =
        '您当前正在使用超额用量来支持 Claude Code 的使用。当订阅配额重置后，我们将自动切换回订阅速率限制'
    } else {
      value =
        '您当前正在使用您的订阅来支持 Claude Code 的使用'
    }

    if (process.env.USER_TYPE === 'ant') {
      value += `\n\n[ANT-ONLY] 仍然显示费用:\n ${formatTotalCost()}`
    }
    return { type: 'text', value }
  }
  return { type: 'text', value: formatTotalCost() }
}