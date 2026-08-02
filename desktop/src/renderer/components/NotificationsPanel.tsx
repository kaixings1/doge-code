/**
 * NotificationsPanel — 评论通知面板
 *
 * 功能：
 * - 显示房间内所有通知（评论/提及/问题/权限）
 * - 标记通知为已读
 * - 显示未读数量
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

interface Notification {
  id: string
  type: 'comment' | 'mention' | 'issue' | 'permission'
  message: string
  from: string
  timestamp: number
  read: boolean
}

const TYPE_ICONS: Record<string, string> = { comment: '💬', mention: '📢', issue: '🔴', permission: '🔐' }
const TYPE_LABELS: Record<string, string> = { comment: '评论', mention: '提及', issue: '问题', permission: '权限' }

export function NotificationsPanel({ theme, roomId }: { theme: ThemeColors; roomId: string }): JSX.Element {
  const c = theme
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const api = (window as any).dogeAPI as Record<string, any>

  const loadData = useCallback(async () => {
    if (!roomId) return
    const result = await api.notifyList({ roomId })
    if (result?.notifications) setNotifications(result.notifications)
    const count = await api.notifyUnreadCount({ roomId })
    if (count?.count !== undefined) setUnreadCount(count.count)
  }, [roomId, api])

  useEffect(() => { loadData(); const timer = setInterval(loadData, 5000); return () => clearInterval(timer) }, [loadData])

  const handleMarkRead = useCallback(async (id: string) => {
    await api.notifyMarkRead({ roomId, notificationId: id })
    loadData()
  }, [roomId, api, loadData])

  return (
    <div style={{ fontSize: '11px', padding: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ color: c.accent, fontWeight: 600 }}>通知</span>
        {unreadCount > 0 && (
          <span style={{ padding: '1px 6px', borderRadius: '8px', background: c.accent, color: '#000', fontSize: '8px', fontWeight: 600 }}>{unreadCount}</span>
        )}
      </div>

      {notifications.length === 0 ? (
        <div style={{ padding: '12px', textAlign: 'center', color: c.textFaint, fontSize: '10px' }}>暂无通知</div>
      ) : notifications.map(n => (
        <div key={n.id} onClick={() => !n.read && handleMarkRead(n.id)} style={{
          padding: '6px', borderBottom: `1px solid ${c.borderSubtle}`, borderRadius: '2px', cursor: 'pointer',
          background: n.read ? 'transparent' : `${c.accent}08`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px' }}>{TYPE_ICONS[n.type]} {n.message}</span>
            {!n.read && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: c.accent, flexShrink: 0 }} />}
          </div>
          <div style={{ color: c.textFaint, fontSize: '8px', marginTop: '2px' }}>
            {TYPE_LABELS[n.type]} · {n.from} · {new Date(n.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ))}
    </div>
  )
}
