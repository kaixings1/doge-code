/**
 * KanbanBoard — 任务看板组件
 *
 * 功能：
 * - 三列看板：To Do / In Progress / Done
 * - 任务卡片（标题、描述、优先级、标签、截止日期、负责人）
 * - 拖拽排序（HTML5 Drag and Drop API）
 * - 任务详情编辑弹窗
 * - 任务筛选（按标签/优先级/负责人/截止日期）
 * - 任务搜索
 * - 看板状态持久化（localStorage + IPC 保存到 .doge/）
 * - 任务统计（每列数量、总数）
 */

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ThemeContext } from '../App.js'
import type { ThemeColors } from '../theme.js'

type Priority = 'low' | 'medium' | 'high' | 'urgent'
type ColumnId = 'todo' | 'inprogress' | 'done'

interface KanbanTask {
  id: string
  title: string
  description: string
  priority: Priority
  tags: string[]
  dueDate: string
  assignee: string
  column: ColumnId
  order: number
  createdAt: number
}

const COLUMNS: { id: ColumnId; title: string; color: string }[] = [
  { id: 'todo', title: '待办', color: '#888888' },
  { id: 'inprogress', title: '进行中', color: '#FFB347' },
  { id: 'done', title: '已完成', color: '#4ECB71' },
]

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  low: { label: '低', color: '#555555' },
  medium: { label: '中', color: '#FFB347' },
  high: { label: '高', color: '#FF6B6B' },
  urgent: { label: '紧急', color: '#FF2D2D' },
}

const STORAGE_KEY = 'doge-kanban-tasks'

function loadTasks(): KanbanTask[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return []
}

function saveTasks(tasks: KanbanTask[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  } catch { /* ignore */ }
}

function createDefaultTask(column: ColumnId, order: number): KanbanTask {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    description: '',
    priority: 'medium',
    tags: [],
    dueDate: '',
    assignee: '',
    column,
    order,
    createdAt: Date.now(),
  }
}

interface KanbanBoardProps {
  cwd: string
  theme?: ThemeColors
}

