/**
 * SnippetPanel — 代码片段面板
 *
 * 功能：
 * - 代码片段分类管理
 * - 片段搜索
 * - 片段预览
 * - 一键插入到编辑器/输入框
 * - 自定义片段（localStorage 持久化）
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'

interface Snippet {
  id: string
  name: string
  description: string
  language: string
  code: string
  category: string
}

interface SnippetPanelProps {
  theme: ThemeColors
  currentFile?: string
  onInsert?: (code: string) => void
}

const STORAGE_KEY = 'doge-snippets'

const DEFAULT_SNIPPETS: Snippet[] = [
  { id: '1', name: 'React Functional Component', description: 'React 函数组件模板', language: 'typescript', code: 'import React from \'react\'\n\ninterface Props {\n  // define props\n}\n\nexport function Component({ }: Props) {\n  return (\n    <div>\n      {/* component */}\n    </div>\n  )\n}', category: 'React' },
  { id: '2', name: 'useState Hook', description: 'React useState 钩子', language: 'typescript', code: 'const [state, setState] = useState(initialValue)', category: 'React' },
  { id: '3', name: 'useEffect Hook', description: 'React useEffect 钩子', language: 'typescript', code: 'useEffect(() => {\n  // effect\n  return () => {\n    // cleanup\n  }\n}, [dependencies])', category: 'React' },
  { id: '4', name: 'TypeScript Interface', description: 'TypeScript 接口定义', language: 'typescript', code: 'interface Name {\n  property: string\n  optional?: number\n}', category: 'TypeScript' },
  { id: '5', name: 'Async Function', description: '异步函数模板', language: 'typescript', code: 'async function fetchData(url: string): Promise<Data> {\n  const response = await fetch(url)\n  if (!response.ok) throw new Error(\'Failed\')\n  return response.json()\n}', category: 'TypeScript' },
  { id: '6', name: 'Python Main', description: 'Python main 函数', language: 'python', code: 'def main():\n    pass\n\nif __name__ == "__main__":\n    main()', category: 'Python' },
  { id: '7', name: 'Python Class', description: 'Python 类模板', language: 'python', code: 'class ClassName:\n    def __init__(self):\n        pass\n    \n    def method(self):\n        pass', category: 'Python' },
  { id: '8', name: 'Console Log', description: '控制台日志', language: 'javascript', code: 'console.log(\'debug:\', variable)', category: 'Debug' },
  { id: '9', name: 'Try-Catch', description: '异常处理', language: 'typescript', code: 'try {\n  // code\n} catch (error) {\n  console.error(\'Error:\', error)\n}', category: 'Pattern' },
  { id: '10', name: 'JSDoc Comment', description: 'JSDoc 注释', language: 'typescript', code: '/**\n * @description 函数描述\n * @param {string} param - 参数描述\n * @returns {Promise<Result>} 返回值描述\n */', category: 'Pattern' },
]

const CATEGORIES = ['All', 'React', 'TypeScript', 'Python', 'JavaScript', 'Debug', 'Pattern']

