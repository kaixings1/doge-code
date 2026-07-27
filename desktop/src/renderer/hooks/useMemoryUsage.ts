/**
 * Hook to monitor Node.js process memory usage.
 * Polls every 10 seconds; returns null while status is 'normal'.
 */

import { useEffect, useState } from 'react'

export type MemoryUsageStatus = 'normal' | 'high' | 'critical'

export type MemoryUsageInfo = {
  heapUsed: number
  status: MemoryUsageStatus
}

const HIGH_MEMORY_THRESHOLD = 1.5 * 1024 * 1024 * 1024 // 1.5GB in bytes
const CRITICAL_MEMORY_THRESHOLD = 2.5 * 1024 * 1024 * 1024 // 2.5GB in bytes

export function useMemoryUsage(): MemoryUsageInfo | null {
  const [memoryUsage, setMemoryUsage] = useState<MemoryUsageInfo | null>(null)

  useEffect(() => {
    const id = setInterval(() => {
      const heapUsed = process.memoryUsage().heapUsed
      const status: MemoryUsageStatus =
        heapUsed >= CRITICAL_MEMORY_THRESHOLD
          ? 'critical'
          : heapUsed >= HIGH_MEMORY_THRESHOLD
            ? 'high'
            : 'normal'
      setMemoryUsage(prev => {
        if (status === 'normal') return prev === null ? prev : null
        return { heapUsed, status }
      })
    }, 10_000)
    return () => clearInterval(id)
  }, [])

  return memoryUsage
}
