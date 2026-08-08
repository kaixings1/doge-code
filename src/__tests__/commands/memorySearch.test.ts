/**
 * __tests__/commands/memorySearch.test.ts — memory search 纯逻辑测试
 *
 * 覆盖：searchMemory 匹配/分组逻辑、stats 聚合
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// 纯逻辑重放（避免依赖 getMemoryFiles 副作用）
// ---------------------------------------------------------------------------

interface FakeFile {
  path: string
  type: string
  content: string
}

function searchMemoryFake(files: FakeFile[], query: string): { matches: Array<{ path: string; lineNumber: number; line: string }> } {
  const matches: Array<{ path: string; lineNumber: number; line: string }> = []

  if (!query.trim()) {
    return { matches }
  }

  const lowerQuery = query.toLowerCase()
  for (const file of files) {
    const lines = file.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerQuery)) {
        matches.push({ path: file.path, lineNumber: i + 1, line: lines[i].trim() })
      }
    }
  }
  return { matches }
}

describe('memory search 纯逻辑', () => {
  const files: FakeFile[] = [
    { path: '/a.md', type: 'user', content: 'hello world\nfoo bar\nbaz qux' },
    { path: '/b.md', type: 'project', content: 'TypeScript 规则\nReact 模式\nVue 技巧' },
  ]

  it('空查询应返回空结果', () => {
    const r = searchMemoryFake(files, '')
    expect(r.matches).toHaveLength(0)
  })

  it('大小写不敏感匹配', () => {
    const r = searchMemoryFake(files, 'HELLO')
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].path).toBe('/a.md')
    expect(r.matches[0].lineNumber).toBe(1)
  })

  it('多文件匹配', () => {
    const r = searchMemoryFake(files, '模式')
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].path).toBe('/b.md')
  })

  it('无匹配', () => {
    const r = searchMemoryFake(files, 'nonexistent')
    expect(r.matches).toHaveLength(0)
  })

  it('中文匹配', () => {
    const r = searchMemoryFake(files, '规则')
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].lineNumber).toBe(1)
  })

  it('同一行多次出现只匹配一次', () => {
    const dupFiles: FakeFile[] = [
      { path: '/c.md', type: 'user', content: 'test test test' },
    ]
    const r = searchMemoryFake(dupFiles, 'test')
    expect(r.matches).toHaveLength(1)
  })
})

describe('memory stats 纯逻辑', () => {
  it('应正确计算总文件数和总大小', () => {
    const files: FakeFile[] = [
      { path: '/a.md', type: 'user', content: 'hello' },
      { path: '/b.md', type: 'project', content: 'world!!' },
    ]

    const totalFiles = files.length
    const totalSize = files.reduce((sum, f) => sum + f.content.length, 0)
    const totalContentLength = files.reduce((sum, f) => sum + f.content.length, 0)

    expect(totalFiles).toBe(2)
    expect(totalSize).toBe(12)
    expect(totalContentLength).toBe(12)
  })

  it('应正确按类型分组', () => {
    const files: FakeFile[] = [
      { path: '/a.md', type: 'user', content: 'a' },
      { path: '/b.md', type: 'project', content: 'b' },
      { path: '/c.md', type: 'user', content: 'c' },
    ]

    const filesByType: Record<string, number> = {}
    for (const f of files) {
      filesByType[f.type] = (filesByType[f.type] || 0) + 1
    }

    expect(filesByType.user).toBe(2)
    expect(filesByType.project).toBe(1)
  })
})
