import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename, dirname } from 'path'

interface APIEndpoint {
  name: string
  method: string
  path: string
  description: string
  params: string[]
  returnType: string
  file: string
  line: number
}

interface OpenAPIInfo {
  openapi: string
  info: { title: string; version: string; description: string }
  paths: Record<string, Record<string, { summary: string; parameters: any[]; responses: Record<string, any> }>>
}

function extractJSdocs(content: string): APIEndpoint[] {
  const endpoints: APIEndpoint[] = []
  const lines = content.split('\n')
  let currentComment = ''
  let inComment = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('/**')) { inComment = true; currentComment = ''; continue }
    if (inComment) {
      if (line.startsWith('*')) {
        const text = line.replace(/^\s*\*\s?/, '').trim()
        if (text && !text.startsWith('@')) currentComment += text + ' '
        else if (text.startsWith('@param')) {
          const paramMatch = text.match(/@param\s+\{?\w+\}?\s+(\w+)/)
          if (paramMatch) endpoints[endpoints.length - 1]?.params.push(paramMatch[1])
        }
      }
      if (line.includes('*/')) {
        inComment = false
        const funcMatch = (lines[i + 1] || '').match(/(?:export\s+)?(?:async\s+)?(?:function|const)\s+(\w+)/)
        if (funcMatch && currentComment) {
          endpoints.push({ name: funcMatch[1], method: '', path: '', description: currentComment.trim(), params: [], returnType: '', file: '', line: i + 1 })
        }
        currentComment = ''
      }
    }
  }
  return endpoints
}

function extractRoutes(content: string, framework: 'express' | 'fastify' | 'koa'): APIEndpoint[] {
  const endpoints: APIEndpoint[] = []
  const routeRegex = /\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g
  let match
  while ((match = routeRegex.exec(content)) !== null) {
    const lines = content.slice(0, match.index).split('\n')
    endpoints.push({ name: match[2], method: match[1].toUpperCase(), path: match[2], description: '', params: [], returnType: '', file: '', line: lines.length })
  }
  return endpoints
}

function generateMarkdown(title: string, endpoints: APIEndpoint[]): string {
  const lines = ['# ' + title, '', '## API Reference', '']
  const grouped: Record<string, APIEndpoint[]> = {}
  endpoints.forEach(e => { const group = e.path.split('/')[1] || 'root'; if (!grouped[group]) grouped[group] = []; grouped[group].push(e) })
  for (const [group, items] of Object.entries(grouped)) {
    lines.push('## /' + group)
    items.forEach(e => {
      lines.push('### ' + (e.method ? e.method + ' ' : '') + e.path)
      if (e.description) lines.push(e.description)
      if (e.params.length > 0) lines.push('**Parameters:** ' + e.params.join(', '))
      lines.push('')
    })
  }
  return lines.join('\n')
}

function generateHTML(title: string, endpoints: APIEndpoint[]): string {
  return `<!DOCTYPE html>
<html><head><title>${title} - API Docs</title>
<style>body{font-family:system-ui;max-width:900px;margin:0 auto;padding:20px}
.endpoint{border:1e6e solid #ddd;border-radius:8px;padding:16px;margin:12px 0}
.method{display:inline-block;padding:4px 8px;border-radius:4px;color:#fff;font-weight:bold}
.get{background:#61affe}.post{background:#49cc90}.put{background:#fca130}.delete{background:#f93e3e}
.path{font-family:monospace;font-size:1.1em;margin-left:8px}</style></head>
<body><h1>${title}</h1>
${endpoints.map(e => `<div class="endpoint"><span class="method ${e.method.toLowerCase()}">${e.method}</span><span class="path">${e.path}</span><p>${e.description}</p></div>`).join('\n')}
</body></html>`
}