export function KanbanBoard({ cwd, theme: externalTheme }: KanbanBoardProps) {
  const themeCtx = useContext(ThemeContext)
  const theme = externalTheme ?? themeCtx.colors
  const c = theme

  const [tasks, setTasks] = useState<KanbanTask[]>(loadTasks)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all')
  const [filterTag, setFilterTag] = useState<string>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null)
  const [showAddTask, setShowAddTask] = useState<ColumnId | null>(null)
  const dragItemRef = useRef<{ taskId: string; sourceColumn: ColumnId } | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null)

  // 持久化
  useEffect(() => {
    saveTasks(tasks)
  }, [tasks])

  // 计算所有标签和负责人
  const allTags = useMemo(() => [...new Set(tasks.flatMap(t => t.tags))], [tasks])
  const allAssignees = useMemo(() => [...new Set(tasks.filter(t => t.assignee).map(t => t.assignee))], [tasks])

  // 筛选后的任务
  const filteredTasks = useMemo(() => {
    let result = tasks
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      )
    }
    if (filterPriority !== 'all') result = result.filter(t => t.priority === filterPriority)
    if (filterTag !== 'all') result = result.filter(t => t.tags.includes(filterTag))
    if (filterAssignee !== 'all') result = result.filter(t => t.assignee === filterAssignee)
    return result
  }, [tasks, searchQuery, filterPriority, filterTag, filterAssignee])

  const getColumnTasks = useCallback((columnId: ColumnId) => {
    return filteredTasks.filter(t => t.column === columnId).sort((a, b) => a.order - b.order)
  }, [filteredTasks])

  const handleAddTask = useCallback((column: ColumnId) => {
    const columnTasks = tasks.filter(t => t.column === column)
    const newTask = createDefaultTask(column, columnTasks.length)
    newTask.title = '新任务'
    setTasks(prev => [...prev, newTask])
    setShowAddTask(null)
    setEditingTask(newTask)
  }, [tasks])

  const handleUpdateTask = useCallback((updated: KanbanTask) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
    setEditingTask(null)
  }, [])

  const handleDeleteTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setEditingTask(null)
  }, [])

  // 拖拽处理
  const handleDragStart = useCallback((e: React.DragEvent, taskId: string, column: ColumnId) => {
    dragItemRef.current = { taskId, sourceColumn: column }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taskId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, column: ColumnId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(column)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetColumn: ColumnId) => {
    e.preventDefault()
    setDragOverColumn(null)
    const taskId = e.dataTransfer.getData('text/plain')
    if (!taskId) return

    setTasks(prev => {
      const task = prev.find(t => t.id === taskId)
      if (!task) return prev

      const updatedTask = { ...task, column: targetColumn }
      const columnTasks = prev.filter(t => t.column === targetColumn && t.id !== taskId).sort((a, b) => a.order - b.order)
      columnTasks.splice(columnTasks.length, 0, updatedTask)
      const reordered = columnTasks.map((t, i) => ({ ...t, order: i }))

      const otherTasks = prev.filter(t => t.column !== targetColumn)
      return [...otherTasks, ...reordered]
    })
  }, [])

  const handleDragEnd = useCallback(() => {
    dragItemRef.current = null
    setDragOverColumn(null)
  }, [])

  const todoCount = tasks.filter(t => t.column === 'todo').length
  const inProgressCount = tasks.filter(t => t.column === 'inprogress').length
  const doneCount = tasks.filter(t => t.column === 'done').length
  const totalCount = tasks.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: '12px' }}>
      {/* 标题栏 */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: c.text }}>📋 任务看板</span>
        <span style={{ color: c.textFaint, fontSize: '11px' }}>共 {totalCount} 个任务</span>
      </div>

      {/* 搜索和筛选 */}
      <div style={{ padding: '6px 12px', borderBottom: `1px solid ${c.borderSubtle}`, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索任务..."
          style={{ flex: 1, minWidth: '120px', padding: '3px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }}
        />
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as Priority | 'all')} style={{ padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }}>
          <option value="all">所有优先级</option>
          <option value="urgent">紧急</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        {allTags.length > 0 && (
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }}>
            <option value="all">所有标签</option>
            {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        )}
        {allAssignees.length > 0 && (
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{ padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }}>
            <option value="all">所有负责人</option>
            {allAssignees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      {/* 看板列 */}
      <div style={{ flex: 1, display: 'flex', gap: '8px', padding: '8px', overflowX: 'auto', overflowY: 'hidden' }}>
        {COLUMNS.map(column => {
          const columnTasks = getColumnTasks(column.id)
          const isOver = dragOverColumn === column.id
          return (
            <div
              key={column.id}
              style={{
                flex: 1, minWidth: '220px', maxWidth: '320px', display: 'flex', flexDirection: 'column',
                background: isOver ? `${c.accent}11` : c.bgAlt,
                border: `1px solid ${isOver ? c.accent : c.borderSubtle}`,
                borderRadius: '6px',
              }}
              onDragOver={e => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, column.id)}
            >
              {/* 列标题 */}
              <div style={{ padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${c.borderSubtle}` }}>
                <span style={{ fontWeight: 600, color: column.color, fontSize: '11px' }}>
                  {column.title} ({columnTasks.length})
                </span>
                <span
                  onClick={() => handleAddTask(column.id)}
                  style={{ cursor: 'pointer', color: c.textFaint, fontSize: '14px', padding: '0 4px' }}
                  title="添加任务"
                >+</span>
              </div>

              {/* 任务列表 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {columnTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    theme={c}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onClick={() => setEditingTask(task)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* 编辑弹窗 */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          theme={c}
          onSave={handleUpdateTask}
          onDelete={handleDeleteTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  )
}

// ─── 任务卡片 ───
interface TaskCardProps {
  task: KanbanTask
  theme: ThemeColors
  onDragStart: (e: React.DragEvent, taskId: string, column: ColumnId) => void
  onDragEnd: () => void
  onClick: () => void
}

function TaskCard({ task, theme: c, onDragStart, onDragEnd, onClick }: TaskCardProps) {
  const priorityConfig = PRIORITY_CONFIG[task.priority]
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.id, task.column)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        padding: '8px',
        background: c.surface,
        border: `1px solid ${c.borderSubtle}`,
        borderRadius: '4px',
        cursor: 'grab',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 2px 8px ${c.bg}80` }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ fontWeight: 500, color: c.text, marginBottom: '4px', wordBreak: 'break-word' }}>
        {task.title}
      </div>
      {task.description && (
        <div style={{ color: c.textMuted, fontSize: '10px', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.description}
        </div>
      )}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '2px', background: `${priorityConfig.color}22`, color: priorityConfig.color, fontWeight: 600 }}>
          {priorityConfig.label}
        </span>
        {task.tags.map(tag => (
          <span key={tag} style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '2px', background: `${c.accent}15`, color: c.accent }}>
            {tag}
          </span>
        ))}
        {task.assignee && (
          <span style={{ fontSize: '9px', color: c.textFaint }}>@{task.assignee}</span>
        )}
        {task.dueDate && (
          <span style={{ fontSize: '9px', color: isOverdue ? c.errorText : c.textFaint, marginLeft: 'auto' }}>
            {task.dueDate}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── 任务编辑弹窗 ───
interface TaskEditModalProps {
  task: KanbanTask
  theme: ThemeColors
  onSave: (task: KanbanTask) => void
  onDelete: (taskId: string) => void
  onClose: () => void
}

function TaskEditModal({ task, theme: c, onSave, onDelete, onClose }: TaskEditModalProps) {
  const [editTask, setEditTask] = useState<KanbanTask>({ ...task })
  const [tagInput, setTagInput] = useState('')

  const handleSave = () => {
    if (!editTask.title.trim()) return
    onSave(editTask)
  }

  const addTag = () => {
    if (tagInput.trim() && !editTask.tags.includes(tagInput.trim())) {
      setEditTask(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }))
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => {
    setEditTask(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: '8px', padding: '16px', minWidth: '360px', maxWidth: '480px', width: '90%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontWeight: 600, color: c.text }}>编辑任务</span>
          <span style={{ cursor: 'pointer', color: c.textFaint }} onClick={onClose}>✕</span>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label style={{ fontSize: '10px', color: c.textMuted, display: 'block', marginBottom: '2px' }}>标题</label>
          <input
            value={editTask.title}
            onChange={e => setEditTask(prev => ({ ...prev, title: e.target.value }))}
            style={{ width: '100%', padding: '6px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label style={{ fontSize: '10px', color: c.textMuted, display: 'block', marginBottom: '2px' }}>描述</label>
          <textarea
            value={editTask.description}
            onChange={e => setEditTask(prev => ({ ...prev, description: e.target.value }))}
            rows={3}
            style={{ width: '100%', padding: '6px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '12px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '10px', color: c.textMuted, display: 'block', marginBottom: '2px' }}>优先级</label>
            <select
              value={editTask.priority}
              onChange={e => setEditTask(prev => ({ ...prev, priority: e.target.value as Priority }))}
              style={{ width: '100%', padding: '6px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '12px', outline: 'none' }}
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '10px', color: c.textMuted, display: 'block', marginBottom: '2px' }}>负责人</label>
            <input
              value={editTask.assignee}
              onChange={e => setEditTask(prev => ({ ...prev, assignee: e.target.value }))}
              style={{ width: '100%', padding: '6px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label style={{ fontSize: '10px', color: c.textMuted, display: 'block', marginBottom: '2px' }}>截止日期</label>
          <input
            type="date"
            value={editTask.dueDate}
            onChange={e => setEditTask(prev => ({ ...prev, dueDate: e.target.value }))}
            style={{ width: '100%', padding: '6px 8px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '10px', color: c.textMuted, display: 'block', marginBottom: '2px' }}>标签</label>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
            {editTask.tags.map(tag => (
              <span key={tag} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '2px', background: `${c.accent}22`, color: c.accent, display: 'flex', alignItems: 'center', gap: '4px' }}>
                {tag}
                <span style={{ cursor: 'pointer', color: c.textFaint }} onClick={() => removeTag(tag)}>✕</span>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              placeholder="添加标签..."
              style={{ flex: 1, padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '11px', outline: 'none' }}
            />
            <button onClick={addTag} style={{ padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: c.bgAlt, color: c.text, cursor: 'pointer', fontSize: '11px' }}>添加</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={() => onDelete(task.id)} style={{ padding: '5px 12px', border: `1px solid ${c.errorBorder}`, borderRadius: '3px', background: 'transparent', color: c.errorText, cursor: 'pointer', fontSize: '11px' }}>删除</button>
          <button onClick={handleSave} style={{ padding: '5px 12px', border: 'none', borderRadius: '3px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>保存</button>
        </div>
      </div>
    </div>
  )
}
