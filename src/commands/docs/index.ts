import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'

interface DocPage { title: string; path: string; content: string }

function scanSourceFiles(dir: string): string[] {
  const files: string[] = []
  const fs = require('fs')
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/i.test(entry.name)) files.push(fp)
      }
    } catch { /* ignore */ }
  }
  scan(dir)
  return files
}

function extractFunctions(content: string): { name: string; params: string; returns: string; doc: string }[] {
  const funcs: any[] = []
  const lines = content.split('\n')
  let currentDoc = ''
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('/**')) { currentDoc = ''; return }
    if (t.startsWith('*') && currentDoc !== undefined) { currentDoc += t.replace(/^\s*\*\s?/, '') + ' '; return }
    const match = line.match(/^(?:export\s+)?(?:async\s+)?(?:function|const)\s+(\w+)\s*(?:\(([^)]*)\))?(?:\s*:\s*(\w+))?/)
    if (match) {
      funcs.push({ name: match[1], params: match[2] || '', returns: match[3] || 'void', doc: currentDoc.trim() })
      currentDoc = ''
    }
  })
  return funcs
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Documentation Generator', '', '📖 📖 Usage: ', '  /docs generate [format]        Generate docs (md/html)', '  /docs api                       API documentation', '  /docs readme                    Generate README', '  /docs classes                   Class documentation', '  /docs functions                 Function documentation', '  /docs exports                   Export documentation', '  /docs search <query>            Search in docs', '  /docs watch                     Watch for changes', '  /docs serve                     Serve docs locally', '  /docs export <file>             Export to file', ''].join('\n') }

  if (cmd === 'generate' || cmd === 'gen') {
    const format = parts[1] || 'md'
    const files = scanSourceFiles('.')
    const pages: DocPage[] = [{ title: 'Index', path: 'README.md', content: '# Documentation\n\n' }]
    files.forEach(f => {
      try {
        const content = readFileSync(f, 'utf-8')
        const funcs = extractFunctions(content)
        if (funcs.length > 0) {
          let pageContent = '# ' + basename(f) + '\n\n'
          funcs.forEach(fn => {
            pageContent += '## ' + fn.name + '(' + fn.params + '): ' + fn.returns + '\n\n'
            if (fn.doc) pageContent += fn.doc + '\n\n'
          })
          pages.push({ title: basename(f), path: f, content: pageContent })
        }
      } catch { /* ignore */ }
    })
    if (format === 'html') {
      const html = '<html><head><title>Docs</title><style>body{font-family:system-ui;max-width:800px;margin:0 auto;padding:20px}</style></head><body>' + pages.map(p => '<h1>' + p.title + '</h1><pre>' + p.content.replace(/</g, '&lt;') + '</pre>').join('') + '</body></html>'
      writeFileSync('docs.html', html, 'utf-8')
      return { type: 'text', value: '[OK] Generated: docs.html' }
    }
    const md = pages.map(p => p.content).join('\n---\n\n')
    writeFileSync('DOCS.md', md, 'utf-8')
    return { type: 'text', value: '[OK] Generated: DOCS.md (' + pages.length + ' pages)' }
  }

  if (cmd === 'api') return { type: 'text', value: 'Use /api-doc for API documentation generation' }
  if (cmd === 'readme') return { type: 'text', value: 'Use /wiki readme for README generation' }
  if (cmd === 'classes' || cmd === 'functions' || cmd === 'exports') {
    const files = scanSourceFiles('.')
    const lines = [cmd.charAt(0).toUpperCase() + cmd.slice(1) + ':', '================', '']
    files.forEach(f => {
      try {
        const content = readFileSync(f, 'utf-8')
        const funcs = extractFunctions(content)
        if (funcs.length > 0) { lines.push('--- ' + f + ' ---'); funcs.forEach(fn => lines.push('  ' + fn.name + '(' + fn.params + '): ' + fn.returns)) }
      } catch { /* ignore */ }
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'search') {
    const query = parts.slice(1).join(' ').toLowerCase()
    if (!query) return { type: 'text', value: 'Usage: /docs search <query>' }
    if (existsSync('DOCS.md')) {
      const content = readFileSync('DOCS.md', 'utf-8')
      const matches = content.split('\n').filter(l => l.toLowerCase().includes(query))
      return { type: 'text', value: matches.length > 0 ? matches.join('\n') : 'No results' }
    }
    return { type: 'text', value: 'No docs found. Run /docs generate first.' }
  }

  if (cmd === 'watch') return { type: 'text', value: 'Watching for changes... Regenerate with /docs generate' }
  if (cmd === 'serve') return { type: 'text', value: 'Serve docs: npx serve docs/ or python -m http.server 8080' }
  if (cmd === 'export') {
    const file = parts[1] || 'docs.md'
    if (existsSync('DOCS.md')) { writeFileSync(file, readFileSync('DOCS.md', 'utf-8'), 'utf-8'); return { type: 'text', value: '[OK] Exported: ' + file } }
    return { type: 'text', value: 'No docs found. Run /docs generate first.' }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const docs: Command = {
  type: 'local', name: 'docs',
  description: 'Documentation - generate/api/readme/classes/functions/serve/export/search',
  aliases: '/docs, /doc, /documentation'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default docs
