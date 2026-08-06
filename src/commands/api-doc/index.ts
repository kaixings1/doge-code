import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename, dirname } from 'path'
import ts from 'typescript'

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

interface ParamInfo {
  name: string
  type: string
  optional?: boolean
  rest?: boolean
}

interface FunctionSignature {
  name: string
  params: ParamInfo[]
  returnType: string
  isAsync: boolean
  isExport: boolean
  line: number
}

/** 解析参数列表字符串 "a: string, b?: number, ...rest: any[]" 为结构化参数 */
export function parseParams(paramStr: string): ParamInfo[] {
  const params: ParamInfo[] = []
  if (!paramStr || paramStr.trim() === '') return params
  let depth = 0
  let current = ''
  for (const ch of paramStr) {
    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      params.push(parseSingleParam(current.trim()))
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) params.push(parseSingleParam(current.trim()))
  return params
}

export function parseSingleParam(raw: string): ParamInfo {
  // 处理 rest: ...args: T[]
  let rest = false
  let r = raw.trim()
  if (r.startsWith('...')) {
    rest = true
    r = r.slice(3).trim()
  }
  // 处理可选: name?: type
  const qIndex = r.indexOf('?:')
  if (qIndex !== -1) {
    return { name: r.slice(0, qIndex).trim(), type: r.slice(qIndex + 2).trim(), optional: true, rest }
  }
  // 处理带默认值: name: type = default
  const eqIndex = r.indexOf(' = ')
  if (eqIndex !== -1) {
    return { name: r.slice(0, r.indexOf(':')).trim(), type: r.slice(r.indexOf(':') + 1, eqIndex).trim(), rest }
  }
  const colonIndex = r.indexOf(':')
  if (colonIndex !== -1) {
    return { name: r.slice(0, colonIndex).trim(), type: r.slice(colonIndex + 1).trim(), rest }
  }
  // 无类型标注（TS 推断）
  return { name: r, type: 'any', rest }
}

/**
 * TypeScript 函数签名提取（声明式 + 箭头函数 + 类方法）
 */
