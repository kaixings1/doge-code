/**
 * 字典合并工具函数
 * 吸收自 agno (agno/utils/merge_dict.py)
 *
 * - mergeDictionaries: 递归合并字典（b 的值覆盖 a）
 * - mergeParallelSessionStates: 智能合并并行会话状态
 */

/**
 * 递归合并两个字典。
 * 如果两个字典在相同键处都有字典值，则递归合并。
 * 否则 b 的值覆盖 a。
 *
 * @param a - 被修改的字典（结果存储在此）
 * @param b - 覆盖来源字典
 */
export function mergeDictionaries(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): void {
  for (const key of Object.keys(b)) {
    if (
      key in a &&
      typeof a[key] === 'object' &&
      a[key] !== null &&
      typeof b[key] === 'object' &&
      b[key] !== null &&
      !Array.isArray(a[key]) &&
      !Array.isArray(b[key])
    ) {
      mergeDictionaries(a[key] as Record<string, unknown>, b[key] as Record<string, unknown>)
    } else {
      a[key] = b[key]
    }
  }
}

/**
 * 智能合并并行会话状态。
 * 只应用与原始状态不同的实际变更，防止并行步骤互相覆盖。
 *
 * @param originalState - 原始状态字典（被修改）
 * @param modifiedStates - 多个并行修改后的状态列表
 */
export function mergeParallelSessionStates(
  originalState: Record<string, unknown>,
  modifiedStates: Record<string, unknown>[],
): void {
  if (!originalState || modifiedStates.length === 0) return

  const allChanges: Record<string, unknown> = {}
  for (const modifiedState of modifiedStates) {
    if (!modifiedState) continue
    for (const key of Object.keys(modifiedState)) {
      if (!(key in originalState) || originalState[key] !== modifiedState[key]) {
        allChanges[key] = modifiedState[key]
      }
    }
  }

  for (const key of Object.keys(allChanges)) {
    originalState[key] = allChanges[key]
  }
}
