import { useContext } from 'react'
import {
  type TerminalSize,
  TerminalSizeContext,
} from '../ink/components/TerminalSizeContext.js'

export function useTerminalSize(): TerminalSize {
  const size = useContext(TerminalSizeContext)

  if (!size) {
    throw new Error('useTerminalSize 必须在 Ink App 组件内使用')
  }

  return size
}

/**
 * 安全版本的 useTerminalSize，在 Context 不可用时返回默认值而不是抛出异常。
 * 适用于在 Ink App 树外渲染的组件（如 /btw 命令的 JSX）。
 */
export function useSafeTerminalSize(): { rows: number; columns: number } {
  const size = useContext(TerminalSizeContext)
  if (!size) {
    return { rows: 24, columns: 80 }
  }
  return size
}
