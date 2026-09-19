import type { LocalCommandResult } from '../../types/command.js'

/**
 * LocalCommandResult 是判别联合（text | compact | skip）。
 * 直接访问 `.value` 需要先按 `type` 窄化，否则 TS 报 TS2339。
 * 这些辅助函数把窄化收敛到一处，避免每个测试文件各写一遍。
 */

/** 断言结果为 text 并返回其 value；类型不匹配时抛出，便于定位失败的用例 */
export function expectText(result: LocalCommandResult): string {
  if (result.type !== 'text') {
    throw new Error(`expected text result, got '${result.type}'`)
  }
  return result.value
}

/** 从 text 结果中安全取 value，非 text 时返回 undefined */
export function textValue(result: LocalCommandResult): string | undefined {
  return result.type === 'text' ? result.value : undefined
}
