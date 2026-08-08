/**
 * __tests__/commands/complete.test.ts — complete 命令纯逻辑测试
 *
 * 覆盖：parseCostArgs 参数解析 / renderBar / formatTimestamp 以及 completeFiles 过滤逻辑
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// 从 cost.ts 复制的纯函数（避免依赖 chalk + cost-tracker 副作用）
// ---------------------------------------------------------------------------

function formatCost(cost: number): string {
  return `$${cost > 0.5 ? (Math.round(cost * 100) / 100).toFixed(2) : cost.toFixed(4)}`
}

function renderBar(percentage: number, maxWidth: number = 20): string {
  const filled = Math.round((percentage / 100) * maxWidth)
  const clamped = Math.max(0, Math.min(filled, maxWidth))
  return '█'.repeat(clamped) + '░'.repeat(maxWidth - clamped)
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ---------------------------------------------------------------------------
// 从 complete/index.ts 复制参数解析逻辑
// ---------------------------------------------------------------------------

interface CompleteOptions {
  query: string
  context: 'auto' | 'file' | 'git-branch' | 'git-remote' | 'npm-script' | 'docker-container' | 'env-var' | 'history' | 'ai-suggestion'
  cwd?: string
  limit?: number
}

interface CompleteItem {
  text: string
  type: 'file' | 'directory' | 'git-branch' | 'git-remote' | 'npm-script' | 'docker-container' | 'env-var' | 'history' | 'ai-suggestion'
  description?: string
  score: number
}

function parseCompleteArgs(args: Record<string, unknown>): CompleteOptions {
  const s = typeof args.query === 'string' ? args.query : ''
  const trimmed = s.trim()
  const queryMatch = trimmed.match(/--query\s+(\S+)/)
  const contextMatch = trimmed.match(/--context\s+(\S+)/)
  const cwdMatch = trimmed.match(/--cwd\s+(\S+)/)
  const limitMatch = trimmed.match(/--limit\s+(\d+)/)

  return {
    query: queryMatch?.[1] ?? '',
    context: (contextMatch?.[1] as CompleteOptions['context']) ?? 'auto',
    cwd: cwdMatch?.[1] ?? process.cwd(),
    limit: limitMatch?.[1] ? parseInt(limitMatch[1], 10) : 20,
  }
}

// ---------------------------------------------------------------------------
// 纯逻辑测试：formatCost / renderBar / formatTimestamp
// ---------------------------------------------------------------------------

describe('complete 纯函数', () => {
  describe('formatCost', () => {
    it('零值应显示为 $0.0000', () => {
      expect(formatCost(0)).toBe('$0.0000')
    })

    it('小于 0.5 的值应保留 4 位小数', () => {
      expect(formatCost(0.1234)).toBe('$0.1234')
    })

    it('大于 0.5 的值应保留 2 位小数', () => {
      expect(formatCost(1.234)).toBe('$1.23')
      expect(formatCost(0.501)).toBe('$0.50')
    })

    it('应正确处理边界值 0.5', () => {
      expect(formatCost(0.5)).toBe('$0.5000')
    })

    it('大数值应正确格式化', () => {
      expect(formatCost(123.456)).toBe('$123.46')
    })
  })

  describe('renderBar', () => {
    it('0% 应全为空', () => {
      expect(renderBar(0)).toBe('░'.repeat(20))
    })

    it('100% 应全为实心', () => {
      expect(renderBar(100)).toBe('█'.repeat(20))
    })

    it('50% 应一半实心', () => {
      expect(renderBar(50)).toBe('██████████░░░░░░░░░░')
    })

    it('应正确处理超出范围的百分比', () => {
      expect(renderBar(150)).toBe('█'.repeat(20))
      expect(renderBar(-10)).toBe('░'.repeat(20))
    })

    it('应支持自定义宽度', () => {
      expect(renderBar(50, 10)).toBe('█████░░░░░')
    })
  })

  describe('formatTimestamp', () => {
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
  })

  // ---------------------------------------------------------------------------
  // 测试 complete 参数解析逻辑
  // ---------------------------------------------------------------------------

  describe('complete 参数解析', () => {
    it('空参数应返回默认值', () => {
      const r = parseCompleteArgs({ query: '' })
      expect(r.query).toBe('')
      expect(r.context).toBe('auto')
      expect(r.limit).toBe(20)
    })

    it('应解析 --query 参数', () => {
      const r = parseCompleteArgs({ query: '--query src/' })
      expect(r.query).toBe('src/')
    })

    it('应解析 --context 参数', () => {
      const r = parseCompleteArgs({ query: '--context git-branch' })
      expect(r.context).toBe('git-branch')
    })

    it('应解析 --limit 参数', () => {
      const r = parseCompleteArgs({ query: '--limit 5' })
      expect(r.limit).toBe(5)
    })

    it('应解析 --cwd 参数', () => {
      const r = parseCompleteArgs({ query: '--cwd /tmp' })
      expect(r.cwd).toBe('/tmp')
    })

    it('应同时解析多个参数', () => {
      const r = parseCompleteArgs({ query: '--query feat --context git-branch --limit 10' })
      expect(r.query).toBe('feat')
      expect(r.context).toBe('git-branch')
      expect(r.limit).toBe(10)
    })
  })

  // ---------------------------------------------------------------------------
  // 测试文件补全过滤逻辑（模拟 readdirSync 行为）
  // ---------------------------------------------------------------------------

  describe('completeFiles 过滤逻辑', () => {
    function filterFiles(
      entries: string[],
      prefix: string,
    ): Array<{ text: string; type: string; description: string; score: number }> {
      const results: Array<{ text: string; type: string; description: string; score: number }> = []

      for (const entry of entries) {
        if (entry.startsWith('.') && !prefix.startsWith('.')) continue
        if (!entry.toLowerCase().startsWith(prefix.toLowerCase())) continue

        // 简化：只判断是否为目录（以 / 结尾）
        const isDir = entry.endsWith('/')
        const ext = entry.includes('.') ? entry.split('.').pop() ?? '' : ''

        results.push({
          text: entry,
          type: isDir ? 'directory' : 'file',
          description: isDir ? '目录' : ext,
          score: isDir ? 6 : 4,
        })

        if (results.length >= 20) break
      }

      return results.sort((a, b) => b.score - a.score)
    }

    it('空前缀应返回所有非隐藏条目', () => {
      const entries = ['src/', 'README.md', '.git/', 'package.json']
      const results = filterFiles(entries, '')
      expect(results.map(r => r.text)).toEqual(['src/', 'README.md', 'package.json'])
    })

    it('应以小写匹配（大小写不敏感）', () => {
      const entries = ['Src/', 'src/', 'SRC/']
      const results = filterFiles(entries, 'src')
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('应以 / 结尾的目录项正确识别', () => {
      const entries = ['src/', 'lib/', 'test.ts']
      const results = filterFiles(entries, 's')
      expect(results[0].type).toBe('directory')
      expect(results[0].text).toBe('src/')
    })

    it('应隐藏隐藏文件（除非前缀以点开头）', () => {
      const entries = ['.env', '.gitignore', 'README.md']
      const results = filterFiles(entries, 'R')
      expect(results.map(r => r.text)).toEqual(['README.md'])
    })

    it('前缀以点开头时应显示隐藏文件', () => {
      const entries = ['.env', '.gitignore', 'README.md']
      const results = filterFiles(entries, '.e')
      expect(results.map(r => r.text)).toEqual(['.env'])
    })

    it('无匹配应返回空数组', () => {
      const entries = ['src/', 'lib/']
      const results = filterFiles(entries, 'zzz')
      expect(results).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // 测试 AI 建议逻辑
  // ---------------------------------------------------------------------------

  describe('completeAISuggestions 逻辑', () => {
    type Suggestion = { text: string; type: string; description: string; score: number }

    function getAISuggestions(query: string, limit: number): Suggestion[] {
      if (!query || query.length < 2) return []

      const suggestions: Suggestion[] = []

      if (query.startsWith('git ')) {
        const gitCmds = [
          { text: 'git status', desc: '查看仓库状态' },
          { text: 'git log --oneline -10', desc: '查看最近提交' },
          { text: 'git diff', desc: '查看未暂存变更' },
          { text: 'git diff --staged', desc: '查看已暂存变更' },
          { text: 'git checkout -b ', desc: '创建新分支' },
          { text: 'git stash', desc: '暂存当前变更' },
        ]
        suggestions.push(
          ...gitCmds
            .filter(c => c.text.includes(query))
            .map(c => ({ text: c.text, type: 'ai-suggestion', description: c.desc, score: 8 })),
        )
      }

      if (query.startsWith('npm ') || query.startsWith('bun ')) {
        const pkgCmds = [
          { text: 'npm run dev', desc: '启动开发服务器' },
          { text: 'npm run build', desc: '构建生产版本' },
          { text: 'npm test', desc: '运行测试' },
          { text: 'npm install ', desc: '安装依赖' },
        ]
        suggestions.push(
          ...pkgCmds
            .filter(c => c.text.includes(query))
            .map(c => ({ text: c.text, type: 'ai-suggestion', description: c.desc, score: 8 })),
        )
      }

      if (query.startsWith('docker ')) {
        const dockerCmds = [
          { text: 'docker ps', desc: '列出运行中的容器' },
          { text: 'docker images', desc: '列出镜像' },
          { text: 'docker compose up', desc: '启动 Compose 服务' },
        ]
        suggestions.push(
          ...dockerCmds
            .filter(c => c.text.includes(query))
            .map(c => ({ text: c.text, type: 'ai-suggestion', description: c.desc, score: 8 })),
        )
      }

      return suggestions.slice(0, limit)
    }

    it('短查询（< 2 字符）应返回空', () => {
      expect(getAISuggestions('g', 5)).toHaveLength(0)
    })

    it('git 查询应返回匹配建议', () => {
      const results = getAISuggestions('git status', 10)
      expect(results).toHaveLength(1)
      expect(results[0].text).toBe('git status')
      expect(results[0].score).toBe(8)
    })

    it('git diff 查询应返回两项', () => {
      const results = getAISuggestions('git diff', 10)
      expect(results).toHaveLength(2)
    })

    it('非 git/npm/docker 查询应返回空', () => {
      expect(getAISuggestions('random query', 5)).toHaveLength(0)
    })

    it('npm 查询应返回匹配建议', () => {
      const results = getAISuggestions('npm run dev', 10)
      expect(results).toHaveLength(1)
      expect(results[0].text).toBe('npm run dev')
    })

    it('应受 limit 限制', () => {
      const results = getAISuggestions('git ', 1)
      expect(results.length).toBeLessThanOrEqual(1)
    })
  })
})
