/**
 * ColorTokenProvider — 颜色值检测器
 *
 * 用正则匹配文本中的颜色值（hex/rgb/hsl），
 * 供 Monaco hover provider 使用。
 */

export interface ColorMatch {
  value: string
  type: 'hex' | 'rgb' | 'hsl'
  startOffset: number
  endOffset: number
}

const COLOR_PATTERNS: RegExp[] = [
  /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g,
  /rgba?\s*\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+\s*)?\)/gi,
  /hsla?\s*\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*[\d.]+\s*)?\)/gi,
]

export class ColorTokenProvider {
  static findColors(text: string): ColorMatch[] {
    const results: ColorMatch[] = []

    for (const pattern of COLOR_PATTERNS) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(text)) !== null) {
        const value = match[0]
        const type: ColorMatch['type'] =
          value.startsWith('#') ? 'hex'
          : value.startsWith('rg') ? 'rgb'
          : 'hsl'
        results.push({
          value,
          type,
          startOffset: match.index,
          endOffset: match.index + value.length,
        })
      }
    }

    // 按位置排序，去重重叠
    results.sort((a, b) => a.startOffset - b.startOffset)
    const unique: ColorMatch[] = []
    let lastEnd = 0
    for (const r of results) {
      if (r.startOffset >= lastEnd) {
        unique.push(r)
        lastEnd = r.endOffset
      }
    }
    return unique
  }

  static findColorAt(text: string, offset: number): ColorMatch | null {
    const colors = ColorTokenProvider.findColors(text)
    for (const color of colors) {
      if (offset >= color.startOffset && offset <= color.endOffset) {
        return color
      }
    }
    return null
  }
}