export const call: LocalJSXCommandCall = async (args) => {
  const p = args.trim().split(/\s+/)
  const c = p[0] || ''
  if (!c) return { type: 'text', value: [
    'API Documentation Generator', '', 'Usage:',
    '  /api-doc gen <file> [format]     Generate docs (md/html/json)',
    '  /api-doc scan <dir>              Scan directory for APIs',
    '  /api-doc routes <file>           Extract routes',
    '  /api-doc jsdoc <file>            Extract JSDoc comments',
    '  /api-doc openapi <file>          Parse OpenAPI spec',
    '  /api-doc classes <file>          Extract classes',
    '  /api-doc interfaces <file>       Extract interfaces',
    '  /api-doc types <file>            Extract type aliases',
    '  /api-doc exports <file>          List all exports',
    '  /api-doc all [dir]               Full project documentation',
  ].join('\n') }

  let r = ''

  if (c === 'gen') {
    const file = p[1]; const format = p[2] || 'md'
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    const content = readFileSync(file, 'utf-8')
    const endpoints = [...extractJSdocs(content), ...extractRoutes(content, 'express')]
    const title = basename(file, extname(file))
    if (format === 'html') { r = generateHTML(title, endpoints) }
    else if (format === 'json') { r = JSON.stringify(endpoints, null, 2) }
    else { r = generateMarkdown(title, endpoints) }
  }

  else if (c === 'scan') {
    const dir = p[1] || '.'
    if (!existsSync(dir)) return { type: 'text', value: 'Directory not found: ' + dir }
    const allEndpoints: APIEndpoint[] = []
    const scan = (d: string) => {
      try {
        for (const item of readdirSync(d, { withFileTypes: true })) {
          const fp = join(d, item.name)
          if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') scan(fp)
          else if (item.isFile() && /\.(ts|tsx|js|jsx)$/i.test(item.name)) {
            try {
              const content = readFileSync(fp, 'utf-8')
              allEndpoints.push(...extractJSdocs(content).map(e => ({ ...e, file: fp })))
              allEndpoints.push(...extractRoutes(content, 'express').map(e => ({ ...e, file: fp })))
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }
    scan(dir)
    const lines = ['API Scan Results:', '==================', '', 'Found ' + allEndpoints.length + ' endpoints:', '']
    allEndpoints.forEach(e => lines.push((e.method || 'FUNC') + ' ' + e.path + ' (' + e.file + ':' + e.line + ')'))
    r = lines.join('\n')
  }

  else if (c === 'routes') {
    const file = p[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    const routes = extractRoutes(readFileSync(file, 'utf-8'), 'express')
    r = 'Routes in ' + file + ':\n' + routes.map(r => r.method + ' ' + r.path).join('\n')
  }

  else if (c === 'jsdoc') {
    const file = p[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    const jsdocs = extractJSdocs(readFileSync(file, 'utf-8'))
    r = 'JSDoc in ' + file + ':\n' + jsdocs.map(j => '## ' + j.name + '\n' + j.description).join('\n\n')
  }

  else if (c === 'openapi') {
    const file = p[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    try {
      const spec = JSON.parse(readFileSync(file, 'utf-8')) as OpenAPIInfo
      const lines = ['OpenAPI: ' + spec.info?.title + ' v' + spec.info?.version, 'Paths:', '']
      if (spec.paths) {
        for (const [path, methods] of Object.entries(spec.paths)) {
          for (const [method, info] of Object.entries(methods)) {
            lines.push(method.toUpperCase() + ' ' + path + ' - ' + (info.summary || ''))
          }
        }
      }
      r = lines.join('\n')
    } catch { r = 'Invalid JSON: ' + file }
  }

  else if (c === 'classes' || c === 'interfaces' || c === 'types') {
    const file = p[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    const content = readFileSync(file, 'utf-8')
    const regex = c === 'classes' ? /class\s+(\w+)/g : c === 'interfaces' ? /interface\s+(\w+)/g : /type\s+(\w+)\s*=/g
    const names: string[] = []
    let match
    while ((match = regex.exec(content)) !== null) names.push(match[1])
    r = c.charAt(0).toUpperCase() + c.slice(1) + ' in ' + file + ':\n' + (names.join('\n') || '(none)')
  }

  else if (c === 'exports') {
    const file = p[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    const content = readFileSync(file, 'utf-8')
    const exports = content.match(/export\s+(?:async\s+)?(?:function|const|class|interface|type|default)\s+(\w+)/g) || []
    r = 'Exports from ' + file + ':\n' + exports.map(e => '  ' + e.replace('export ', '')).join('\n')
  }

  else if (c === 'all') {
    const dir = p[1] || '.'
    const allEndpoints: APIEndpoint[] = []
    const scan = (d: string) => {
      try {
        for (const item of readdirSync(d, { withFileTypes: true })) {
          const fp = join(d, item.name)
          if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') scan(fp)
          else if (item.isFile() && /\.(ts|tsx|js|jsx)$/i.test(item.name)) {
            try {
              const content = readFileSync(fp, 'utf-8')
              allEndpoints.push(...extractJSdocs(content).map(e => ({ ...e, file: fp })))
              allEndpoints.push(...extractRoutes(content, 'express').map(e => ({ ...e, file: fp })))
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }
    scan(dir)
    r = generateMarkdown('API Documentation', allEndpoints)
  }

  else { r = 'Unknown: ' + c }

  return { type: 'text', value: r || '(no output)' }
}

const cmd = { type: 'local-jsx' as const, name: 'api-doc', description: 'API docs - gen/scan/routes/jsdoc/openapi/classes/interfaces/types/exports/all + html/md/json', argumentHint: '<gen|scan|routes|jsdoc|openapi|classes|interfaces|types|exports|all> [file|dir]', isEnabled: () => true, load: () => import('./index.ts') } satisfies Command
export default cmd
