/**
 * CollaborationPanel — 协作功能面板
 *
 * 功能：
 * - 实时协作（房间创建/加入/离开 + 光标同步 + CRDT 文档同步）
 * - 评论标注（行内评论 + 解决/关闭）
 * - 远程协助（WebRTC 屏幕共享 + 远程控制信令）
 * - CRDT 引擎驱动实时文档协作（操作日志 + 操作变换）
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeColors } from '../theme.js'
import { RemoteControlPanel } from './RemoteControlPanel.js'

interface Participant {
  id: string
  name: string
  color: string
  cursorLine?: number
  cursorCol?: number
  file?: string
}

interface CommentItem {
  id: string
  file: string
  line: number
  author: string
  text: string
  resolved: boolean
  createdAt: number
}

interface RoomInfo {
  id: string
  name: string
  hostId: string
  participantCount: number
  commentCount: number
}

type TabId = 'rooms' | 'participants' | 'comments' | 'remote' | 'document'

export function CollaborationPanel({ cwd, theme, onClose }: { cwd: string; theme: ThemeColors; onClose: () => void }): JSX.Element {
  const c = theme
  const [activeTab, setActiveTab] = useState<TabId>('rooms')
  const [roomName, setRoomName] = useState('')
  const [rooms, setRooms] = useState<RoomInfo[]>([])
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [comments, setComments] = useState<CommentItem[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentFile, setCommentFile] = useState('')
  const [commentLine, setCommentLine] = useState(0)

  const [errorMsg, setErrorMsg] = useState('')
  // CRDT 文档同步状态
  const [docContent, setDocContent] = useState('')
  const [docVersion, setDocVersion] = useState(0)
  const [syncStatus, setSyncStatus] = useState('')

  const api = (window as any).dogeAPI as Record<string, any> | undefined

  const refreshRooms = useCallback(async () => {
    if (!api?.collabListRooms) return
    const result = await api.collabListRooms()
    if (result?.success && result?.rooms) setRooms(result.rooms)
  }, [api])

  useEffect(() => {
    refreshRooms()
    const timer = setInterval(refreshRooms, 3000)
    return () => clearInterval(timer)
  }, [refreshRooms])

  // 加入房间时同步 CRDT 文档
  useEffect(() => {
    if (!currentRoomId || !api?.collabJoinSync) return
    let cancelled = false

    const syncDoc = async () => {
      const result = await api.collabJoinSync({ roomId: currentRoomId, userId: userId || 'unknown' })
      if (!cancelled && result?.success && result?.snapshot) {
        setDocContent(result.snapshot.content || '')
        setDocVersion(result.snapshot.version || 0)
        setSyncStatus('已同步 (CRDT v' + (result.snapshot.version || 0) + ')')
      }
    }
    syncDoc()

    return () => { cancelled = true }
  }, [currentRoomId, userId, api])

  // 监听远程编辑事件（CRDT 实时同步）
  useEffect(() => {
    if (!currentRoomId || !api?.onCollabRemoteEdit) return
    const unsub = api.onCollabRemoteEdit((edit: { roomId: string; userId: string; operation: { type: string; position: number; text?: string; length?: number }; version: number; file: string }) => {
      if (edit.roomId === currentRoomId && edit.userId !== userId) {
        setDocContent(prev => {
          if (edit.operation.type === 'insert' && edit.operation.text) {
            const pos = Math.min(edit.operation.position, prev.length)
            return prev.slice(0, pos) + edit.operation.text + prev.slice(pos)
          }
          if (edit.operation.type === 'delete' && edit.operation.length) {
            const pos = Math.min(edit.operation.position, prev.length)
            return prev.slice(0, pos) + prev.slice(pos + edit.operation.length)
          }
          return prev
        })
        setDocVersion(edit.version)
        setSyncStatus('实时同步中 (v' + edit.version + ')')
      }
    })
    return unsub
  }, [currentRoomId, userId, api])

  useEffect(() => {
    if (!currentRoomId || !api?.collabGetParticipants) return
    let cancelled = false
    const tick = async () => {
      const p = await api.collabGetParticipants(currentRoomId)
      const cm = await api.collabGetComments({ roomId: currentRoomId })
      if (!cancelled) {
        if (p?.success && p?.participants) setParticipants(p.participants)
        if (cm?.success && cm?.comments) setComments(cm.comments)
      }
    }
    tick()
    const timer = setInterval(tick, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [currentRoomId, api])

  // 文档编辑：本地操作 + CRDT 广播
  const handleDocInsert = useCallback(async (position: number, text: string) => {
    if (!currentRoomId || !userId || !api?.collabApplyEdit) return
    const result = await api.collabApplyEdit({
      roomId: currentRoomId,
      userId,
      file: 'document',
      operation: { type: 'insert', position, text }
    })
    if (result?.success) {
      setDocVersion(result.version || 0)
      // 更新本地显示
      setDocContent(prev => {
        const pos = Math.min(position, prev.length)
        return prev.slice(0, pos) + text + prev.slice(pos)
      })
    }
  }, [currentRoomId, userId, api])

  const handleDocDelete = useCallback(async (position: number, length: number) => {
    if (!currentRoomId || !userId || !api?.collabApplyEdit) return
    const result = await api.collabApplyEdit({
      roomId: currentRoomId,
      userId,
      file: 'document',
      operation: { type: 'delete', position, length }
    })
    if (result?.success) {
      setDocVersion(result.version || 0)
      setDocContent(prev => {
        const pos = Math.min(position, prev.length)
        return prev.slice(0, pos) + prev.slice(pos + length)
      })
    }
  }, [currentRoomId, userId, api])

  const handleCreateRoom = useCallback(async () => {
    if (!roomName.trim() || !api?.collabCreateRoom) return
    setErrorMsg('')
    const result = await api.collabCreateRoom({ name: roomName.trim(), cwd })
    if (result?.success) {
      setCurrentRoomId(result.roomId)
      setUserId(result.hostId)
      setActiveTab('participants')
    } else {
      setErrorMsg(result?.error || '创建失败')
    }
  }, [roomName, api, cwd])

  const handleJoinRoom = useCallback(async (roomId: string) => {
    if (!api?.collabJoinRoom) return
    setErrorMsg('')
    const result = await api.collabJoinRoom(roomId)
    if (result?.success) {
      setCurrentRoomId(result.roomId)
      setUserId(result.userId)
      setParticipants(result.participants || [])
      setComments(result.comments || [])
      setActiveTab('participants')
    } else {
      setErrorMsg(result?.error || '加入失败')
    }
  }, [api])

  const handleLeaveRoom = useCallback(async () => {
    if (!currentRoomId || !userId || !api?.collabLeaveRoom) return
    await api.collabLeaveRoom({ roomId: currentRoomId, userId })
    setCurrentRoomId(null)
    setUserId(null)
    setParticipants([])
    setComments([])
    setDocContent('')
    setDocVersion(0)
    setSyncStatus('')
    setActiveTab('rooms')
  }, [currentRoomId, userId, api])

  const handleAddComment = useCallback(async () => {
    if (!currentRoomId || !commentText.trim() || !api?.collabAddComment) return
    const result = await api.collabAddComment({
      roomId: currentRoomId,
      file: commentFile || 'unknown',
      line: commentLine,
      author: userId || '匿名',
      text: commentText.trim()
    })
    if (result?.success) {
      setCommentText('')
      setComments(prev => [...prev, result.comment!])
    }
  }, [currentRoomId, commentText, commentFile, commentLine, userId, api])

  const handleResolveComment = useCallback(async (commentId: string) => {
    if (!currentRoomId || !api?.collabResolveComment) return
    await api.collabResolveComment({ roomId: currentRoomId, commentId })
    setComments(prev => prev.map(cm => cm.id === commentId ? { ...cm, resolved: true } : cm))
  }, [currentRoomId, api])


  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 标签页导航 */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${c.border}`, background: c.bgPanel }}>
        {([
          { id: 'rooms', label: '房间' },
          { id: 'participants', label: '协作者' },
          { id: 'comments', label: '评论' },
          { id: 'document', label: '文档' },
          { id: 'remote', label: '远程' }
        ] as { id: TabId; label: string }[]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: '6px', border: 'none', borderBottom: activeTab === tab.id ? `2px solid ${c.accent}` : '2px solid transparent',
            background: activeTab === tab.id ? `${c.accent}11` : 'transparent',
            color: activeTab === tab.id ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '10px'
          }}>{tab.label}</button>
        ))}
        <span onClick={onClose} style={{ padding: '4px 8px', cursor: 'pointer', color: c.textFaint, fontSize: '12px' }}>✕</span>
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {activeTab === 'rooms' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="房间名称" style={{ flex: 1, padding: '4px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none' }} />
              <button onClick={handleCreateRoom} disabled={currentRoomId !== null} style={{ padding: '4px 10px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}>创建</button>
            </div>
            {errorMsg && <div style={{ padding: '4px 6px', background: `${c.errorText}22`, color: c.errorText, borderRadius: '3px', fontSize: '9px' }}>{errorMsg}</div>}
            {currentRoomId && (
              <div style={{ padding: '6px 8px', background: `${c.accent}11`, border: `1px solid ${c.accent}`, borderRadius: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: c.accent, fontSize: '10px' }}>当前房间: {currentRoomId}</span>
                <button onClick={handleLeaveRoom} style={{ padding: '2px 8px', border: `1px solid ${c.errorText}`, borderRadius: '2px', background: 'transparent', color: c.errorText, cursor: 'pointer', fontSize: '9px' }}>离开</button>
              </div>
            )}
            {rooms.length === 0 ? <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint, fontSize: '10px' }}>暂无活跃房间</div> : rooms.map(room => (
              <div key={room.id} style={{ padding: '8px', borderBottom: `1px solid ${c.borderSubtle}`, borderRadius: '3px', cursor: currentRoomId === room.id ? 'default' : 'pointer', background: currentRoomId === room.id ? c.accentDim : 'transparent' }} onClick={() => !currentRoomId && handleJoinRoom(room.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: c.text, fontSize: '10px', fontWeight: 500 }}>{room.name || '未命名房间'}</span>
                  <span style={{ color: c.textFaint, fontSize: '9px' }}>👥 {room.participantCount} · 💬 {room.commentCount}</span>
                </div>
                <div style={{ color: c.textFaint, fontSize: '9px', marginTop: '2px' }}>ID: {room.id.slice(-8)}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'participants' && (
          <div>
            {!currentRoomId ? (
              <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint, fontSize: '10px' }}>请先加入或创建一个房间</div>
            ) : participants.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint, fontSize: '10px' }}>暂无协作者</div>
            ) : participants.map(p => (
              <div key={p.id} style={{ padding: '6px 8px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ color: c.text, fontSize: '10px' }}>{p.name}</span>
                {p.cursorLine != null && <span style={{ color: c.textFaint, fontSize: '9px', marginLeft: 'auto' }}>L{p.cursorLine}:{p.cursorCol || 0}</span>}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'comments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
              <input value={commentFile} onChange={e => setCommentFile(e.target.value)} placeholder="文件" style={{ flex: 1, padding: '3px 5px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }} />
              <input value={String(commentLine)} onChange={e => setCommentLine(Number(e.target.value) || 0)} placeholder="行" style={{ width: '40px', padding: '3px 5px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="添加评论..." onKeyDown={e => { if (e.key === 'Enter') handleAddComment() }} style={{ flex: 1, padding: '3px 5px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }} />
              <button onClick={handleAddComment} disabled={!currentRoomId} style={{ padding: '3px 8px', border: 'none', borderRadius: '2px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '9px' }}>+</button>
            </div>
            {!currentRoomId ? (
              <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint, fontSize: '10px' }}>加入房间后可查看/添加评论</div>
            ) : comments.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint, fontSize: '10px' }}>暂无评论</div>
            ) : comments.filter(cm => !cm.resolved).map(cm => (
              <div key={cm.id} style={{ padding: '6px 8px', borderBottom: `1px solid ${c.borderSubtle}`, borderRadius: '2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span style={{ color: c.accent, fontSize: '9px' }}>{cm.author} · {cm.file}:{cm.line}</span>
                  <span style={{ color: c.textFaint, fontSize: '8px' }}>{formatTime(cm.createdAt)}</span>
                </div>
                <div style={{ color: c.text, fontSize: '10px', marginBottom: '3px' }}>{cm.text}</div>
                <button onClick={() => handleResolveComment(cm.id)} style={{ padding: '1px 6px', border: `1px solid ${c.border}`, borderRadius: '2px', background: 'transparent', color: c.textMuted, cursor: 'pointer', fontSize: '8px' }}>✓ 解决</button>
              </div>
            ))}
          </div>
        )}

        {/* CRDT 文档协作标签页 */}
        {activeTab === 'document' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', height: '100%' }}>
            {!currentRoomId ? (
              <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint, fontSize: '10px' }}>请先加入或创建一个房间以使用文档协作</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', background: c.codeBg, borderRadius: '3px' }}>
                  <span style={{ color: c.textMuted, fontSize: '9px' }}>CRDT 协作文档</span>
                  <span style={{ color: syncStatus ? c.accent : c.textFaint, fontSize: '9px' }}>{syncStatus || '未连接'}</span>
                </div>
                <div style={{ fontSize: '9px', color: c.textFaint, padding: '2px 6px' }}>
                  版本: v{docVersion} | 长度: {docContent.length} 字符 | 在下方输入框编辑，CRDT 自动同步到所有协作者
                </div>
                <textarea
                  value={docContent}
                  onChange={e => {
                    const newContent = e.target.value
                    // 简单 diff：计算差异并发送操作
                    if (newContent.length > docContent.length) {
                      // 插入
                      const diff = newContent.length - docContent.length
                      // 找到第一个不同位置
                      let pos = 0
                      while (pos < docContent.length && pos < newContent.length && docContent[pos] === newContent[pos]) pos++
                      const inserted = newContent.slice(pos, pos + diff)
                      handleDocInsert(pos, inserted)
                    } else if (newContent.length < docContent.length) {
                      // 删除
                      const diff = docContent.length - newContent.length
                      let pos = 0
                      while (pos < newContent.length && pos < docContent.length && docContent[pos] === newContent[pos]) pos++
                      handleDocDelete(pos, diff)
                    }
                    setDocContent(newContent)
                  }}
                  placeholder="开始输入以进行协作编辑..."
                  style={{
                    flex: 1,
                    minHeight: '200px',
                    padding: '8px',
                    background: c.inputBg,
                    border: `1px solid ${c.border}`,
                    borderRadius: '4px',
                    color: c.text,
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
                <div style={{ fontSize: '8px', color: c.textFaint, padding: '2px 6px', textAlign: 'center' }}>
                  💡 多人同时编辑时，CRDT 引擎自动解决冲突，保证最终一致性
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'remote' && (
          <RemoteControlPanel theme={c} />
        )}
      </div>
    </div>
  )
}
