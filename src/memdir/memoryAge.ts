/**
 * 自 mtime 起经过的天数。向下取整 — 0 表示今天，1 表示
 * 昨天，2+ 表示更早。负数输入（未来 mtime、时钟偏差）
 * 限制为 0。
 */
export function memoryAgeDays(mtimeMs: number): number {
  return Math.max(0, Math.floor((Date.now() - mtimeMs) / 86_400_000))
}

/**
 * 人类可读的时效字符串。模型不擅长日期算术 —
 * 原始的 ISO 时间戳不像"47 天前"那样能触发对过时性的推理。
 */
export function memoryAge(mtimeMs: number): string {
  const d = memoryAgeDays(mtimeMs)
  if (d === 0) return '今天'
  if (d === 1) return '昨天'
  return `${d} 天前`
}

/**
 * 对超过 1 天的记忆的纯文本过时提醒。对于较新的（今天/昨天）
 * 记忆返回 '' — 提醒会增加干扰。
 *
 * 当消费者已有自己的包装时使用此函数
 *（例如 messages.ts relevant_memories → wrapMessagesInSystemReminder）。
 *
 * 动机源于用户报告过时的代码状态记忆（指向已更改代码的 file:line
 * 引用）被当作事实断言 — 引用使得过时的声明听起来更具权威性，而非更少。
 */
export function memoryFreshnessText(mtimeMs: number): string {
  const d = memoryAgeDays(mtimeMs)
  if (d <= 1) return ''
  return (
    `此记忆已有 ${d} 天历史。` +
    `记忆是时间点快照，而非实时状态 — ` +
    `关于代码行为或文件行号引用可能已过时。` +
    `在断言为事实前，请与当前代码核对。`
  )
}

/**
 * 包裹在 <system-reminder> 标签中的单条记忆过时提示。
 * 对 ≤ 1 天的记忆返回 ''。用于没有自带 system-reminder
 * 包装的调用者（例如 FileReadTool 输出）。
 */
export function memoryFreshnessNote(mtimeMs: number): string {
  const text = memoryFreshnessText(mtimeMs)
  if (!text) return ''
  return `<system-reminder>${text}</system-reminder>\n`
}
