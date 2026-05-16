import memoize from 'lodash-es/memoize.js'

// 确保获取本地日期的 ISO 格式
export function getLocalISODate(): string {
  // 检查仅限 ant 的日期覆盖
  if (process.env.CLAUDE_CODE_OVERRIDE_DATE) {
    return process.env.CLAUDE_CODE_OVERRIDE_DATE
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 为提示缓存稳定性而记忆化——在会话开始时捕获一次日期。
// 主交互路径通过 context.ts 中的 memoize(getUserContext) 获得此行为；
// 简单模式（--bare）在每次请求时调用 getSystemPrompt，需要显式的
// 记忆化日期以避免在午夜时破坏缓存的提示前缀。
// 当午夜过后，getDateChangeAttachments 会在尾部追加新日期
// （尽管简单模式禁用了附件，因此权衡是：
// 午夜后的过期日期 vs. 整个对话的缓存破坏——过期日期胜出）。
export const getSessionStartDate = memoize(getLocalISODate)

// 返回用户本地时区的 "月份 YYYY"（例如 "2026 年 2 月"）。
// 每月变化而非每日——在工具提示中使用以最小化缓存破坏。
export function getLocalMonthYear(): string {
  const date = process.env.CLAUDE_CODE_OVERRIDE_DATE
    ? new Date(process.env.CLAUDE_CODE_OVERRIDE_DATE)
    : new Date()
  return date.toLocaleString('zh-CN', { month: 'long', year: 'numeric' })
}
