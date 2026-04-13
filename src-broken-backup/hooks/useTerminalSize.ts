import { useContext } from 'react'
import {
  type TerminalSize,
  TerminalSizeContext,
} from '../../ink/components/TerminalSizeContext.js'

export function useTerminalSize(): TerminalSize {
  const size = useContext(TerminalSizeContext)

  if (!size) {
    throw new Error('useTerminalSize 必须）Ink App 组件内使）)
  }

  return size
}
