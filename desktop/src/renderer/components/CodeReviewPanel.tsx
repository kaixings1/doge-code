import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

interface ReviewComment {
  id: string
  file: string
  line: number
  author: string
  text: string
  severity: 'info' | 'warning' | 'error'
  resolved: boolean
}

export function CodeReviewPanel({ theme }: { theme: ThemeColors }): JSX.Element {
  const c = theme
  const [comments, setComments] = useState<ReviewComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [selectedFile, setSelectedFile] = useState('')
  const api = (window as any).dogeAPI as Record<string, any>

  const loadComments = useCallback(async () => {
    // 加载所有评论
    const result = await api.collabGetComments({ roomId: 'review-room' })
    if (result?.comments) setComments(result.comments as ReviewComment[])
  }, [api])

  useEffect(() => { loadComments() }, [loadComments])

  const handleAdd = useCallback(async () => {
    if (!newComment.trim() || !selectedFile) return
    await api.collabAddComment({ roomId: 'review-room', file: selectedFile, line: 1, author: 'reviewer', text: newComment.trim() })
    setNewComment('')
    loadComments()
  }, [api, newComment, selectedFile, loadComments])

  const handleResolve = useCallback(async (id: string) => {
    await api.collabResolveComment({ roomId: 'review-room', commentId: id })
    loadComments()
  }, [api, loadComments])

  return (
    <div style={{ fontSize: '11px', padding: '8px' }}>
      <div style={{ color: c.accent, fontWeight: 600, marginBottom: '6px' }}>Code Review ({comments.length})</div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
        <input value={selectedFile} onChange={e => setSelectedFile(e.target.value)} placeholder="File path" style={{ flex: 1, padding: '3px 5px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }} />
        <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add comment..." style={{ flex: 2, padding: '3px 5px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }} />
        <button onClick={handleAdd} style={{ padding: '3px 8px', border: 'none', borderRadius: '2px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '9px' }}>+</button>
      </div>
      {comments.filter(cm => !cm.resolved).map(cm => (
        <div key={cm.id} style={{ padding: '4px 6px', borderBottom: `1px solid ${c.borderSubtle}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
            <span style={{ color: c.accent }}>{cm.file}:{cm.line}</span>
            <span style={{ color: c.textFaint }}>{cm.severity}</span>
          </div>
          <div style={{ color: c.text, fontSize: '10px' }}>{cm.text}</div>
          <button onClick={() => handleResolve(cm.id)} style={{ padding: '1px 6px', border: `1px solid ${c.border}`, borderRadius: '2px', background: 'transparent', color: c.textMuted, cursor: 'pointer', fontSize: '8px' }}>Resolve</button>
        </div>
      ))}
    </div>
  )
}
