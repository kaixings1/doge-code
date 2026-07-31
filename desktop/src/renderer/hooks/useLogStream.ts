import { useEffect, useRef, useState, useCallback } from 'react'

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  timestamp: string
  message: string
}

export interface UseLogStreamOptions {
  autoStart?: boolean
  levelFilter?: string
  maxEntries?: number
}

export interface UseLogStreamResult {
  logs: LogEntry[]
  connected: boolean
  levelFilter: string
  paused: boolean
  maxEntries: number
  setLevelFilter: (level: string) => void
  togglePause: () => void
  clear: () => void
  start: () => Promise<void>
  stop: () => Promise<void>
}

export function useLogStream(options: UseLogStreamOptions = {}): UseLogStreamResult {
  const { autoStart = false, levelFilter: initialLevelFilter = 'all', maxEntries: initialMaxEntries = 500 } = options

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const [levelFilter, setLevelFilter] = useState(initialLevelFilter)
  const [paused, setPaused] = useState(false)
  const [maxEntries, setMaxEntries] = useState(initialMaxEntries)

  const pausedRef = useRef(paused)
  const levelFilterRef = useRef(levelFilter)

  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { levelFilterRef.current = levelFilter }, [levelFilter])

  const start = useCallback(async () => {
    try {
      const optionsForStart = levelFilter === 'all' ? undefined : { level: levelFilter }
      const result = await window.dogeAPI.logStreamStart(optionsForStart)
      if (result.success) {
        setConnected(true)
      }
    } catch {
      // ignore
    }
  }, [levelFilter])

  const stop = useCallback(async () => {
    try {
      await window.dogeAPI.logStreamStop()
      setConnected(false)
    } catch {
      // ignore
    }
  }, [])

  const togglePause = useCallback(() => {
    setPaused(prev => !prev)
  }, [])

  const clear = useCallback(() => {
    setLogs([])
  }, [])

  useEffect(() => {
    if (!autoStart) return
    start()
    return () => { stop() }
  }, [autoStart, start, stop])

  useEffect(() => {
    const unsubscribe = window.dogeAPI.onLogEntry((entry) => {
      setLogs(prev => {
        if (pausedRef.current) return prev
        const next = [...prev, entry as LogEntry]
        return next.length > (maxEntries || 500) ? next.slice(next.length - (maxEntries || 500)) : next
      })
    })
    return unsubscribe
  }, [maxEntries])

  useEffect(() => {
    return () => {
      stop().catch(() => {})
    }
  }, [stop])

  return {
    logs,
    connected,
    levelFilter,
    paused,
    maxEntries,
    setLevelFilter,
    togglePause,
    clear,
    start,
    stop,
  }
}

