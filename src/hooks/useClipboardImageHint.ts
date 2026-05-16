import { useEffect, useRef } from 'react'
import { useNotifications } from '../context/notifications.js'
import { getShortcutDisplay } from '../keybindings/shortcutFormat.js'
import { hasImageInClipboard } from '../utils/imagePaste.js'

const NOTIFICATION_KEY = 'clipboard-image-hint'
// 小防抖以批处理快速焦点变化
const FOCUS_CHECK_DEBOUNCE_MS = 1000
// 不要在此间隔内多次显示提示
const HINT_COOLDOWN_MS = 30000

/**
 * 当终端重新获得焦点且剪贴板包含图像时显示通知的 Hook。
 *
 * @param isFocused - 终端当前是否处于聚焦状态
 * @param enabled - 图像粘贴是否已启用（onImagePaste 已定义）
 */
export function useClipboardImageHint(
  isFocused: boolean,
  enabled: boolean,
): void {
  const { addNotification } = useNotifications()
  const lastFocusedRef = useRef(isFocused)
  const lastHintTimeRef = useRef(0)
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // 仅在重新获得焦点时触发（之前失焦，现在聚焦）
    const wasFocused = lastFocusedRef.current
    lastFocusedRef.current = isFocused

    if (!enabled || !isFocused || wasFocused) {
      return
    }

    // 清除任何待处理的检查
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current)
    }

    // 小防抖以批处理快速焦点变化
    checkTimeoutRef.current = setTimeout(
      async (checkTimeoutRef, lastHintTimeRef, addNotification) => {
        checkTimeoutRef.current = null

        // 检查冷却时间以避免向用户发送垃圾通知
        const now = Date.now()
        if (now - lastHintTimeRef.current < HINT_COOLDOWN_MS) {
          return
        }

        // 检查剪贴板中是否有图像（异步 osascript 调用）
        if (await hasImageInClipboard()) {
          lastHintTimeRef.current = now
          addNotification({
            key: NOTIFICATION_KEY,
            text: `Image in clipboard · ${getShortcutDisplay('chat:imagePaste', 'Chat', 'ctrl+v')} to paste`,
            priority: 'immediate',
            timeoutMs: 8000,
          })
        }
      },
      FOCUS_CHECK_DEBOUNCE_MS,
      checkTimeoutRef,
      lastHintTimeRef,
      addNotification,
    )

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current)
        checkTimeoutRef.current = null
      }
    }
  }, [isFocused, enabled, addNotification])
}
