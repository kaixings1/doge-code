/**
 * Git Diff 组件 - 显示文件差异
 */

import { useState, useEffect } from 'react'
import type { ThemeColors } from '../theme.js'
import { HighlightedDiff } from './HighlightedDiff.js'

interface GitDiffProps {
  cwd: string
  filePath: string
  theme: ThemeColors
}

export function GitDiff({ cwd, filePath, theme }: GitDiffProps) {
  const c = theme
  const [diff, setDiff] = useState<string>('加载中...')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<{ added: number; removed: number }>({ added: 0, removed: 0 })

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const result = await window.dogeAPI.getGitDiff(cwd, filePath)
        const diffText = result || '无差异'
        setDiff(diffText)
        const lines = diffText.split('\n')
        let added = 0, removed = 0
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) added++
          else if (line.startsWith('-') && !line.startsWith('---')) removed++
        }
        setStats({ added, removed })
      } catch (e) {
        setDiff('读取失败')
      } finally { setLoading(false) }
    }
    load()
  }, [cwd, filePath])

  if (loading) return <div style={{ padding: '8px', color: c.textFaint, fontSize: '11px' }}>加载中...</div>

  return (
    <div>
      <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${c.borderSubtle}`, marginBottom: '4px' }}>
        <span style={{ color: c.textMuted, fontSize: '10px' }}>
          <span style={{ color: c.accent }}>+{stats.added}</span>
          <span style={{ margin: '0 4px', color: c.border }}>|</span>
          <span style={{ color: c.errorText }}>-{stats.removed}</span>
        </span>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(diff)
          }}
          style={{ background: 'none', border: `1px solid ${c.border}`, color: c.textFaint, padding: '1px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}
        >
          复制
        </button>
      </div>
      <div style={{ maxHeight: '400px', overflow: 'auto' }}>
        <HighlightedDiff diffText={diff} />
      </div>
    </div>
  )
}
