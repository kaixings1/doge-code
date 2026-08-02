/**
 * PermissionPanel — 权限管理面板
 *
 * 功能：
 * - 显示房间内所有参与者及其权限
 * - 管理员可以修改参与者权限（只读/编辑/管理员）
 * - 权限说明和提示
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

interface Participant {
  id: string
  name: string
  color: string
  cursorLine?: number
  cursorCol?: number
  file?: string
}

export function PermissionPanel({ theme, roomId, userId }: { theme: ThemeColors; roomId: string; userId: string }): JSX.Element {
  const c = theme
  const [participants, setParticipants] = useState<Participant[]>([])
  const [permissions, setPermissions] = useState<Record<string, string>>({})
  const [myPermission, setMyPermission] = useState<string>('read')
  const api = (window as any).dogeAPI as Record<string, any>

  const loadData = useCallback(async () => {
    if (!roomId) return
    const p = await api.collabGetParticipants(roomId)
    if (p?.participants) setParticipants(p.participants)
    const myPerm = await api.collabGetPermission({ roomId, userId })
    if (myPerm?.permission) setMyPermission(myPerm.permission)
    const perms: Record<string, string> = {}
    for (const part of p?.participants || []) {
      const perm = await api.collabGetPermission({ roomId, userId: part.id })
      perms[part.id] = perm?.permission || 'read'
    }
    setPermissions(perms)
  }, [roomId, userId, api])

  useEffect(() => { loadData() }, [loadData])

  const handleSetPermission = useCallback(async (targetUserId: string, permission: string) => {
    await api.collabSetPermission({ roomId, userId: targetUserId, permission })
    loadData()
  }, [roomId, api, loadData])

  const isAdmin = myPermission === 'admin'

  return (
    <div style={{ fontSize: '11px', padding: '8px' }}>
      <div style={{ marginBottom: '8px', padding: '6px', background: `${c.accent}11`, borderRadius: '3px' }}>
        <span style={{ color: c.accent, fontWeight: 600 }}>权限管理</span>
        <span style={{ color: c.textFaint, marginLeft: '8px' }}>您的权限: {myPermission}</span>
      </div>

      {participants.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: `1px solid ${c.borderSubtle}` }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ flex: 1, color: c.text, fontSize: '10px' }}>{p.name}</span>
          {isAdmin && p.id !== userId ? (
            <select
              value={permissions[p.id] || 'read'}
              onChange={e => handleSetPermission(p.id, e.target.value)}
              style={{ fontSize: '9px', padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text }}
            >
              <option value="read">只读</option>
              <option value="write">编辑</option>
              <option value="admin">管理员</option>
            </select>
          ) : (
            <span style={{ color: c.textFaint, fontSize: '9px' }}>{permissions[p.id] || 'read'}</span>
          )}
        </div>
      ))}

      <div style={{ marginTop: '8px', padding: '6px', background: c.codeBg, borderRadius: '3px', fontSize: '9px', color: c.textFaint }}>
        <div>权限说明：</div>
        <div>• <strong>只读</strong>：只能查看，不能编辑</div>
        <div>• <strong>编辑</strong>：可以编辑文档和评论</div>
        <div>• <strong>管理员</strong>：可以修改权限和管理房间</div>
      </div>
    </div>
  )
}
