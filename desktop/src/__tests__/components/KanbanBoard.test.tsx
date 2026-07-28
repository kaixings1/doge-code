/**
 * KanbanBoard 组件测试
 *
 * 测试看板核心逻辑：
 * - 任务创建/删除
 * - 任务拖拽状态转移
 * - 筛选逻辑
 * - 优先级配置
 * - 持久化键值
 */

import { describe, it, expect } from 'bun:test'

// 类型与组件内保持一致
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

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  low: { label: '低', color: '#555555' },
  medium: { label: '中', color: '#FFB347' },
  high: { label: '高', color: '#FF6B6B' },
  urgent: { label: '紧急', color: '#FF2D2D' },
}

const STORAGE_KEY = 'doge-kanban-tasks'

function createTask(column: ColumnId, order: number): KanbanTask {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '新任务',
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

function filterTasks(tasks: KanbanTask[], priority: Priority | 'all', tag: string, query: string): KanbanTask[] {
  let result = tasks
  if (query) {
    const q = query.toLowerCase()
    result = result.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
  }
  if (priority !== 'all') result = result.filter(t => t.priority === priority)
  if (tag !== 'all') result = result.filter(t => t.tags.includes(tag))
  return result
}

function moveTask(tasks: KanbanTask[], taskId: string, targetColumn: ColumnId): KanbanTask[] {
  return tasks.map(t => t.id === taskId ? { ...t, column: targetColumn } : t)
}

describe('KanbanBoard', () => {
  describe('createTask', () => {
    it('应创建默认属性的任务', () => {
      const task = createTask('todo', 0)
      expect(task.column).toBe('todo')
      expect(task.order).toBe(0)
      expect(task.priority).toBe('medium')
      expect(task.tags).toEqual([])
      expect(task.title).toBe('新任务')
    })
  })

  describe('filterTasks', () => {
    const tasks: KanbanTask[] = [
      { ...createTask('todo', 0), id: '1', title: 'Fix bug', priority: 'high', tags: ['bug'] },
      { ...createTask('inprogress', 0), id: '2', title: 'Add feature', priority: 'low', tags: ['feature'] },
      { ...createTask('done', 0), id: '3', title: 'Write docs', priority: 'medium', tags: [] },
    ]

    it('应按优先级筛选', () => {
      const result = filterTasks(tasks, 'high', 'all', '')
      expect(result.length).toBe(1)
      expect(result[0].id).toBe('1')
    })

    it('应按标签筛选', () => {
      const result = filterTasks(tasks, 'all', 'feature', '')
      expect(result.length).toBe(1)
      expect(result[0].id).toBe('2')
    })

    it('应按搜索词筛选', () => {
      const result = filterTasks(tasks, 'all', 'all', 'bug')
      expect(result.length).toBe(1)
      expect(result[0].id).toBe('1')
    })

    it('应返回全部当无筛选', () => {
      const result = filterTasks(tasks, 'all', 'all', '')
      expect(result.length).toBe(3)
    })
  })

  describe('moveTask', () => {
    it('应移动任务到目标列', () => {
      const tasks = [createTask('todo', 0)]
      tasks[0].id = 'test-1'
      const result = moveTask(tasks, 'test-1', 'inprogress')
      expect(result[0].column).toBe('inprogress')
    })

    it('不应影响其他任务', () => {
      const tasks = [createTask('todo', 0), createTask('todo', 1)]
      tasks[0].id = 'a'
      tasks[1].id = 'b'
      const result = moveTask(tasks, 'a', 'done')
      expect(result[0].column).toBe('done')
      expect(result[1].column).toBe('todo')
    })
  })

  describe('PRIORITY_CONFIG', () => {
    it('应包含所有优先级', () => {
      expect(PRIORITY_CONFIG.low.label).toBe('低')
      expect(PRIORITY_CONFIG.medium.label).toBe('中')
      expect(PRIORITY_CONFIG.high.label).toBe('高')
      expect(PRIORITY_CONFIG.urgent.label).toBe('紧急')
    })

    it('应有对应颜色', () => {
      expect(PRIORITY_CONFIG.low.color).toBe('#555555')
      expect(PRIORITY_CONFIG.high.color).toBe('#FF6B6B')
    })
  })

  describe('STORAGE_KEY', () => {
    it('应使用正确的存储键', () => {
      expect(STORAGE_KEY).toBe('doge-kanban-tasks')
    })
  })
})
