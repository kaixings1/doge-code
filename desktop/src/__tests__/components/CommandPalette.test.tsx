/**
 * CommandPalette 组件测试
 *
 * 测试命令面板功能：
 * - 命令过滤
 * - 文件过滤
 * - 命令历史记录
 */

import { describe, it, expect } from 'bun:test'

// 模拟命令类型
interface CommandDef {
  name: string
  description: string
  category: string
}

// 命令过滤函数
function filterCommands(commands: CommandDef[], query: string): CommandDef[] {
  const lower = query.toLowerCase()
  return commands.filter(c =>
    c.name.toLowerCase().includes(lower) ||
    c.description.toLowerCase().includes(lower)
  )
}

// 文件过滤函数
function filterFiles(files: Array<{ name: string; path: string }>, query: string): Array<{ name: string; path: string }> {
  const lower = query.toLowerCase()
  return files.filter(f => f.name.toLowerCase().includes(lower))
}

// 历史记录排序（最新在前）
function sortHistory<T extends { time: number }>(history: T[]): T[] {
  return [...history].sort((a, b) => b.time - a.time)
}

describe('CommandPalette', () => {
  const mockCommands: CommandDef[] = [
    { name: '/commit', description: '创建 git 提交', category: 'Git' },
    { name: '/status', description: '查看状态', category: 'Git' },
    { name: '/help', description: '帮助信息', category: '系统' },
    { name: '/clear', description: '清除对话', category: '会话' },
    { name: '/model', description: '切换模型', category: '系统' },
  ]

  const mockFiles = [
    { name: 'index.ts', path: '/project/src/index.ts' },
    { name: 'App.tsx', path: '/project/src/App.tsx' },
    { name: 'README.md', path: '/project/README.md' },
    { name: 'package.json', path: '/project/package.json' },
  ]

  describe('命令过滤', () => {
    it('应按名称过滤命令', () => {
      const result = filterCommands(mockCommands, '/commit')
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('/commit')
    })

    it('应按描述过滤命令', () => {
      const result = filterCommands(mockCommands, 'git')
      expect(result.length).toBeGreaterThan(0)
      expect(result.some(c => c.category === 'Git')).toBe(true)
    })

    it('应支持部分匹配', () => {
      const result = filterCommands(mockCommands, '/co')
      expect(result.some(c => c.name === '/commit')).toBe(true)
    })

    it('空查询应返回所有命令', () => {
      const result = filterCommands(mockCommands, '')
      expect(result.length).toBe(mockCommands.length)
    })

    it('无匹配应返回空数组', () => {
      const result = filterCommands(mockCommands, '/nonexistent')
      expect(result.length).toBe(0)
    })

    it('应忽略大小写', () => {
      const result = filterCommands(mockCommands, '/COMMIT')
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('/commit')
    })
  })

  describe('文件过滤', () => {
    it('应按文件名过滤', () => {
      const result = filterFiles(mockFiles, 'index')
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('index.ts')
    })

    it('应支持扩展名过滤', () => {
      const result = filterFiles(mockFiles, '.ts')
      expect(result.length).toBe(2) // index.ts 和 App.tsx
      expect(result.some(f => f.name === 'index.ts')).toBe(true)
      expect(result.some(f => f.name === 'App.tsx')).toBe(true)
    })

    it('空查询应返回所有文件', () => {
      const result = filterFiles(mockFiles, '')
      expect(result.length).toBe(mockFiles.length)
    })

    it('无匹配应返回空数组', () => {
      const result = filterFiles(mockFiles, 'nonexistent')
      expect(result.length).toBe(0)
    })
  })

  describe('历史记录排序', () => {
    it('应按时间降序排列', () => {
      const history = [
        { cmd: '/commit', time: 1000 },
        { cmd: '/status', time: 3000 },
        { cmd: '/help', time: 2000 },
      ]
      const sorted = sortHistory(history)
      expect(sorted[0].cmd).toBe('/status')
      expect(sorted[1].cmd).toBe('/help')
      expect(sorted[2].cmd).toBe('/commit')
    })

    it('空数组应返回空数组', () => {
      const sorted = sortHistory<{ cmd: string; time: number }>([])
      expect(sorted.length).toBe(0)
    })
  })
})
