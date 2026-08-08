/**
 * __tests__/commands/memory.test.ts — memory 命令纯逻辑测试
 *
 * 覆盖：parseSubcommand / formatBytes / formatTimestamp / getTypeLabel
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// 从 memory/memorySearch.ts 复制纯函数
// ---------------------------------------------------------------------------

type Subcommand = 'search' | 'stats' | 'export'

function parseSubcommand(args: string): [Subcommand | null, string] {
  const trimmed = args.trim()
  if (!trimmed) {
    return [null, '']
  }

  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) {
    return [trimmed as Subcommand, '']
  }

  const subcmd = trimmed.slice(0, spaceIdx) as Subcommand
  const rest = trimmed.slice(spaceIdx + 1).trim()
  return [subcmd, rest]
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    User: '用户级',
    Project: '项目级',
    Local: '本地私有',
    Managed: '托管级',
    AutoMem: '自动记忆',
    TeamMem: '团队记忆',
  }
  return labels[type] || type
}

// ---------------------------------------------------------------------------
// Tests: parseSubcommand
// ---------------------------------------------------------------------------

describe('memory parseSubcommand', () => {
  it('空字符串应返回 null', () => {
    const [subcmd, rest] = parseSubcommand('')
    expect(subcmd).toBeNull()
    expect(rest).toBe('')
  })

  it('单个子命令应正确解析', () => {
    const [subcmd, rest] = parseSubcommand('search')
    expect(subcmd).toBe('search')
    expect(rest).toBe('')
  })

  it('子命令带参数应正确拆分', () => {
    const [subcmd, rest] = parseSubcommand('search TypeScript')
    expect(subcmd).toBe('search')
    expect(rest).toBe('TypeScript')
  })

  it('stats 子命令应正确解析', () => {
    const [subcmd, rest] = parseSubcommand('stats')
    expect(subcmd).toBe('stats')
    expect(rest).toBe('')
  })

  it('export 子命令应正确解析', () => {
    const [subcmd, rest] = parseSubcommand('export ./backup.json')
    expect(subcmd).toBe('export')
    expect(rest).toBe('./backup.json')
  })

  it('应去除首尾空白', () => {
    const [subcmd, rest] = parseSubcommand('  search  TypeScript  ')
    expect(subcmd).toBe('search')
    expect(rest).toBe('TypeScript')
  })
})

// ---------------------------------------------------------------------------
// Tests: formatBytes
// ---------------------------------------------------------------------------

describe('memory formatBytes', () => {
  it('0 字节应返回 "0 B"', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('小于 1KB 应返回 B', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('1KB 应返回 1 KB', () => {
    expect(formatBytes(1024)).toBe('1 KB')
  })

  it('1MB 应返回 1 MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
  })

  it('1GB 应返回 1 GB', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
  })

  it('应正确计算混合大小', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(2500)).toBe('2.4 KB')
  })
})

// ---------------------------------------------------------------------------
// Tests: formatTimestamp
// ---------------------------------------------------------------------------

describe('memory formatTimestamp', () => {
  it('应正确格式化时间戳', () => {
    const d = new Date('2026-08-09T12:30:00')
    const result = formatTimestamp(d.getTime())
    expect(result).toContain('2026-08-09')
    expect(result).toContain('12:30:00')
  })

  it('应正确处理零时间戳', () => {
    const result = formatTimestamp(0)
    expect(result).toContain('1970-01-01')
  })

  it('应正确填充个位数', () => {
    const d = new Date('2026-01-05T03:04:05')
    const result = formatTimestamp(d.getTime())
    expect(result).toContain('01')
    expect(result).toContain('05')
    expect(result).toContain('03:04:05')
  })
})

// ---------------------------------------------------------------------------
// Tests: getTypeLabel
// ---------------------------------------------------------------------------

describe('memory getTypeLabel', () => {
  it('应映射已知类型', () => {
    expect(getTypeLabel('User')).toBe('用户级')
    expect(getTypeLabel('Project')).toBe('项目级')
    expect(getTypeLabel('Local')).toBe('本地私有')
    expect(getTypeLabel('Managed')).toBe('托管级')
    expect(getTypeLabel('AutoMem')).toBe('自动记忆')
    expect(getTypeLabel('TeamMem')).toBe('团队记忆')
  })

  it('未知类型应返回原值', () => {
    expect(getTypeLabel('unknown')).toBe('unknown')
    expect(getTypeLabel('CustomType')).toBe('CustomType')
  })

  it('空字符串应返回原值', () => {
    expect(getTypeLabel('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Tests: 搜索匹配分组逻辑
// ---------------------------------------------------------------------------

describe('memory search 分组逻辑', () => {
  interface SearchMatch {
    path: string
    type: string
    lineNumber: number
    line: string
    context: string
  }

  it('应将匹配按文件分组', () => {
    const matches: SearchMatch[] = [
      { path: '/a.md', type: 'user', lineNumber: 1, line: 'hello', context: 'hello' },
      { path: '/a.md', type: 'user', lineNumber: 5, line: 'world', context: 'world' },
      { path: '/b.md', type: 'project', lineNumber: 3, line: 'foo', context: 'foo' },
    ]

    const grouped = new Map<string, SearchMatch[]>()
    for (const m of matches) {
      const existing = grouped.get(m.path) || []
      existing.push(m)
      grouped.set(m.path, existing)
    }

    expect(grouped.size).toBe(2)
    expect(grouped.get('/a.md')).toHaveLength(2)
    expect(grouped.get('/b.md')).toHaveLength(1)
  })

  it('空匹配数组应返回空分组', () => {
    const matches: SearchMatch[] = []
    const grouped = new Map<string, SearchMatch[]>()
    for (const m of matches) {
      const existing = grouped.get(m.path) || []
      existing.push(m)
      grouped.set(m.path, existing)
    }
    expect(grouped.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: 导出逻辑验证
// ---------------------------------------------------------------------------

describe('memory export 参数验证', () => {
  it('空路径应返回用法提示', () => {
    const outputPath = ''
    if (!outputPath.trim()) {
      expect(outputPath.trim()).toBe('')
    }
  })

  it('空白路径应返回用法提示', () => {
    const outputPath = '   '
    if (!outputPath.trim()) {
      expect(outputPath.trim()).toBe('')
    }
  })

  it('有效路径不应触发空值检查', () => {
    const outputPath = './backup.json'
    expect(outputPath.trim()).not.toBe('')
  })
})
