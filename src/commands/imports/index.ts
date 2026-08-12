import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, extname } from 'path'

interface ImportInfo {
  file: string
  line: number
  module: string
  named: string[]
  isType: boolean
  unused: boolean
}

function analyzeImports(dir: string): ImportInfo[] {
  const imports: ImportInfo[] = []
  const exts = ['.ts', '.tsx', '.js', '.jsx']
  const fs = require('fs')

  const scan = (d: string) => {
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && exts.includes(extname(entry.name))) {
          try {
            const content = readFileSync(fp, 'utf-8')
            const lines = content.split('\n')
            lines.forEach((line, i) => {
              const impMatch = line.match(/^(?:import|export)\s+(?:type\s+)?(?:\*\s+as\s+)?(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/)
              const reqMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/)
              if (impMatch) {
                const named = impMatch[1] ? impMatch[1].split(',').map((s: string) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean) : []
                const defaultImp = impMatch[2] || ''
                imports.push({ file: fp, line: i + 1, module: impMatch[3], named: defaultImp ? [defaultImp, ...named] : named, isType: line.includes('type'), unused: false })
              } else if (reqMatch) {
                imports.push({ file: fp, line: i + 1, module: reqMatch[1], named: [], isType: false, unused: false })
              }
            })
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  scan(dir)
  return imports
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim().split(/\s+/)
  const cmd = s[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: [
    '📦 导入管理器', '', '📖 用法: ',
    '  /imports analyze [路径]          分析所有导入',
    '  /imports unused [路径]           查找未使用的导入',
    '  /imports organize [文件]         整理文件中的导入',
    '  /imports sort [文件]             按字母排序导入',
    '  /imports remove-unused [文件]    移除未使用的导入',
    '  /imports convert [文件]          转换 require 为 import',
    '  /imports stats [路径]            导入统计',
    '  /imports circular [路径]         检测循环依赖',
    '  /imports graph [路径]            生成导入图',
    '  /imports find <模块>             查找模块导入',
  ].join('\n') }

  if (cmd === 'analyze' || cmd === 'stats') {
    const target = s[1] || '.'
    const imports = analyzeImports(target)
    if (imports.length === 0) return { type: 'text', value: '没有找到导入' }
    const modules: Record<string, number> = {}
    imports.forEach(i => { modules[i.module] = (modules[i.module] || 0) + 1 })
    const lines = ['📊 导入分析:', '=================', '', '导入总数: ' + imports.length, '唯一模块: ' + Object.keys(modules).length, '', '热门模块:']
    Object.entries(modules).sort((a: any, b: any) => b[1] - a[1]).slice(0, 15).forEach(([m, c]) => lines.push('  ' + m + ': ' + c))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'unused') {
    const target = s[1] || '.'
    const imports = analyzeImports(target)
    const unused: ImportInfo[] = []
    const fs = require('fs')
    imports.forEach(imp => {
      try {
        const content = fs.readFileSync(imp.file, 'utf-8')
        const unusedNames = imp.named.filter(n => {
          const regex = new RegExp('\\b' + n + '\\b', 'g')
          const matches = content.match(regex)
          return !matches || matches.length <= 1
        })
        if (unusedNames.length > 0) unused.push({ ...imp, named: unusedNames })
      } catch { /* ignore */ }
    })
    if (unused.length === 0) return { type: 'text', value: '✅ 没有找到未使用的导入' }
    const lines = ['🗑️ 未使用的导入 (' + unused.length + '):', '====================', '']
    unused.slice(0, 20).forEach(u => lines.push(u.file + ':' + u.line + ' - ' + u.named.join(', ') + ' from ' + u.module))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'organize' || cmd === 'sort') {
    const file = s[1]
    if (!file) return { type: 'text', value: '用法: /imports organize <文件>' }
    try {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      const imports: string[] = []
      const other: string[] = []
      lines.forEach(l => { if (/^(?:import|export)\s+/.test(l.trim())) imports.push(l); else other.push(l) })
      imports.sort((a, b) => a.localeCompare(b))
      const organized = [...imports, '', ...other]
      return { type: 'text', value: '已整理 ' + imports.length + ' 个导入于 ' + file + ':\n' + organized.join('\n').slice(0, 2000) }
    } catch (err) {
      return { type: 'text', value: '❌ 错误: ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'remove-unused') {
    const file = s[1]
    if (!file) return { type: 'text', value: '用法: /imports remove-unused <文件>' }
    return { type: 'text', value: '请先使用 /imports unused 查找未使用的导入，然后手动移除或使用代码检查工具。' }
  }

  if (cmd === 'convert') {
    const file = s[1]
    if (!file) return { type: 'text', value: '用法: /imports convert <文件>' }
    try {
      const content = readFileSync(file, 'utf-8')
      const converted = content.replace(/const\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, "import $1 from '$2'")
      return { type: 'text', value: 'Converted:\n' + converted.slice(0, 2000) }
    } catch { return { type: 'text', value: '❌ 错误: 无法读取文件' } }
  }

  if (cmd === 'circular') {
    return { type: 'text', value: 'Circular dependency detection requires running: npx madge --circular .' }
  }

  if (cmd === 'graph') {
    return { type: 'text', value: 'Import graph generation: npx depcruise --output-type dot . | dot -T svg > deps.svg' }
  }

  if (cmd === 'find') {
    const module = s[1]
    if (!module) return { type: 'text', value: 'Usage: /imports find <module>' }
    const imports = analyzeImports('.')
    const found = imports.filter(i => i.module.includes(module))
    if (found.length === 0) return { type: 'text', value: 'No imports of: ' + module }
    const lines = ['Imports of "' + module + '" (' + found.length + '):', '================================', '']
    found.forEach(f => lines.push(f.file + ':' + f.line))
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const imports: Command = {
  type: 'local', name: 'imports',
  description: 'Import management - analyze/unused/organize/sort/convert/circular/graph',
  aliases: ['/imports', '/imp'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default imports
