import { useCallback, useSyncExternalStore } from 'react'
import { formatDuration } from '../utils/format.js'

/**
 * Hook，返回自 startTime 以来格式化后的已用时间。
 * 使用 useSyncExternalStore 配合基于间隔的更新以实现高效。
 *
 * @param startTime - Unix 时间戳（毫秒）
 * @param isRunning - 是否主动更新计时器
 * @param ms - 多久触发一次更新？
 * @param pausedMs - 要减去的总暂停时长
 * @param endTime - 如果设置，将持续时间冻结在此时间戳（用于
 *   终端任务）。不设置的话，查看一个 2 分钟的任务在完成 30 分钟后
 *   会显示 "32m"。
 * @returns 格式化后的持续时间字符串（例如 "1m 23s"）
 */
export function useElapsedTime(
  startTime: number,
  isRunning: boolean,
  ms: number = 1000,
  pausedMs: number = 0,
  endTime?: number,
): string {
  const get = () =>
    formatDuration(Math.max(0, (endTime ?? Date.now()) - startTime - pausedMs))

  const subscribe = useCallback(
    (notify: () => void) => {
      if (!isRunning) return () => {}
      const interval = setInterval(notify, ms)
      return () => clearInterval(interval)
    },
    [isRunning, ms],
  )

  return useSyncExternalStore(subscribe, get, get)
}
