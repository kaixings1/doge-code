/**
 * 虚拟列表 Hook - 仅渲染可视区域内的项目
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface UseVirtualListOptions {
  itemCount: number
  itemHeight: number
  overscan?: number
  containerHeight: number
  scrollTop: number
}

interface VirtualItem {
  index: number
  offsetTop: number
}

export function useVirtualList({
  itemCount,
  itemHeight,
  overscan = 5,
  containerHeight,
  scrollTop,
}: UseVirtualListOptions) {
  const totalHeight = itemCount * itemHeight
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const visibleCount = Math.ceil(containerHeight / itemHeight) + overscan * 2
  const endIndex = Math.min(itemCount, startIndex + visibleCount)

  const items: VirtualItem[] = []
  for (let i = startIndex; i < endIndex; i++) {
    items.push({ index: i, offsetTop: i * itemHeight })
  }

  return {
    items,
    totalHeight,
    startIndex,
    endIndex,
  }
}

/**
 * 带动态高度测量的虚拟列表
 */
export function useDynamicVirtualList<T extends { id: string }>(
  items: T[],
  estimatedItemHeight: number = 80,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const [heights, setHeights] = useState<Map<string, number>>(new Map())
  const [isAtBottom, setIsAtBottom] = useState(true)

  // 测量项目高度
  const measureItem = useCallback((id: string, height: number) => {
    setHeights(prev => {
      if (prev.get(id) === height) return prev
      const next = new Map(prev)
      next.set(id, height)
      return next
    })
  }, [])

  // 滚动处理
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
    setContainerHeight(el.clientHeight)
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    setIsAtBottom(atBottom)
  }, [])

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    const el = containerRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [])

  // 初始化容器高度
  useEffect(() => {
    const el = containerRef.current
    if (el) {
      setContainerHeight(el.clientHeight)
    }
  }, [])

  // 计算偏移量
  const getOffsetTop = useCallback((index: number): number => {
    let offset = 0
    for (let i = 0; i < index; i++) {
      offset += heights.get(items[i]?.id ?? '') ?? estimatedItemHeight
    }
    return offset
  }, [items, heights, estimatedItemHeight])

  // 计算总高度
  const totalHeight = items.reduce((sum, item) => {
    return sum + (heights.get(item.id) ?? estimatedItemHeight)
  }, 0)

  // 计算可视范围
  const visibleRange = useCallback(() => {
    if (!containerHeight) return { start: 0, end: items.length }
    let accumulated = 0
    let start = 0
    let end = items.length

    // 找到起始位置
    for (let i = 0; i < items.length; i++) {
      const h = heights.get(items[i]?.id ?? '') ?? estimatedItemHeight
      if (accumulated + h > scrollTop) {
        start = Math.max(0, i - 3)
        break
      }
      accumulated += h
    }

    // 找到结束位置
    accumulated = 0
    for (let i = start; i < items.length; i++) {
      const h = heights.get(items[i]?.id ?? '') ?? estimatedItemHeight
      accumulated += h
      if (accumulated > containerHeight + scrollTop) {
        end = Math.min(items.length, i + 3)
        break
      }
    }

    return { start, end }
  }, [items, heights, scrollTop, containerHeight, estimatedItemHeight])

  const { start, end } = visibleRange()
  const visibleItems = items.slice(start).map((item, i) => ({
    item,
    index: start + i,
    offsetTop: getOffsetTop(start + i),
  }))

  return {
    containerRef,
    visibleItems,
    totalHeight,
    handleScroll,
    scrollToBottom,
    measureItem,
    isAtBottom,
    start,
    end,
  }
}