export function SnippetPanel({ theme, onInsert }: SnippetPanelProps): JSX.Element {
  const c = theme
  const [snippets, setSnippets] = useState<Snippet[]>(DEFAULT_SNIPPETS)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedSnippet, setSelectedSnippet] = useState<Snippet | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSnippet, setNewSnippet] = useState({ name: '', description: '', code: '', category: 'Pattern' })

  // 加载自定义片段
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const custom = JSON.parse(saved) as Snippet[]
        setSnippets([...DEFAULT_SNIPPETS, ...custom])
      }
    } catch { /* ignore */ }
  }, [])

  // 保存自定义片段
  const saveCustomSnippets = useCallback((custom: Snippet[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
    } catch { /* ignore */ }
  }, [])

  const handleAddSnippet = useCallback(() => {
    if (!newSnippet.name.trim() || !newSnippet.code.trim()) return
    const id = `custom-${Date.now()}`
    const snippet: Snippet = { ...newSnippet, id, language: 'typescript' }
    const custom = snippets.filter(s => s.id.startsWith('custom-'))
    custom.push(snippet)
    saveCustomSnippets(custom)
    setSnippets([...DEFAULT_SNIPPETS, ...custom])
    setShowAddForm(false)
    setNewSnippet({ name: '', description: '', code: '', category: 'Pattern' })
  }, [newSnippet, snippets, saveCustomSnippets])

  const handleDeleteSnippet = useCallback((id: string) => {
    if (!id.startsWith('custom-')) return
    const custom = snippets.filter(s => s.id !== id && s.id.startsWith('custom-'))
    saveCustomSnippets(custom)
    setSnippets([...DEFAULT_SNIPPETS, ...custom])
    if (selectedSnippet?.id === id) setSelectedSnippet(null)
  }, [snippets, selectedSnippet, saveCustomSnippets])

  // 过滤
  const filtered = snippets.filter(s => {
    const matchCategory = selectedCategory === 'All' || s.category === selectedCategory
    const matchSearch = !searchQuery.trim() ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCategory && matchSearch
  })

  return (
    <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 搜索和分类 */}
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${c.border}` }}>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索片段..."
          style={{ width: '100%', padding: '3px 6px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none', marginBottom: '4px' }}
        />
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '1px 6px', border: '1px solid', borderColor: selectedCategory === cat ? c.accent : c.border,
                borderRadius: '2px', background: selectedCategory === cat ? `${c.accent}22` : 'transparent',
                color: selectedCategory === cat ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '9px',
              }}
            >{cat}</button>
          ))}
        </div>
      </div>

      {/* 片段列表 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: c.textFaint }}>无匹配片段</div>
        ) : (
          filtered.map(snippet => (
            <div
              key={snippet.id}
              onClick={() => setSelectedSnippet(snippet)}
              style={{
                padding: '6px 8px', cursor: 'pointer',
                background: selectedSnippet?.id === snippet.id ? c.accentDim : 'transparent',
                borderBottom: `1px solid ${c.borderSubtle}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: selectedSnippet?.id === snippet.id ? c.accent : c.text, fontWeight: 500 }}>{snippet.name}</span>
                <span style={{ color: c.textFaint, fontSize: '9px' }}>{snippet.category}</span>
              </div>
              <div style={{ color: c.textFaint, fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{snippet.description}</div>
            </div>
          ))
        )}
      </div>

      {/* 片段预览和操作 */}
      {selectedSnippet && (
        <div style={{ borderTop: `1px solid ${c.border}`, maxHeight: '40%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: c.bgPanel }}>
            <span style={{ fontWeight: 600, color: c.text }}>{selectedSnippet.name}</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => onInsert?.(selectedSnippet.code)}
                style={{ padding: '2px 8px', border: 'none', borderRadius: '2px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '9px', fontWeight: 600 }}
              >插入</button>
              {selectedSnippet.id.startsWith('custom-') && (
                <button
                  onClick={() => handleDeleteSnippet(selectedSnippet.id)}
                  style={{ padding: '2px 6px', border: `1px solid ${c.border}`, borderRadius: '2px', background: 'transparent', color: c.errorText, cursor: 'pointer', fontSize: '9px' }}
                >删除</button>
              )}
            </div>
          </div>
          <pre style={{ margin: 0, padding: '6px 8px', overflow: 'auto', fontSize: '9px', fontFamily: 'monospace', color: c.textMuted, background: c.codeBg, flex: 1, whiteSpace: 'pre-wrap' }}>{selectedSnippet.code}</pre>
        </div>
      )}

      {/* 添加片段 */}
      <div style={{ borderTop: `1px solid ${c.border}` }}>
        {showAddForm ? (
          <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <input value={newSnippet.name} onChange={e => setNewSnippet(p => ({ ...p, name: e.target.value }))} placeholder="名称" style={{ padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', outline: 'none' }} />
            <textarea value={newSnippet.code} onChange={e => setNewSnippet(p => ({ ...p, code: e.target.value }))} placeholder="代码..." rows={3} style={{ padding: '2px 4px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.text, fontSize: '9px', fontFamily: 'monospace', outline: 'none', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={handleAddSnippet} style={{ flex: 1, padding: '3px', border: 'none', borderRadius: '2px', background: c.accent, color: '#000', cursor: 'pointer', fontSize: '9px', fontWeight: 600 }}>保存</button>
              <button onClick={() => setShowAddForm(false)} style={{ padding: '3px 6px', border: `1px solid ${c.border}`, borderRadius: '2px', background: 'transparent', color: c.textMuted, cursor: 'pointer', fontSize: '9px' }}>取消</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddForm(true)} style={{ width: '100%', padding: '4px', border: 'none', background: 'transparent', color: c.accent, cursor: 'pointer', fontSize: '10px' }}>+ 添加自定义片段</button>
        )}
      </div>
    </div>
  )
}
