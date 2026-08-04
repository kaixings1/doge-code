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
  { id: 'snippet-react-fc', name: 'React Functional Component', prefix: 'rfc', description: 'React functional component with TypeScript', language: 'typescriptreact', body: 'import React from "react";\n\ninterface Props {\n  // props\n}\n\nexport default function Component({}: Props) {\n  return <div>Component</div>;\n}', tags: ['react', 'typescript'], useCount: 0, lastUsed: '', favorite: false },
  { id: 'snippet-react-hook', name: 'React Custom Hook', prefix: 'rhook', description: 'React custom hook pattern', language: 'typescriptreact', body: 'import { useState, useEffect } from "react";\n\nexport function useHook() {\n  const [state, setState] = useState();\n  useEffect(() => {}, []);\n  return { state, setState };\n}', tags: ['react', 'hook'], useCount: 0, lastUsed: '', favorite: false },
  { id: 'snippet-express-route', name: 'Express Route', prefix: 'eroute', description: 'Express.js route handler', language: 'typescript', body: 'app.get("/api/items", async (req, res) => {\n  try {\n    const items = await Item.find();\n    res.json(items);\n  } catch (err) {\n    res.status(500).json({ error: err.message });\n  }\n});', tags: ['express', 'api'], useCount: 0, lastUsed: '', favorite: false },
  { id: 'snippet-try-catch', name: 'Try-Catch Block', prefix: 'tryc', description: 'Try-catch with error handling', language: 'typescript', body: 'try {\n  // code\n} catch (error) {\n  console.error("Error:", error.message);\n  // handle error\n}', tags: ['error-handling'], useCount: 0, lastUsed: '', favorite: false },
];

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const snippets = [...BUILT_IN_SNIPPETS, ...loadSnippets()]

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Snippet Manager', '', 'Usage:', '  /snippets list                 List all snippets', '  /snippets search <query>       Search snippets', '  /snippets use <name>           Use snippet', '  /snippets add                  Add new snippet', '  /snippets edit <name>          Edit snippet', '  /snippets delete <name>        Delete snippet', '  /snippets copy <name>          Copy to clipboard', '  /snippets tags                 List tags', '  /snippets recent               Recently used', '  /snippets languages            List languages', '  /snippets init                 Initialize built-in snippets', ''].join('\n') }

  if (cmd === 'list' || cmd === 'ls') {
    if (snippets.length === 0) return { type: 'text', value: 'No snippets. Run /snippets init to create built-in snippets.' }
    const lines = ['Snippets (' + snippets.length + '):', '==================', '']
    snippets.forEach(s => {
      lines.push((s.favorite ? '⭐ ' : '   ') + s.name + ' [' + s.language + '] (' + s.prefix + ') - ' + s.description)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'search') {
    const query = parts.slice(1).join(' ').toLowerCase()
    if (!query) return { type: 'text', value: 'Usage: /snippets search <query>' }
    const results = snippets.filter(s => s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query) || s.tags.some(t => t.includes(query)))
    if (results.length === 0) return { type: 'text', value: 'No snippets found for: ' + query }
    const lines = ['Search Results (' + results.length + '):', '====================', '']
    results.forEach(s => lines.push(s.name + ' - ' + s.description))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'use') {
    const name = parts.slice(1).join(' ')
    const snippet = snippets.find(s => s.name.toLowerCase().includes(name.toLowerCase()))
    if (!snippet) return { type: 'text', value: 'Snippet not found: ' + name }
    snippet.useCount++
    snippet.lastUsed = new Date().toISOString()
    return { type: 'text', value: 'Snippet: ' + snippet.name + '\n' + snippet.body }
  }

  if (cmd === 'add') {
    return { type: 'text', value: 'To add a snippet, edit: ' + SNIPPETS_DIR + '\nFormat: { id, name, prefix, description, language, body, tags: [] }' }
  }

  if (cmd === 'edit') {
    const name = parts.slice(1).join(' ')
    if (!name) return { type: 'text', value: 'Usage: /snippets edit <name>' }
    const snippet = snippets.find(s => s.name.toLowerCase().includes(name.toLowerCase()))
    if (!snippet) return { type: 'text', value: 'Snippet not found: ' + name }
    return { type: 'text', value: 'Edit: ' + join(SNIPPETS_DIR, snippet.id + '.json') }
  }

  if (cmd === 'delete') {
    const name = parts.slice(1).join(' ')
    if (!name) return { type: 'text', value: 'Usage: /snippets delete <name>' }
    const snippet = snippets.find(s => s.name.toLowerCase().includes(name.toLowerCase()))
    if (!snippet) return { type: 'text', value: 'Snippet not found: ' + name }
    try {
      require('fs').unlinkSync(join(SNIPPETS_DIR, snippet.id + '.json'))
      return { type: 'text', value: '[OK] Deleted: ' + snippet.name }
    } catch { return { type: 'text', value: '[ERROR] Delete failed' } }
  }

  if (cmd === 'copy') {
    const name = parts.slice(1).join(' ')
    const snippet = snippets.find(s => s.name.toLowerCase().includes(name.toLowerCase()))
    if (!snippet) return { type: 'text', value: 'Snippet not found: ' + name }
    return { type: 'text', value: snippet.body }
  }

  if (cmd === 'tags') {
    const allTags = new Set<string>()
    snippets.forEach(s => s.tags.forEach(t => allTags.add(t)))
    return { type: 'text', value: 'Tags: ' + (allTags.size > 0 ? Array.from(allTags).join(', ') : 'none') }
  }

  if (cmd === 'recent') {
    const recent = snippets.filter(s => s.lastUsed).sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()).slice(0, 10)
    if (recent.length === 0) return { type: 'text', value: 'No recently used snippets' }
    const lines = ['Recently Used:', '===============', '']
    recent.forEach(s => lines.push(s.name + ' - ' + s.lastUsed.slice(0, 10)))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'languages') {
    const langs = new Set(snippets.map(s => s.language))
    return { type: 'text', value: 'Languages: ' + Array.from(langs).join(', ') }
  }

  if (cmd === 'init') {
    BUILT_IN_SNIPPETS.forEach(s => saveSnippet(s))
    return { type: 'text', value: '[OK] Created ' + BUILT_IN_SNIPPETS.length + ' built-in snippets in ' + SNIPPETS_DIR }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const snippets: Command = {
  type: 'local', name: 'snippets',
  description: 'Snippet manager - list/search/use/add/edit/delete/copy/tags/recent/init',
  aliases: '/snippets, /snip, /template'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default snippets
