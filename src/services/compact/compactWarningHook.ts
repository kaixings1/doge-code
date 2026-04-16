import { useSyncExternalStore } from 'react'
import { compactWarningStore } from './compactWarningState.js'

/**
 * React hook to subscribe to compact warning suppression state.
 *
 * 独立成文件是为了让 compactWarningState.ts 保持无 React 依赖：
 * microCompact.ts 导入纯状态函数，如果将 React 引入该模块图，
 * 会将其拖入 print-mode 启动路径。
 */
export function useCompactWarningSuppression(): boolean {
  return useSyncExternalStore(
    compactWarningStore.subscribe,
    compactWarningStore.getState,
  )
}
