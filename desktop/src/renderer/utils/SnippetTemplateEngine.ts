/**
 * SnippetTemplateEngine — 代码片段模板引擎
 *
 * 语法支持：
 * - {{variable}} — 变量占位符
 * - ${1:placeholder} — TabStop，按 Tab 顺序跳转
 * - ${2:default|opt1|opt2} — 枚举选择 TabStop
 */

export interface TabStop {
  readonly index: number
  readonly placeholder: string
  readonly defaultValue: string
  readonly options: string[]
  readonly startOffset: number
  readonly endOffset: number
}

export interface RenderResult {
  readonly text: string
  readonly tabStops: TabStop[]
}

export class SnippetTemplateEngine {
  private static VARIABLE_RE = /\{\{(\w+)\}\}/g
  private static TABSTOP_RE = /\$\{(\d+)(?::([^}|]+)(?:\|([^}]+))?)?\}/g

  /**
   * 提取模板中的所有 TabStop
   */
  static getTabStops(template: string): TabStop[] {
    const stops: TabStop[] = []
    let m: RegExpExecArray | null

    this.TABSTOP_RE.lastIndex = 0
    while ((m = this.TABSTOP_RE.exec(template)) !== null) {
      const raw = m[0]
      const placeholder = m[2] ? m[2].trim() : ''
      const optionsRaw = m[3] ? m[3].trim() : ''
      const options = optionsRaw ? optionsRaw.split('|').map(o => o.trim()) : []

      stops.push({
        index: Number(m[1]),
        placeholder,
        defaultValue: options.length > 0 ? options[0] : placeholder,
        options,
        startOffset: m.index,
        endOffset: m.index + raw.length,
      })
    }

    return stops.sort((a, b) => a.index - b.index)
  }

  /**
   * 渲染模板：将 {{var}} 替换为 context 值，保留 TabStop
   */
  static render(template: string, context: Record<string, string> = {}): RenderResult {
    // 替换 {{variable}}
    let text = template.replace(this.VARIABLE_RE, (_match, varName: string) => {
      return context[varName] !== undefined ? String(context[varName]) : _match
    })

    const tabStops = this.getTabStops(text)

    // 将未提供默认值的 TabStop 替换为可编辑标记
    const rendered = text.replace(this.TABSTOP_RE, (match: string, _index: string, placeholder?: string, optionsRaw?: string) => {
      const display = placeholder ? placeholder.trim() : ''
      return `__TS_${display || '?'}__`
    })

    return { text: rendered, tabStops }
  }

  /**
   * 提取模板中的所有 {{variable}} 名称
   */
  static extractVariables(template: string): string[] {
    const vars = new Set<string>()
    let m: RegExpExecArray | null
    this.VARIABLE_RE.lastIndex = 0
    while ((m = this.VARIABLE_RE.exec(template)) !== null) {
      vars.add(m[1])
    }
    return Array.from(vars)
  }

  /**
   * 验证 context 是否覆盖了所有 {{variable}}
   */
  static validateContext(template: string, context: Record<string, string> = {}): { missing: string[] } {
    const required = this.extractVariables(template)
    const missing = required.filter(v => !(v in context))
    return { missing }
  }
}
