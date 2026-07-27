/**
 * 桌面端通知系统
 *
 * 替代 CLI 的 ink 通知系统，使用 Electron Notification API + 渲染进程 Toast。
 */

import React from 'react'
import { ipcRenderer } from 'electron'

// ─── 类型定义 ───
export type NotificationPriority = 'low' | 'medium' | 'high' | 'immediate'

export interface BaseNotification {
  key: string
  invalidates?: string[]
  priority?: NotificationPriority
  timeoutMs?: number
  fold?: (prev: Notification, next: Notification) => Notification
}

export interface TextNotification extends BaseNotification {
  type?: 'text'
  text: string
}

export interface JSXNotification extends BaseNotification {
  type: 'jsx'
  content: React.ReactNode
}

export type Notification = TextNotification | JSXNotification

export interface UseNotificationsReturn {
  addNotification: (notification: Notification) => void
  removeNotification: (key: string) => void
  notifications: Notification[]
}

// ─── 全局状态（单例） ───
type Listener = (notifications: Notification[]) => void

let notifications: Notification[] = []
let listeners = new Set<Listener>()
let idCounter = 0

function emitChange() {
  listeners.forEach(l => l(notifications))
}

function generateKey(): string {
  return `notif-${Date.now()}-${++idCounter}`
}

function sendElectronNotification(entry: Notification) {
  const text = entry.type === 'jsx' ? '' : (entry as TextNotification).text
  if (text) {
    ipcRenderer.invoke('doge:notify', 'Doge Code', text.slice(0, 200))
      .catch(() => {})
  }
}

function prioritize(notifications: Notification[], entry: Notification): Notification[] {
  const order = { immediate: 0, high: 1, medium: 2, low: 3 }
  const p = order[entry.priority || 'medium']
  const result: Notification[] = []
  let inserted = false
  for (const n of notifications) {
    if (!inserted && p <= order[n.priority || 'medium']) {
      result.push(entry)
      inserted = true
    }
    result.push(n)
  }
  if (!inserted) result.push(entry)
  return result
}

// ─── Hook ───
export function useNotifications(): UseNotificationsReturn {
  const snapshot = React.useSyncExternalStore(
    (listener: Listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    () => notifications,
    () => notifications,
  )

  const addNotification = React.useCallback((notif: Notification) => {
    const entry = notif.key ? notif : { ...notif, key: generateKey() }

    // invalidates
    if (entry.invalidates) {
      notifications = notifications.filter(n => !entry.invalidates!.includes(n.key))
    }

    // fold
    const existing = notifications.find(n => n.key === entry.key)
    if (existing?.fold) {
      notifications = notifications.map(n => n.key === entry.key ? existing.fold!(n, entry) : n)
      emitChange()
      return
    }

    notifications = prioritize(notifications, entry)
    emitChange()

    if (entry.priority === 'high' || entry.priority === 'immediate') {
      sendElectronNotification(entry)
    }

    if (entry.timeoutMs) {
      setTimeout(() => removeNotification(entry.key), entry.timeoutMs)
    }
  }, [])

  const removeNotification = React.useCallback((key: string) => {
    notifications = notifications.filter(n => n.key !== key)
    emitChange()
  }, [])

  return { addNotification, removeNotification, notifications: snapshot }
}

// ─── 非 React 上下文便捷函数 ───
export function addNotification(notif: Omit<Notification, 'key'> & { key?: string }): void {
  const entry = (notif.key ? notif : { ...notif, key: generateKey() }) as Notification
  if (entry.invalidates) notifications = notifications.filter(n => !entry.invalidates!.includes(n.key))
  notifications = [...notifications, entry]
  emitChange()
  if (entry.priority === 'high' || entry.priority === 'immediate') sendElectronNotification(entry)
  if (entry.timeoutMs) setTimeout(() => removeNotification(entry.key), entry.timeoutMs)
}

export function removeNotification(key: string): void {
  notifications = notifications.filter(n => n.key !== key)
  emitChange()
}

export function getNotifications(): Notification[] {
  return [...notifications]
}

// ─── 快捷函数 ───
export function notifySuccess(text: string, timeoutMs = 5000): void {
  addNotification({ type: 'text', text, priority: 'medium', timeoutMs, key: `success-${Date.now()}` })
}

export function notifyError(text: string, timeoutMs = 0): void {
  addNotification({ type: 'text', text, priority: 'high', timeoutMs: timeoutMs || undefined, key: `error-${Date.now()}` })
}

export function notifyInfo(text: string, timeoutMs = 8000): void {
  addNotification({ type: 'text', text, priority: 'low', timeoutMs, key: `info-${Date.now()}` })
}
