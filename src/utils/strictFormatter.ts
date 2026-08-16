/**
 * StrictFormatter — 强制 keyword-only 格式化的字符串格式化器
 * 吸收自 langchain_core/utils/formatting.py
 *
 * 确保所有变量替换使用具名参数，不接受位置参数。
 */

export class StrictFormatter {
  /**
   * 使用仅具名参数格式化字符串。
   * @throws {ValueError} 如果提供了位置参数
   */
  format(template: string, values: Record<string, unknown>): string {
    // 检查模板中是否有未提供值的占位符
    const placeholderRegex = /\{([^}]+)\}/g
    const missingVars: string[] = []
    let match: RegExpExecArray | null
    while ((match = placeholderRegex.exec(template)) !== null) {
      const varName = match[1].trim()
      if (!(varName in values)) {
        missingVars.push(varName)
      }
    }
    if (missingVars.length > 0) {
      throw new Error(`Missing values for variables: ${missingVars.join(', ')}`)
    }

    // 使用 replace 手动替换，不接受位置参数
    let result = template
    for (const [key, value] of Object.entries(values)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g')
      result = result.replace(regex, String(value))
    }
    return result
  }

  /**
   * 验证输入变量是否能正确填充模板中的所有占位符。
   * @throws {Error} 如果存在未在输入变量中的占位符
   */
  validateInputVariables(template: string, inputVariables: string[]): void {
    const placeholderRegex = /\{([^}]+)\}/g
    const requiredVars: string[] = []
    let match: RegExpExecArray | null
    while ((match = placeholderRegex.exec(template)) !== null) {
      requiredVars.push(match[1].trim())
    }

    const missing = requiredVars.filter(v => !inputVariables.includes(v))
    if (missing.length > 0) {
      throw new Error(`Missing variables for template: ${missing.join(', ')}`)
    }
  }
}
