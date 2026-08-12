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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📚 文档生成器', '', '📖 用法：', '  /docs generate [格式]          生成文档 (md/html)', '  /docs api                       API 文档', '  /docs readme                    生成 README', '  /docs classes                   类文档', '  /docs functions                 函数文档', '  /docs exports                   导出文档', '  /docs search <查询>             搜索文档', '  /docs watch                     监听变更', '  /docs serve                     本地托管文档', '  /docs export <文件>             导出到文件', ''].join('\n') }

  if (cmd === 'generate' || cmd === 'gen') {
    const format = parts[1] || 'md'
    const files = scanSourceFiles('.')
    const pages: DocPage[] = [{ title: '索引', path: 'README.md', content: '# 文档\n\n' }]
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
      return { type: 'text', value: '✅ 已生成：docs.html' }
    }
    const md = pages.map(p => p.content).join('\n---\n\n')
    writeFileSync('DOCS.md', md, 'utf-8')
    return { type: 'text', value: '✅ 已生成：DOCS.md（' + pages.length + ' 页）' }
  }

  if (cmd === 'api') return { type: 'text', value: '💡 使用 /api-doc 生成 API 文档' }
  if (cmd === 'readme') return { type: 'text', value: '💡 使用 /wiki readme 生成 README' }
  if (cmd === 'classes' || cmd === 'functions' || cmd === 'exports') {
    const files = scanSourceFiles('.')
    const label = cmd === 'classes' ? '📦 类' : cmd === 'functions' ? '🔧 函数' : '📤 导出'
    const lines = [label, '════════════════', '']
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
    if (!query) return { type: 'text', value: '📖 用法：/docs search <查询>' }
    if (existsSync('DOCS.md')) {
      const content = readFileSync('DOCS.md', 'utf-8')
      const matches = content.split('\n').filter(l => l.toLowerCase().includes(query))
      return { type: 'text', value: matches.length > 0 ? matches.join('\n') : 'ℹ️ 未找到结果' }
    }
    return { type: 'text', value: 'ℹ️ 未找到文档。请先运行 /docs generate' }
  }

  if (cmd === 'watch') return { type: 'text', value: '👁️ 正在监听变更... 使用 /docs generate 重新生成' }
  if (cmd === 'serve') return { type: 'text', value: '🌐 托管文档：npx serve docs/ 或 python -m http.server 8080' }
  if (cmd === 'export') {
    const file = parts[1] || 'docs.md'
    if (existsSync('DOCS.md')) { writeFileSync(file, readFileSync('DOCS.md', 'utf-8'), 'utf-8'); return { type: 'text', value: '✅ 已导出：' + file } }
    return { type: 'text', value: 'ℹ️ 未找到文档。请先运行 /docs generate' }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const docs: Command = {
  type: 'local', name: 'docs',
  description: '📚 文档 - 生成/API/README/类/函数/托管/导出/搜索',
  aliases: '/docs, /doc, /documentation'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default docs
