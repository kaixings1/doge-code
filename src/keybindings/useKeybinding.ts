import { useCallback, useEffect } from 'react'
import type { InputEvent } from '../ink/events/input-event.js'
import { type Key, useInput } from '../ink.js'
import { useOptionalKeybindingContext } from './KeybindingContext.js'
import type { KeybindingContextName } from './types.js'

type Options = {
  /** 此绑定属于哪个上下文（默认：'Global'） */
  context?: KeybindingContextName
  /** 仅当活动时处理（类似 useInput 的 isActive） */
  isActive?: boolean
}

/**
 * Ink 原生的按键绑定处理 hook。
 *
 * 处理函数保留在组件中（React 方式）。
 * 绑定（按键 → 动作）来自配置。
 *
 * 支持和弦序列（例如 "ctrl+k ctrl+s"）。当和弦开始时，
 * hook 会自动管理待定状态。
 *
 * 使用 stopImmediatePropagation() 防止其他处理函数在此绑定
 * 被处理后触发。
 *
 * @example
 * ```tsx
 * useKeybinding('app:toggleTodos', () => {
 *   setShowTodos(prev => !prev)
 * }, { context: 'Global' })
 * ```
 */
export function useKeybinding(
  action: string,
  handler: () => void | false | Promise<void>,
  options: Options = {},
): void {
  const { context = 'Global', isActive = true } = options
  const keybindingContext = useOptionalKeybindingContext()

  // 向上下文注册处理函数，供 ChordInterceptor 调用
  useEffect(() => {
    if (!keybindingContext || !isActive) return
    return keybindingContext.registerHandler({ action, context, handler })
  }, [action, context, handler, keybindingContext, isActive])

  const handleInput = useCallback(
    (input: string, key: Key, event: InputEvent) => {
      // 如果没有按键绑定上下文可用，跳过解析
      if (!keybindingContext) return

      // 构建上下文列表：已注册的活动上下文 + 当前上下文 + Global
      // 更具体的上下文（已注册的）优先于 Global
      const contextsToCheck: KeybindingContextName[] = [
        ...keybindingContext.activeContexts,
        context,
        'Global',
      ]
      // 去重同时保持顺序（优先使用首次出现项）
      const uniqueContexts = [...new Set(contextsToCheck)]

      const result = keybindingContext.resolve(input, key, uniqueContexts)

      switch (result.type) {
        case 'match':
          // 和弦已完成 - 清除待定状态
          keybindingContext.setPendingChord(null)
          if (result.action === action) {
            if (handler() !== false) {
              event.stopImmediatePropagation()
            }
          }
          break
        case 'chord_started':
          // 用户开始了一个和弦序列 - 更新待定状态
          keybindingContext.setPendingChord(result.pending)
          event.stopImmediatePropagation()
          break
        case 'chord_cancelled':
          // 和弦已被取消（escape 或无效按键）
          keybindingContext.setPendingChord(null)
          break
        case 'unbound':
          // 显式解绑 - 清除所有待定和弦
          keybindingContext.setPendingChord(null)
          event.stopImmediatePropagation()
          break
        case 'none':
          // 无匹配 - 让其他处理函数尝试
          break
      }
    },
    [action, context, handler, keybindingContext],
  )

  useInput(handleInput, { isActive })
}

/**
 * 在一个 hook 中处理多个按键绑定（减少 useInput 调用）。
 *
 * 支持和弦序列。当和弦开始时，hook 会自动管理待定状态。
 *
 * @example
 * ```tsx
 * useKeybindings({
 *   'chat:submit': () => handleSubmit(),
 *   'chat:cancel': () => handleCancel(),
 * }, { context: 'Chat' })
 * ```
 */
export function useKeybindings(
  // handler 返回 `false` 表示"未消费"——事件会继续传播
  // 给后面的 useInput/useKeybindings 处理函数。适用于穿透：
  // 例如 ScrollKeybindingHandler 的 scroll:line* 在 ScrollBox
  // 内容适合时返回 false（滚动是无操作的），让子组件的处理函数
  // 取而代之接管滚轮事件进行列表导航。Promise<void>
  // 允许用于即发即弃的异步处理函数（`!== false` 检查
  // 只对同步的 `false` 跳过传播，而非待定的 Promise）。
  handlers: Record<string, () => void | false | Promise<void>>,
  options: Options = {},
): void {
  const { context = 'Global', isActive = true } = options
  const keybindingContext = useOptionalKeybindingContext()

  // 向上下文注册所有处理函数，供 ChordInterceptor 调用
  useEffect(() => {
    if (!keybindingContext || !isActive) return

    const unregisterFns: Array<() => void> = []
    for (const [action, handler] of Object.entries(handlers)) {
      unregisterFns.push(
        keybindingContext.registerHandler({ action, context, handler }),
      )
    }

    return () => {
      for (const unregister of unregisterFns) {
        unregister()
      }
    }
  }, [context, handlers, keybindingContext, isActive])

  const handleInput = useCallback(
    (input: string, key: Key, event: InputEvent) => {
      // 如果没有按键绑定上下文可用，跳过解析
      if (!keybindingContext) return

      // 构建上下文列表：已注册的活动上下文 + 当前上下文 + Global
      // 更具体的上下文（已注册的）优先于 Global
      const contextsToCheck: KeybindingContextName[] = [
        ...keybindingContext.activeContexts,
        context,
        'Global',
      ]
      // 去重同时保持顺序（优先使用首次出现项）
      const uniqueContexts = [...new Set(contextsToCheck)]

      const result = keybindingContext.resolve(input, key, uniqueContexts)

      switch (result.type) {
        case 'match':
          // 和弦已完成 - 清除待定状态
          keybindingContext.setPendingChord(null)
          if (result.action in handlers) {
            const handler = handlers[result.action]
            if (handler && handler() !== false) {
              event.stopImmediatePropagation()
            }
          }
          break
        case 'chord_started':
          // 用户开始了一个和弦序列 - 更新待定状态
          keybindingContext.setPendingChord(result.pending)
          event.stopImmediatePropagation()
          break
        case 'chord_cancelled':
          // 和弦已被取消（escape 或无效按键）
          keybindingContext.setPendingChord(null)
          break
        case 'unbound':
          // 显式解绑 - 清除所有待定和弦
          keybindingContext.setPendingChord(null)
          event.stopImmediatePropagation()
          break
        case 'none':
          // 无匹配 - 让其他处理函数尝试
          break
      }
    },
    [context, handlers, keybindingContext],
  )

  useInput(handleInput, { isActive })
}
