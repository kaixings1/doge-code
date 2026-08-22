import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface Snippet {
  id: string
  name: string
  prefix: string
  description: string
  language: string
  body: string
  tags: string[]
  useCount: number
  lastUsed: string
  favorite: boolean
}

const SNIPPETS_DIR = join(homedir(), '.doge', 'snippets')

function loadSnippets(): Snippet[] {
  try {
    if (!existsSync(SNIPPETS_DIR)) return []
    return readdirSync(SNIPPETS_DIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(SNIPPETS_DIR, f), 'utf-8')))
  } catch { return [] }
}

function saveSnippet(s: Snippet) {
  try {
    if (!existsSync(SNIPPETS_DIR)) mkdirSync(SNIPPETS_DIR, { recursive: true })
    writeFileSync(join(SNIPPETS_DIR, s.id + '.json'), JSON.stringify(s, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

const BUILT_IN_SNIPPETS: Snippet[] = [
  { id: 'snippet-react-fc', name: 'snippets', prefix: 'rfc', description: 'React functional component with TypeScript', language: 'typescriptreact', body: 'import React from "react";\n\ninterface Props {\n  // props\n}\n\nexport default function Component({}: Props) {\n  return <div>Component</div>;\n}', tags: ['react', 'typescript'], useCount: 0, lastUsed: '', favorite: false },
  { id: 'snippet-react-hook', name: 'React Custom Hook', prefix: 'rhook', description: 'React custom hook pattern', language: 'typescriptreact', body: 'import { useState, useEffect } from "react";\n\nexport function useHook() {\n  const [state, setState] = useState();\n  useEffect(() => {}, []);\n  return { state, setState };\n}', tags: ['react', 'hook'], useCount: 0, lastUsed: '', favorite: false },
  { id: 'snippet-express-route', name: 'Express Route', prefix: 'eroute', description: 'Express.js route handler', language: 'typescript', body: 'app.get("/api/items", async (req, res) => {\n  try {\n    const items = await Item.find();\n    res.json(items);\n  } catch (err) {\n    res.status(500).json({ error: err.message });\n  }\n});', tags: ['express', 'api'], useCount: 0, lastUsed: '', favorite: false },
  { id: 'snippet-try-catch', name: 'Try-Catch Block', prefix: 'tryc', description: 'Try-catch with error handling', language: 'typescript', body: 'try {\n  // code\n} catch (error) {\n  console.error("Error:", error.message);\n  // handle error\n}', tags: ['error-handling'], useCount: 0, lastUsed: '', favorite: false },
];

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const snippets = [...BUILT_IN_SNIPPETS, ...loadSnippets()]

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📝 代码片段管理器', '', '📖 用法：', '  /snippets list                 列出所有片段', '  /snippets search <query>       搜索片段', '  /snippets use <name>           使用片段', '  /snippets add                  添加新片段', '  /snippets edit <name>          编辑片段', '  /snippets delete <name>        删除片段', '  /snippets copy <name>          复制到剪贴板', '  /snippets tags                 列出标签', '  /snippets recent               最近使用', '  /snippets languages            列出语言', '  /snippets init                 初始化内置片段', ''].join('\n') }

  if (cmd === 'list' || cmd === 'ls') {
    if (snippets.length === 0) return { type: 'text', value: '📋 无代码片段。运行 /snippets init 创建内置片段。' }
    const lines = ['📝 代码片段（' + snippets.length + '）：', '==================', '']
    snippets.forEach(s => {
      lines.push((s.favorite ? '⭐ ' : '   ') + s.name + ' [' + s.language + '] (' + s.prefix + ') - ' + s.description)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'search') {
    const query = parts.slice(1).join(' ').toLowerCase()
    if (!query) return { type: 'text', value: '📖 用法：/snippets search <query>' }
    const results = snippets.filter(s => s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query) || s.tags.some(t => t.includes(query)))
    if (results.length === 0) return { type: 'text', value: '未找到片段：' + query }
    const lines = ['🔍 搜索结果（' + results.length + '）：', '====================', '']
    results.forEach(s => lines.push(s.name + ' - ' + s.description))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'use') {
    const name = parts.slice(1).join(' ')
    const snippet = snippets.find(s => s.name.toLowerCase().includes(name.toLowerCase()))
    if (!snippet) return { type: 'text', value: '❌ 片段未找到：' + name }
    snippet.useCount++
    snippet.lastUsed = new Date().toISOString()
    return { type: 'text', value: '📝 片段：' + snippet.name + '\n' + snippet.body }
  }

  if (cmd === 'add') {
    return { type: 'text', value: '💡 添加片段：编辑 ' + SNIPPETS_DIR + '\n格式：{ id, name, prefix, description, language, body, tags: [] }' }
  }

  if (cmd === 'edit') {
    const name = parts.slice(1).join(' ')
    if (!name) return { type: 'text', value: '📖 用法：/snippets edit <name>' }
    const snippet = snippets.find(s => s.name.toLowerCase().includes(name.toLowerCase()))
    if (!snippet) return { type: 'text', value: '❌ 片段未找到：' + name }
    return { type: 'text', value: '✏️ 编辑：' + join(SNIPPETS_DIR, snippet.id + '.json') }
  }

  if (cmd === 'delete') {
    const name = parts.slice(1).join(' ')
    if (!name) return { type: 'text', value: '📖 用法：/snippets delete <name>' }
    const snippet = snippets.find(s => s.name.toLowerCase().includes(name.toLowerCase()))
    if (!snippet) return { type: 'text', value: '❌ 片段未找到：' + name }
    try {
      require('fs').unlinkSync(join(SNIPPETS_DIR, snippet.id + '.json'))
      return { type: 'text', value: '✅ 已删除：' + snippet.name }
    } catch { return { type: 'text', value: '❌ 删除失败' } }
  }

  if (cmd === 'copy') {
    const name = parts.slice(1).join(' ')
    const snippet = snippets.find(s => s.name.toLowerCase().includes(name.toLowerCase()))
    if (!snippet) return { type: 'text', value: '❌ 片段未找到：' + name }
    return { type: 'text', value: snippet.body }
  }

  if (cmd === 'tags') {
    const allTags = new Set<string>()
    snippets.forEach(s => s.tags.forEach(t => allTags.add(t)))
    return { type: 'text', value: '🏷️ 标签：' + (allTags.size > 0 ? Array.from(allTags).join(', ') : '无') }
  }

  if (cmd === 'recent') {
    const recent = snippets.filter(s => s.lastUsed).sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()).slice(0, 10)
    if (recent.length === 0) return { type: 'text', value: '🕐 无最近使用的片段' }
    const lines = ['🕐 最近使用：', '===============', '']
    recent.forEach(s => lines.push(s.name + ' - ' + s.lastUsed.slice(0, 10)))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'languages') {
    const langs = new Set(snippets.map(s => s.language))
    return { type: 'text', value: '🌐 语言：' + Array.from(langs).join(', ') }
  }

  if (cmd === 'init') {
    BUILT_IN_SNIPPETS.forEach(s => saveSnippet(s))
    return { type: 'text', value: '✅ 已创建 ' + BUILT_IN_SNIPPETS.length + ' 个内置片段（位于 ' + SNIPPETS_DIR + '）' }
  }

  return { type: 'text', value: '❓ 未知命令：' + cmd }
}

const snippets: Command = {
  type: 'local', name: 'snippets',
  description: '📝 代码片段 - 列表/搜索/使用/添加/编辑/删除/复制/标签/最近/初始化',
  aliases: '/snippets, /snip, /template'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default snippets
