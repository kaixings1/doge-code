import { useCallback, useRef, useState } from 'react'
import type { PastedContent } from '../utils/config.js'

export type BufferEntry = {
  text: string
  cursorOffset: number
  pastedContents: Record<number, PastedContent>
  timestamp: number
}

export type UseInputBufferProps = {
  maxBufferSize: number
  debounceMs: number
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
  debounceMs,
}: UseInputBufferProps): UseInputBufferResult {
  const [buffer, setBuffer] = useState<BufferEntry[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const lastPushTime = useRef<number>(0)
  const pendingPush = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushToBuffer = useCallback(
    (
      text: string,
      cursorOffset: number,
      pastedContents: Record<number, PastedContent> = {},
    ) => {
      const now = Date.now()

      if (pendingPush.current) {
        clearTimeout(pendingPush.current)
        pendingPush.current = null
      }

      if (now - lastPushTime.current < debounceMs) {
        pendingPush.current = setTimeout(
          pushToBuffer,
          debounceMs,
          text,
          cursorOffset,
          pastedContents,
        )
        return
      }

      lastPushTime.current = now

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
    [debounceMs, maxBufferSize, currentIndex, buffer.length],
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
    lastPushTime.current = 0
    if (pendingPush.current) {
      clearTimeout(pendingPush.current)
      pendingPush.current = null
    }
  }, [lastPushTime, pendingPush])

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