export function extractFunctionSignatures(content: string): FunctionSignature[] {
  const signatures: FunctionSignature[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 1. 函数声明: export async function foo(a: string): Promise<void> {
    const declMatch = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/)
    if (declMatch) {
      signatures.push({
        name: declMatch[1],
        params: parseParams(declMatch[2]),
        returnType: (declMatch[3] || 'void').trim(),
        isAsync: line.includes('async '),
        isExport: line.includes('export '),
        line: i + 1,
      })
      continue
    }

    // 2. 箭头函数: export const foo = async (a: string): Promise<void> => {
    const arrowMatch = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>/)
    if (arrowMatch) {
      signatures.push({
        name: arrowMatch[1],
        params: parseParams(arrowMatch[2]),
        returnType: (arrowMatch[3] || 'void').trim(),
        isAsync: line.includes('async '),
        isExport: line.includes('export '),
        line: i + 1,
      })
      continue
    }

    // 3. 类方法: public async foo(a: string): Promise<void> {
    const methodMatch = line.match(/^\s*(?:private|public|protected|static|readonly|async|get|set|\s)*(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/)
    if (methodMatch && !line.includes('function') && !line.includes('=>')) {
      // 排除构造函数名和常见关键词
      if (!['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[1])) {
        signatures.push({
          name: methodMatch[1],
          params: parseParams(methodMatch[2]),
          returnType: (methodMatch[3] || 'void').trim(),
          isAsync: line.includes('async '),
          isExport: false,
          line: i + 1,
        })
      }
    }
  }
  return signatures
}

/** 生成函数签名 Markdown 文档 */
export function generateSignaturesMarkdown(file: string, sigs: FunctionSignature[]): string {
  if (sigs.length === 0) return ''
  const lines = ['## Function Signatures', '']
  sigs.forEach(s => {
    const params = s.params.map(p => `\`${p.name}${p.optional ? '?' : ''}: ${p.type}\``).join(', ')
    const flags = [s.isExport ? 'export' : '', s.isAsync ? 'async' : ''].filter(Boolean).join(' ')
    lines.push(`### ${flags ? flags + ' ' : ''}${s.name}(${params})`)
    lines.push(`- **返回类型:** \`${s.returnType}\``)
    lines.push(`- **行号:** ${s.line}`)
    if (s.params.length === 0) lines.push('- **参数:** 无')
    lines.push('')
  })
  return lines.join('\n')
}

export function extractJSdocs(content: string): APIEndpoint[] {
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

// ============================================================================
// TypeScript AST 精确类型提取（D3：api-doc AST）
// 使用 TypeScript Compiler API 解析接口成员 / 类型别名结构 / 枚举成员 / 类成员
// ============================================================================

export interface TypeMemberInfo {
  name: string
  type: string
  optional: boolean
  kind: 'property' | 'method' | 'index'
}

export interface TypeDeclInfo {
  name: string
  kind: 'interface' | 'type' | 'enum' | 'class'
  typeParams: string[]
  extends: string[]
  members: TypeMemberInfo[]
  line: number
}

/** 将 TS 类型节点序列化为紧凑文本 */
function typeNodeText(node: ts.TypeNode | null, source: ts.SourceFile): string {
  if (!node) return 'any'
  return node.getText(source).replace(/\s+/g, ' ')
}

/** 解析类型参数列表（泛型） */
function typeParamsOf(node: ts.Node): string[] {
  const decl = node as ts.InterfaceDeclaration
  const params = decl.typeParameters
  if (!params) return []
  return params.map(p => p.getText())
}

/** 提取接口成员（属性/方法/索引签名） */
function membersOfInterface(node: ts.InterfaceDeclaration, source: ts.SourceFile): TypeMemberInfo[] {
  const members: TypeMemberInfo[] = []
  for (const member of node.members) {
    if (ts.isPropertySignature(member)) {
      const nameText = (member.name as ts.Identifier).text
      members.push({ name: nameText, type: typeNodeText(member.type ?? null, source), optional: !!member.questionToken, kind: 'property' })
    } else if (ts.isMethodSignature(member)) {
      const nameText = (member.name as ts.Identifier).text
      const params = member.parameters.map(p => p.getText(source)).join(', ')
      const returnType = typeNodeText(member.type ?? null, source)
      members.push({ name: nameText, type: '(' + params + ') => ' + returnType, optional: !!member.questionToken, kind: 'method' })
    } else if (ts.isIndexSignatureDeclaration(member)) {
      members.push({ name: '[index]', type: typeNodeText(member.type ?? null, source), optional: false, kind: 'index' })
    }
  }
  return members
}

/**
 * TypeScript AST 精确类型提取
 * 解析 interface / type 别名 / enum / class 的成员结构与泛型参数
 */
export function extractTypesAST(content: string): TypeDeclInfo[] {
  const result: TypeDeclInfo[] = []
  const source = ts.createSourceFile('doc.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const lineStarts = source.getLineStarts()

  const lineOf = (pos: number): number => {
    let lo = 0, hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= pos) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node)) {
      const extendsList = node.heritageClauses
        ? node.heritageClauses.flatMap(h => h.types.map(t => t.getText(source)))
        : []
      result.push({
        name: node.name.text,
        kind: 'interface',
        typeParams: typeParamsOf(node),
        extends: extendsList,
        members: membersOfInterface(node, source),
        line: lineOf(node.getStart(source)),
      })
    } else if (ts.isTypeAliasDeclaration(node)) {
      // 对象字面量类型的成员也解析
      let members: TypeMemberInfo[] = []
      if (node.type && ts.isTypeLiteralNode(node.type)) {
        for (const member of node.type.members) {
          if (ts.isPropertySignature(member)) {
            const nameText = (member.name as ts.Identifier).text
            members.push({ name: nameText, type: typeNodeText(member.type ?? null, source), optional: !!member.questionToken, kind: 'property' })
          } else if (ts.isMethodSignature(member)) {
            const nameText = (member.name as ts.Identifier).text
            const params = member.parameters.map(p => p.getText(source)).join(', ')
            members.push({ name: nameText, type: '(' + params + ') => ' + typeNodeText(member.type ?? null, source), optional: !!member.questionToken, kind: 'method' })
          }
        }
      }
      result.push({
        name: node.name.text,
        kind: 'type',
        typeParams: typeParamsOf(node),
        extends: [],
        members,
        line: lineOf(node.getStart(source)),
      })
    } else if (ts.isEnumDeclaration(node)) {
      const members: TypeMemberInfo[] = node.members.map(m => ({
        name: m.name.getText(source),
        type: m.initializer ? m.initializer.getText(source) : 'auto',
        optional: false,
        kind: 'property' as const,
      }))
      result.push({ name: node.name.text, kind: 'enum', typeParams: [], extends: [], members, line: lineOf(node.getStart(source)) })
    } else if (ts.isClassDeclaration(node) && node.name) {
      const extendsList = node.heritageClauses
        ? node.heritageClauses.flatMap(h => h.types.map(t => t.getText(source)))
        : []
      const members: TypeMemberInfo[] = []
      for (const member of node.members) {
        if (ts.isPropertyDeclaration(member) && member.name) {
          members.push({
            name: member.name.getText(source),
            type: typeNodeText(member.type ?? null, source),
            optional: !!member.questionToken,
            kind: 'property',
          })
        } else if (ts.isMethodDeclaration(member) && member.name) {
          const params = member.parameters.map(p => p.getText(source)).join(', ')
          const returnType = typeNodeText(member.type ?? null, source)
          members.push({ name: member.name.getText(source), type: '(' + params + ') => ' + returnType, optional: false, kind: 'method' })
        }
      }
      result.push({ name: node.name.text, kind: 'class', typeParams: typeParamsOf(node), extends: extendsList, members, line: lineOf(node.getStart(source)) })
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return result
}

/** 生成类型声明的 Markdown 文档 */
export function generateTypesMarkdown(file: string, types: TypeDeclInfo[]): string {
  if (types.length === 0) return ''
  const lines = ['## Type Declarations', '']
  for (const t of types) {
    const typeParams = t.typeParams.length > 0 ? '<' + t.typeParams.join(', ') + '>' : ''
    const extendsStr = t.extends.length > 0 ? ' extends ' + t.extends.join(', ') : ''
    lines.push('### ' + t.kind + ' ' + t.name + typeParams + extendsStr)
    lines.push('- **行号:** ' + t.line)
    if (t.members.length === 0) {
      lines.push('- **成员:** 无')
    } else {
      lines.push('')
      for (const m of t.members) {
        const marker = t.kind === 'enum' ? '·' : (m.optional ? '?' : '')
        lines.push('- ' + marker + ' `' + m.name + marker + '`: `' + m.type + '`')
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * 精确路由提取：支持 Express/Fastify/Koa 链式 + 装饰器 + Next.js App Router
 */
export function extractRoutesAdvanced(content: string): APIEndpoint[] {
  const endpoints: APIEndpoint[] = []
  const lines = content.split('\n')
  const lineStarts = new Map<string, number>()

  // Next.js App Router: export const GET/POST/PUT/DELETE = async (req) => {...}
  const appRouterMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const m of appRouterMethods) {
      const match = line.match(new RegExp(`export\\s+(?:async\\s+)?(?:const|function)\\s+${m}\\b`))
      if (match) {
        endpoints.push({ name: m, method: m, path: '', description: 'Next.js App Router handler', params: [], returnType: 'Response', file: '', line: i + 1 })
        break
      }
    }
    // 装饰器路由: @Get('/users') / @Post('/users')
    const decoratorMatch = line.match(/@(Get|Post|Put|Delete|Patch|Options|Head)\(\s*['"]([^'"]+)['"]\s*\)/)
    if (decoratorMatch) {
      endpoints.push({ name: decoratorMatch[2], method: decoratorMatch[1].toUpperCase(), path: decoratorMatch[2], description: 'Decorator route', params: [], returnType: '', file: '', line: i + 1 })
    }
    // 链式路由: app.route('/users').get(...)
    const chainMatch = line.match(/\.route\(\s*['"]([^'"]+)['"]\s*\)\s*\.(get|post|put|delete|patch)\s*\(/)
    if (chainMatch) {
      endpoints.push({ name: chainMatch[1], method: chainMatch[2].toUpperCase(), path: chainMatch[1], description: 'Chained route', params: [], returnType: '', file: '', line: i + 1 })
    }
    // 参数提取: async (req: Request<{ params: { id: string } }>
    if (line.includes('params:')) {
      const paramMatch = line.match(/params:\s*\{\s*(\w+)\s*:/)
      if (paramMatch && endpoints.length > 0) {
        const last = endpoints[endpoints.length - 1]
        if (last && last.line === i + 1) last.params.push(paramMatch[1])
      }
    }
  }
  return endpoints
}

export function extractRoutes(content: string, framework: 'express' | 'fastify' | 'koa'): APIEndpoint[] {
  const endpoints: APIEndpoint[] = []
  const routeRegex = /\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g
  let match
  while ((match = routeRegex.exec(content)) !== null) {
    const lines = content.slice(0, match.index).split('\n')
    endpoints.push({ name: match[2], method: match[1].toUpperCase(), path: match[2], description: '', params: [], returnType: '', file: '', line: lines.length })
  }
  return endpoints
}

export function generateMarkdown(title: string, endpoints: APIEndpoint[]): string {
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

export const call: LocalCommandCall = async (args) => {
  const p = args.trim().split(/\s+/)
  const c = p[0] || ''
  if (!c) return { type: 'text', value: [
    'API Documentation Generator', '', 'Usage:',
    '  /api-doc gen <file> [format]     Generate docs (md/html/json)',
    '  /api-doc scan <dir>              Scan directory for APIs',
    '  /api-doc routes <file>           Extract routes',
    '  /api-doc jsdoc <file>            Extract JSDoc comments',
    '  /api-doc openapi <file>          Parse OpenAPI spec',
    '  /api-doc sigs <file>             Extract function signatures (params/return types)',
    '  /api-doc classes <file>          Extract classes',
    '  /api-doc interfaces <file>       Extract interfaces',
    '  /api-doc types <file>            Extract type aliases (AST)',
    '  /api-doc exports <file>          List all exports',
    '  /api-doc all [dir]               Full project documentation',
  ].join('\n') }

  let r = ''

  if (c === 'gen') {
    const file = p[1]; const format = p[2] || 'md'
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    const content = readFileSync(file, 'utf-8')
    const endpoints = [...extractJSdocs(content), ...extractRoutes(content, 'express'), ...extractRoutesAdvanced(content)]
    const title = basename(file, extname(file))
    if (endpoints.length === 0) {
      // Try to extract function-like declarations as API endpoints
      const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g
      const classRegex = /(?:export\s+)?class\s+(\w+)/g
      let match
      while ((match = funcRegex.exec(content)) !== null) {
        endpoints.push({ name: match[1], method: '', path: '', description: '', params: [], returnType: '', file: file, line: content.substring(0, match.index).split('\n').length })
      }
      while ((match = classRegex.exec(content)) !== null) {
        endpoints.push({ name: match[1], method: '', path: '', description: 'Class', params: [], returnType: '', file: file, line: content.substring(0, match.index).split('\n').length })
      }
    }
    if (format === 'html') { r = generateHTML(title, endpoints) }
    else if (format === 'json') { r = JSON.stringify(endpoints, null, 2) }
    else {
      r = generateMarkdown(title, endpoints)
      const sigDoc = generateSignaturesMarkdown(file, extractFunctionSignatures(content))
      if (sigDoc) r += '\n' + sigDoc
      const typeDoc = generateTypesMarkdown(file, extractTypesAST(content))
      if (typeDoc) r += '\n' + typeDoc
    }
  }

  else if (c === 'sigs') {
    const file = p[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    const sigs = extractFunctionSignatures(readFileSync(file, 'utf-8'))
    r = generateSignaturesMarkdown(file, sigs) || 'No function signatures found in ' + file
  }

  else if (c === 'types') {
    const file = p[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    const types = extractTypesAST(readFileSync(file, 'utf-8'))
    r = generateTypesMarkdown(file, types) || 'No type declarations found in ' + file
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
              allEndpoints.push(...extractRoutesAdvanced(content).map(e => ({ ...e, file: fp })))
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

  else if (c === 'classes' || c === 'interfaces') {
    const file = p[1]
    if (!file || !existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    const content = readFileSync(file, 'utf-8')
    const regex = c === 'classes' ? /class\s+(\w+)/g : /interface\s+(\w+)/g
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
              allEndpoints.push(...extractRoutesAdvanced(content).map(e => ({ ...e, file: fp })))
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

const cmd = { type: 'local' as const, name: 'api-doc', description: 'API docs - gen/scan/routes/jsdoc/openapi/classes/interfaces/types/exports/all + html/md/json', argumentHint: '<gen|scan|routes|jsdoc|openapi|classes|interfaces|types|exports|all> [file|dir]', isEnabled: () => true, supportsNonInteractive: true, load: () => Promise.resolve({ call }) } satisfies Command
export default cmd
