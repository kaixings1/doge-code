import { useEffect, useRef } from 'react'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { useOptionalKeybindingContext } from './KeybindingContext.js'
import type { KeybindingContextName } from './types.js'

// TODO(keybindings-migration): 迁移完成后移除 fallback 参数，
// 并确认没有记录 'keybinding_fallback_used' 事件。
// fallback 在迁移期间作为安全网存在——如果绑定加载失败
// 或找不到操作，我们回退到硬编码值。
// 一旦稳定，调用者应该能够信任 getBindingDisplayText
// 总是为已知操作返回值，我们可以移除这种防御性模式。

/**
 * 获取已配置快捷键显示文本的 Hook。
 * 返回已配置的绑定，如果不可用则返回 fallback。
 *
 * @param action - 动作名称（例如 'app:toggleTranscript'）
 * @param context - 按键绑定上下文（例如 'Global'）
 * @param fallback - 按键绑定上下文不可用时的回退文本
 * @returns 已配置的快捷键显示文本
 *
 * @example
 * const expandShortcut = useShortcutDisplay('app:toggleTranscript', 'Global', 'Ctrl+o')
 * // 返回用户配置的绑定，或默认值 'Ctrl+o'
 */
export function useShortcutDisplay(
  action: string,
  context: KeybindingContextName,
  fallback: string,
): string {
  const keybindingContext = useOptionalKeybindingContext()
  const resolved = keybindingContext?.getDisplayText(action, context)
  const isFallback = resolved === undefined
  const reason = keybindingContext ? 'action_not_found' : 'no_context'

  // 每次挂载仅记录一次 fallback 使用（不是每次渲染），以避免
  // 频繁重新渲染产生的事件淹没分析数据。
  const hasLoggedRef = useRef(false)
  useEffect(() => {
    if (isFallback && !hasLoggedRef.current) {
      hasLoggedRef.current = true
      logEvent('tengu_keybinding_fallback_used', {
        action:
          action as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        context:
          context as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        fallback:
          fallback as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        reason:
          reason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    }
  }, [isFallback, action, context, fallback, reason])

  return isFallback ? fallback : resolved
}
