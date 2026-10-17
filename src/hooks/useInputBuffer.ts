import { useCallback, useState } from 'react'
import type { PastedContent } from '../utils/config.js'

export type BufferEntry = {
  text: string
  cursorOffset: number
  pastedContents: Record<number, PastedContent>
  timestamp: number
}

export type UseInputBufferProps = {
  maxBufferSize: number
}

export type UseInputBufferResult = {
  pushToBuffer: (
    text: string,
    cursorOffset: number,
    pastedContents?: Record<number, PastedContent>,
  ) => void
  undo: () => BufferEntry | undefined
  redo: () => BufferEntry | undefined
  jumpToIndex: (targetIndex: number) => BufferEntry | undefined
  canUndo: boolean
  canRedo: boolean
  getCurrentIndex: () => number
  getBuffer: () => BufferEntry[]
  clearBuffer: () => void
}

export function useInputBuffer({
  maxBufferSize,
}: UseInputBufferProps): UseInputBufferResult {
  const [buffer, setBuffer] = useState<BufferEntry[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const pushToBuffer = useCallback(
    (
      text: string,
      cursorOffset: number,
      pastedContents: Record<number, PastedContent> = {},
    ) => {
      const now = Date.now()

      // ponytail: 不做时间防抖。防抖会把 1 秒内的连续输入合并成一次，
      // 使中间快照（逐字符）丢失，导致撤销列表条目数与实际输入不符。
      // 逐字符快照是撤销历史的既有语义，去重由下方 lastEntry.text 判断承担。

      setBuffer(prevBuffer => {
        const newBuffer =
          currentIndex >= 0 ? prevBuffer.slice(0, currentIndex + 1) : prevBuffer

        const lastEntry = newBuffer[newBuffer.length - 1]
        if (lastEntry && lastEntry.text === text) {
          return newBuffer
        }

        const updatedBuffer = [
          ...newBuffer,
          { text, cursorOffset, pastedContents, timestamp: now },
        ]

        if (updatedBuffer.length > maxBufferSize) {
          return updatedBuffer.slice(-maxBufferSize)
        }

        return updatedBuffer
      })

      setCurrentIndex(prev => {
        const newIndex = prev >= 0 ? prev + 1 : buffer.length
        return Math.min(newIndex, maxBufferSize - 1)
      })
    },
    [maxBufferSize, currentIndex, buffer.length],
  )

  const undo = useCallback((): BufferEntry | undefined => {
    if (currentIndex <= 0 || buffer.length === 0) {
      return undefined
    }

    const targetIndex = currentIndex - 1
    const entry = buffer[targetIndex]

    if (entry) {
      setCurrentIndex(targetIndex)
      return entry
    }

    return undefined
  }, [buffer, currentIndex])

  const redo = useCallback((): BufferEntry | undefined => {
    if (currentIndex < 0 || currentIndex >= buffer.length - 1) {
      return undefined
    }

    const targetIndex = currentIndex + 1
    const entry = buffer[targetIndex]

    if (entry) {
      setCurrentIndex(targetIndex)
      return entry
    }

    return undefined
  }, [buffer, currentIndex])

  const jumpToIndex = useCallback((targetIndex: number): BufferEntry | undefined => {
    if (targetIndex < 0 || targetIndex >= buffer.length || buffer.length === 0) {
      return undefined
    }
    setCurrentIndex(targetIndex)
    return buffer[targetIndex]
  }, [buffer])

  const getCurrentIndex = useCallback(() => currentIndex, [currentIndex])

  const getBuffer = useCallback(() => buffer, [buffer])

  const clearBuffer = useCallback(() => {
    setBuffer([])
    setCurrentIndex(-1)
  }, [])

  const canUndo = currentIndex > 0 && buffer.length > 1
  const canRedo = currentIndex >= 0 && currentIndex < buffer.length - 1

  return {
    pushToBuffer,
    undo,
    redo,
    jumpToIndex,
    canUndo,
    canRedo,
    getCurrentIndex,
    getBuffer,
    clearBuffer,
  }
}
