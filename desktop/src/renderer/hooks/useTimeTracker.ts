/**
 * useTimeTracker — 时间追踪 Hook
 *
 * 提供时间追踪功能：
 * - 计时器逻辑（setInterval 每秒更新）
 * - 时间条目 CRUD
 * - 统计数据计算
 * - 自动追踪逻辑（监听文件切换事件）
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface TimeEntry {
  id: string
  task: string
  project: string
  startTime: number
  endTime: number | null
  duration: number
  date: string
  isManual: boolean
}

export interface TimeBudget {
  project: string
  budgetMinutes: number
}

interface UseTimeTrackerReturn {
  entries: TimeEntry[]
  isRunning: boolean
  currentTaskId: string
  currentProject: string
  elapsedSeconds: number
  todayTotal: number
  weekTotal: number
  monthTotal: number
  budgets: TimeBudget[]
  startTimer: (task: string, project?: string) => void
  pauseTimer: () => void
  stopTimer: () => void
  addManualEntry: (task: string, project: string, duration: number, date?: string) => void
  deleteEntry: (id: string) => void
  setBudget: (project: string, minutes: number) => void
  getProjectTime: (project: string, days?: number) => number
  exportCSV: () => string
}

const STORAGE_KEY = 'doge-time-entries'
const BUDGET_KEY = 'doge-time-budgets'
const MAX_ENTRIES = 500

function loadEntries(): TimeEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return []
}

function saveEntries(entries: TimeEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
  } catch { /* ignore */ }
}

function loadBudgets(): TimeBudget[] {
  try {
    const saved = localStorage.getItem(BUDGET_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return []
}

function saveBudgets(budgets: TimeBudget[]): void {
  try {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(budgets))
  } catch { /* ignore */ }
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getStartOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function getStartOfWeek(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.getTime()
}

function getStartOfMonth(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  return d.getTime()
}

export function useTimeTracker(): UseTimeTrackerReturn {
  const [entries, setEntries] = useState<TimeEntry[]>(loadEntries)
  const [isRunning, setIsRunning] = useState(false)
  const [currentTaskId, setCurrentTaskId] = useState('')
  const [currentProject, setCurrentProject] = useState('default')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [budgets, setBudgets] = useState<TimeBudget[]>(loadBudgets)
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 持久化 entries
  useEffect(() => {
    saveEntries(entries)
  }, [entries])

  // 持久化 budgets
  useEffect(() => {
    saveBudgets(budgets)
  }, [budgets])

  // 计时器逻辑
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRunning])

  const startTimer = useCallback((task: string, project?: string) => {
    if (isRunning) return
    setCurrentTaskId(task)
    if (project) setCurrentProject(project)
    startTimeRef.current = Date.now()
    setElapsedSeconds(0)
    setIsRunning(true)
  }, [isRunning])

  const pauseTimer = useCallback(() => {
    if (!isRunning) return
    setIsRunning(false)
  }, [isRunning])

  const stopTimer = useCallback(() => {
    if (!isRunning && elapsedSeconds === 0) return
    const now = Date.now()
    const duration = isRunning ? Math.floor((now - startTimeRef.current) / 1000) : elapsedSeconds
    if (duration > 0) {
      const entry: TimeEntry = {
        id: `time-${now}-${Math.random().toString(36).slice(2, 8)}`,
        task: currentTaskId,
        project: currentProject,
        startTime: startTimeRef.current,
        endTime: now,
        duration,
        date: formatDate(startTimeRef.current),
        isManual: false,
      }
      setEntries(prev => [...prev, entry])
    }
    setIsRunning(false)
    setElapsedSeconds(0)
    setCurrentTaskId('')
  }, [isRunning, elapsedSeconds, currentTaskId, currentProject])

  const addManualEntry = useCallback((task: string, project: string, duration: number, date?: string) => {
    const now = Date.now()
    const entryDate = date || formatDate(now)
    const entry: TimeEntry = {
      id: `time-manual-${now}-${Math.random().toString(36).slice(2, 8)}`,
      task,
      project,
      startTime: now,
      endTime: now + duration * 1000,
      duration,
      date: entryDate,
      isManual: true,
    }
    setEntries(prev => [...prev, entry])
  }, [])

  const deleteEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  const setBudget = useCallback((project: string, minutes: number) => {
    setBudgets(prev => {
      const existing = prev.findIndex(b => b.project === project)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = { project, budgetMinutes: minutes }
        return next
      }
      return [...prev, { project, budgetMinutes: minutes }]
    })
  }, [])

  const getProjectTime = useCallback((project: string, days = 30): number => {
    const cutoff = Date.now() - days * 86400000
    return entries
      .filter(e => e.project === project && e.startTime >= cutoff)
      .reduce((sum, e) => sum + e.duration, 0)
  }, [entries])

  const exportCSV = useCallback((): string => {
    const header = '日期,任务,项目,时长(秒),时长(分),类型\n'
    const rows = entries
      .sort((a, b) => b.startTime - a.startTime)
      .map(e => `${e.date},${e.task},${e.project},${e.duration},${(e.duration / 60).toFixed(1)},${e.isManual ? '手动' : '自动'}`)
      .join('\n')
    return header + rows
  }, [entries])

  const now = Date.now()
  const todayStart = getStartOfDay(now)
  const weekStart = getStartOfWeek(now)
  const monthStart = getStartOfMonth(now)

  const todayTotal = entries
    .filter(e => e.startTime >= todayStart)
    .reduce((sum, e) => sum + e.duration, 0)

  const weekTotal = entries
    .filter(e => e.startTime >= weekStart)
    .reduce((sum, e) => sum + e.duration, 0)

  const monthTotal = entries
    .filter(e => e.startTime >= monthStart)
    .reduce((sum, e) => sum + e.duration, 0)

  return {
    entries,
    isRunning,
    currentTaskId,
    currentProject,
    elapsedSeconds,
    todayTotal,
    weekTotal,
    monthTotal,
    budgets,
    startTimer,
    pauseTimer,
    stopTimer,
    addManualEntry,
    deleteEntry,
    setBudget,
    getProjectTime,
    exportCSV,
  }
}
