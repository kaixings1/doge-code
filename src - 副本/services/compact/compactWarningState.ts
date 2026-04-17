import { createStore } from '../../state/store.js'

/**
 * 追踪是否应该抑制"上下文即将达到自动压缩"的警告。
 * 我们在成功的压缩后立即抑制它，因为直到下一个 API 响应之前我们都没有准确的令牌计数。
 */
export const compactWarningStore = createStore<boolean>(false)

/** 抑制压缩警告。在成功压缩后调用。 */
export function suppressCompactWarning(): void {
  compactWarningStore.setState(() => true)
}

/** 清除压缩警告抑制。在新压缩尝试开始时调用。 */
export function clearCompactWarningSuppression(): void {
  compactWarningStore.setState(() => false)
}
