/**
 * 代码处理工具函数
 * 吸收自 Agentless (agentless/util/preprocess_data.py, postprocess_data.py)
 *
 * - mergeIntervals: 合并重叠区间
 * - cleanMethodLeftSpace: 去除公共缩进
 * - removeEmptyLines: 移除空行
 */

/**
 * 合并重叠的区间（闭区间）。
 * 例如: [(1,3), (2,4), (5,7)] → [(1,4), (5,7)]
 *
 * @param intervals - 闭区间数组，每个元素为 [start, end]
 * @returns 合并后的区间数组
 */
export function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (!intervals.length) return []

  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const current = sorted[i]
    if (current[0] <= last[1]) {
      merged[merged.length - 1] = [last[0], Math.max(last[1], current[1])]
    } else {
      merged.push(current)
    }
  }
  return merged
}

/**
 * 移除代码块中每行的公共缩进。
 * 例如: "    line1\n    line2" → "line1\nline2"
 *
 * @param code - 源代码字符串
 * @returns 去除公共缩进后的代码
 */
export function cleanMethodLeftSpace(code: string): string {
  const lines = code.split('\n')
  if (lines.length === 0) return code

  // 找到第一行非空行的缩进量
  let indentSize = 0
  for (const line of lines) {
    if (line.trim()) {
      indentSize = line.length - line.trimStart().length
      break
    }
  }
  if (indentSize === 0) return code

  return lines.map(line => line.slice(indentSize)).join('\n')
}

/**
 * 移除代码中的空行。
 *
 * @param code - 源代码字符串
 * @returns 移除空行后的代码
 */
export function removeEmptyLines(code: string): string {
  return code.split('\n').filter(line => line.trim() !== '').join('\n')
}
