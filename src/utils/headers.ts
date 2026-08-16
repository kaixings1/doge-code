/**
 * HTTP 头解析工具
 * 吸收自 cline SDK (sdk/packages/shared/src/parse/headers/)
 *
 * - parseKeyPairsIntoRecord: 将 "key=value, key2=value2" 格式解析为 Record
 */

/**
 * 将逗号分隔的 key=value 字符串解析为 Record。
 *
 * 例如: "Content-Type=text/html, X-Custom=value" → { "Content-Type": "text/html", "X-Custom": "value" }
 *
 * 特性：
 * - URL 解码 key 和 value
 * - 跳过空值或格式错误的条目
 * - 静默跳过单个格式错误的条目，不中断整个解析
 */
export function parseKeyPairsIntoRecord(
  value?: string,
): Record<string, string> {
  const result: Record<string, string> = {}

  if (!value) {
    return result
  }

  value.split(',').forEach((entry) => {
    const separatorIndex = entry.indexOf('=')
    if (separatorIndex <= 0) return

    try {
      // 等号前是 key，等号后是 value
      const key = decodeURIComponent(entry.substring(0, separatorIndex).trim())
      const val = decodeURIComponent(entry.substring(separatorIndex + 1).trim())

      if (!key || !val) return

      result[key] = val
    } catch {
      // 跳过单个格式错误的条目（如无效的百分号编码）
      // 而不是中断整个列表并静默丢弃其余条目
    }
  })

  return result
}
