/**
 * 清理来自 webhook 的入站 payload，移除常见的注入向量。
 *
 * 覆盖的场景：脚本标签、事件处理器属性、javascript: URL、
 * 以及 HTML 注释中的常见注入模式。
 *
 * 不保证覆盖全部 XSS 变体 — 消费方仍应视 webhook 数据为
 * 不受信任并在渲染时进行适当的转义。
 */

const DANGEROUS_PATTERNS: RegExp[] = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
  /javascript\s*:/gi,
  /<!--[\s\S]*?-->/g,
]

/**
 * 对任意 webhook payload 值执行基本清理。
 * 对字符串移除已知的注入模式；其他类型原样返回。
 */
export function sanitizeWebhookPayload<T>(value: T): T {
  if (typeof value === 'string') {
    let result: string = value
    for (const pattern of DANGEROUS_PATTERNS) {
      result = result.replace(pattern, '')
    }
    return result as T
  }
  return value
}
