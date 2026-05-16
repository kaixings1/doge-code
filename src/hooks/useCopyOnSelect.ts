import { useEffect, useRef } from 'react'
import { useTheme } from '../components/design-system/ThemeProvider.js'
import type { useSelection } from '../ink/hooks/use-selection.js'
import { getGlobalConfig } from '../utils/config.js'
import { getTheme } from '../utils/theme.js'

type Selection = ReturnType<typeof useSelection>

/**
 * 当用户完成拖拽（鼠标松开时有非空选择）或多击选择单词/行时，
 * 自动将选择内容复制到剪贴板。
 * 类似 iTerm2 的"选中时复制到剪贴板" — 保留高亮以便用户看到复制的内容。
 * 仅在 alt-screen 模式下触发（选择状态由 ink 实例拥有；
 * 在 alt-screen 外，原生终端处理选择，此 hook 通过 ink 存根为空操作）。
 *
 * selection.subscribe 在每次变化时触发（开始/更新/结束/清除/
 * 多击）。字符拖拽和多击在按下时都将 isDragging 设置为 true，
 * 因此 isDragging=false 的出现总是拖拽结束。
 * copiedRef 防止在虚假通知上重复触发。
 *
 * onCopied 是可选的 — 省略时复制为静默（写入剪贴板但
 * 不触发 toast/notification）。FleetView 使用此静默模式；
 * 全屏 REPL 传递 showCopiedToast 以提供用户反馈。
 */
export function useCopyOnSelect(
  selection: Selection,
  isActive: boolean,
  onCopied?: (text: string) => void,
): void {
  // 跟踪*上一次*通知是否有 isDragging=false 的可见选择
  //（即我们已经自动复制了它）。没有这个，
  // finish→clear 的转换看起来就像一个新的选择空闲事件，
  // 我们会对一次拖拽触发两次 toast。
  const copiedRef = useRef(false)
  // onCopied 每次渲染都是新的闭包；通过 ref 读取以便
  // effect 不会重新订阅（重新订阅会通过卸载重置 copiedRef）。
  const onCopiedRef = useRef(onCopied)
  onCopiedRef.current = onCopied

  useEffect(() => {
    if (!isActive) return

    const unsubscribe = selection.subscribe(() => {
      const sel = selection.getState()
      const has = selection.hasSelection()
      // 拖拽进行中 — 等待完成。重置 copied 标志，以便
      // 在同一范围结束的新拖拽仍能触发新的复制。
      if (sel?.isDragging) {
        copiedRef.current = false
        return
      }
      // 无选择（已清除，或点击未拖拽）— 重置。
      if (!has) {
        copiedRef.current = false
        return
      }
      // 选择已稳定（拖拽完成或多击）。已经复制过了 —
      // 不经过 isDragging 或 !has 再次到达此处的唯一方式
      // 是虚假通知（不应发生，但安全起见）。
      if (copiedRef.current) return

      // 默认 true：macOS 用户期望 cmd+c 生效。但它不行 —
      // 终端的 Edit > Copy 在 pty 看到它之前拦截了它，
      // 并且找不到原生选择（鼠标跟踪禁用了它）。
      // 鼠标松开时自动复制使 cmd+c 成为空操作，
      // 保留剪贴板中的正确内容，因此粘贴按预期工作。
      const enabled = getGlobalConfig().copyOnSelect ?? true
      if (!enabled) return

      const text = selection.copySelectionNoClear()
      // 仅空白字符（例如空行多击）— 不值得写入剪贴板
      // 或触发 toast。仍设置 copiedRef 以便不重试。
      if (!text || !text.trim()) {
        copiedRef.current = true
        return
      }
      copiedRef.current = true
      onCopiedRef.current?.(text)
    })
    return unsubscribe
  }, [isActive, selection])
}

/**
 * 将主题的 selectionBg 颜色注入 Ink StylePool，以便
 * 选择覆盖层渲染为纯蓝色背景而非 SGR-7 反转。
 * Ink 与主题无关（分层：colorize.ts "主题解析发生在
 * 组件层，不在此处"）— 这是桥接。在挂载时触发
 *（在任何鼠标输入之前），并在 /theme 切换时再次触发，
 * 以便选择颜色实时跟踪主题。
 */
export function useSelectionBgColor(selection: Selection): void {
  const [themeName] = useTheme()
  useEffect(() => {
    selection.setSelectionBgColor(getTheme(themeName).selectionBg)
  }, [selection, themeName])
}
