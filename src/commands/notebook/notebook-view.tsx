import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useInput, useApp, Newline } from '../../ink.js'
import { getNote, updateNote, deleteNote } from '../../services/notebook/database.js'
import BaseTextInput from '../../components/BaseTextInput.js'
import type { Note } from '../../services/notebook/schema.js'

// ====== Props ======

interface NotebookViewProps {
  noteId: string
  onBack: () => void
  onDeleted: (id: string) => void
}

// ====== 颜色常量 ======

const Colors = {
  title: '#00BFFF',
  meta: '#888888',
  tag: '#32CD32',
  pinned: '#FFD700',
  content: '#FFFFFF',
  highlight: '#FF6600',
  border: '#555555',
  error: '#FF4444',
  success: '#44FF44',
}

// ====== 主组件 ======

export default function NotebookView({ noteId, onBack, onDeleted }: NotebookViewProps) {
  const { exit } = useApp()
  const [note, setNote] = useState<Note | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editTags, setEditTags] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [message, setMessage] = useState('')

  const loadNote = useCallback(() => {
    const n = getNote(noteId)
    setNote(n)
    if (n) {
      setEditTitle(n.title)
      setEditContent(n.content)
      setEditTags(n.tags.join(', '))
    }
  }, [noteId])

  useEffect(() => {
    loadNote()
  }, [loadNote])

  const handleSave = () => {
    if (!editTitle.trim()) {
      setMessage('❌ 错误: 标题不能为空')
      return
    }

    const updated = updateNote(noteId, {
      title: editTitle.trim(),
      content: editContent,
      tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
    })

    if (updated) {
      setNote(updated)
      setMode('view')
      setMessage('✅ 已保存')
      setTimeout(() => setMessage(''), 2000)
    } else {
      setMessage('❌ 保存失败')
    }
  }

  const handleDelete = () => {
    if (confirmDelete) {
      deleteNote(noteId)
      onDeleted(noteId)
    } else {
      setConfirmDelete(true)
    }
  }

  const handleTogglePin = () => {
    const updated = updateNote(noteId, { isPinned: !note?.isPinned })
    if (updated) {
      setNote(updated)
      setMessage(updated.isPinned ? '📌 已置顶' : '📍 已取消置顶')
      setTimeout(() => setMessage(''), 2000)
    }
  }

  useInput((input, key) => {
    if (key.escape) {
      if (mode === 'edit') {
        setMode('view')
        setMessage('')
        if (note) {
          setEditTitle(note.title)
          setEditContent(note.content)
          setEditTags(note.tags.join(', '))
        }
      } else if (confirmDelete) {
        setConfirmDelete(false)
      } else {
        onBack()
      }
      return
    }

    if (mode === 'edit') return

    switch (true) {
      case input === 'e':
        setMode('edit')
        break
      case input === 'd':
        handleDelete()
        break
      case input === 'p':
        handleTogglePin()
        break
      case input === 'q':
        exit()
        break
    }
  })

  if (!note) { return ( <Box padding={1}> <Text color={Colors.error}>错误: 未找到笔记 (ID: {noteId})</Text> <Newline /> <Text color={Colors.border}>[Esc] 返回</Text> </Box> ) } // 编辑模式 if (mode === 'edit') { return ( <Box flexDirection="column" padding={1}> <Text bold color={Colors.highlight}>✏️ 编辑笔记</Text> <Newline /> <Box> <Text>标题: </Text> <BaseTextInput value={editTitle} onChange={setEditTitle} placeholder="笔记标题..." autoFocus /> </Box> <Box marginTop={1} flexDirection="column"> <Text>内容 (Markdown):</Text> <BaseTextInput value={editContent} onChange={setEditContent} placeholder="输入笔记内容..." multiline /> </Box> <Box marginTop={1}> <Text>标签: </Text> <BaseTextInput value={editTags} onChange={setEditTags} placeholder="用逗号分隔，如: 工作,技术,备忘" /> </Box> <Box marginTop={1}> <Text color={Colors.border}> [Ctrl+S/Ctrl+X] 保存 [Esc] 取消 </Text> </Box> {message && ( <Box marginTop={1}> <Text color={message.startsWith('❌') ? Colors.error : Colors.success}> {message} </Text> </Box> )} </Box> ) } // 查看模式（包含删除确认） if (confirmDelete) { return ( <Box flexDirection="column" padding={1}> <Text bold color={Colors.error}>⚠️ 确认删除</Text> <Newline /> <Text>确定要删除笔记 "{note.title}" 吗？此操作不可撤销。</Text> <Newline /> <Box> <Text color={Colors.highlight}>[D] 确认删除 [Esc] 取消</Text> </Box> </Box> ) } // 查看模式 const date = new Date(note.updatedAt) const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` const previewContent = note.content.slice(0, 500) return ( <Box flexDirection="column" padding={1}> {/* 标题 */} <Box> <Text bold color={note.isPinned ? Colors.pinned : Colors.title}> {note.isPinned ? '📌 ' : ''}{note.title} </Text> </Box> {/* 元信息 */} <Box marginTop={1}> <Text color={Colors.meta}> 更新: {dateStr} | ID: {note.id}... </Text> </Box> {/* 标签 */} {note.tags.length > 0 && ( <Box marginTop={1}> <Text color={Colors.meta}>标签: </Text> {note.tags.map((tag) => ( <Box key={tag} marginRight={1}> <Text color={Colors.tag}>#{tag}</Text> </Box> ))} </Box> )} {/* 内容（只显示前 500 字符预览） */} <Box marginTop={1} flexDirection="column"> <Text color={Colors.border}>--- 内容预览 ---</Text> <Newline /> <Text color={Colors.content}> {previewContent || '(空)'} {note.content.length > 500 ? '...' : ''} </Text> </Box> {/* 快捷键提示 */} <Box marginTop={1}> <Text color={Colors.border}> [e] 编辑 [p] 置顶/取消 [d] 删除 [Esc] 返回 [q] 退出 </Text> </Box> {message && ( <Box marginTop={1}> <Text color={message.startsWith('❌') ? Colors.error : Colors.success}> {message} </Text> </Box> )} </Box> )
}
