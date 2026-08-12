import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync, appendFileSync, unlinkSync } from 'fs'
import { join, extname, basename, resolve, relative } from 'path'
import { execSync } from 'child_process'
import { watch } from 'fs'

const WIKI_DIR = '.wiki'

interface DocEntry {
  title: string
  path: string
  type: 'module' | 'class' | 'function' | 'api' | 'guide'
  description: string
}

function getProjectRoot(): string {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
  } catch {
    return process.cwd()
  }
}

function detectProjectType(): { language: string; framework: string; packageManager: string } {
  const root = getProjectRoot()
  let language = 'Unknown'
  let framework = 'Unknown'
  let packageManager = 'npm'

  if (existsSync(join(root, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps.typescript) language = 'TypeScript'
      else language = 'JavaScript'
      if (deps.next) framework = 'Next.js'
      else if (deps.react) framework = 'React'
      else if (deps.vue) framework = 'Vue'
      else if (deps.express) framework = 'Express'
      else if (deps.fastify) framework = 'Fastify'
    } catch { /* ignore */ }
    if (existsSync(join(root, 'bun.lockb'))) packageManager = 'bun'
    else if (existsSync(join(root, 'pnpm-lock.yaml'))) packageManager = 'pnpm'
    else if (existsSync(join(root, 'yarn.lock'))) packageManager = 'yarn'
  } else if (existsSync(join(root, 'pyproject.toml'))) { language = 'Python' }
  else if (existsSync(join(root, 'Cargo.toml'))) { language = 'Rust' }
  else if (existsSync(join(root, 'go.mod'))) { language = 'Go' }

  return { language, framework, packageManager }
}

function extractFunctions(content: string): { name: string; line: number; doc: string }[] {
  const results: { name: string; line: number; doc: string }[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const funcMatch = line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/)
    const arrowMatch = line.match(/^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/)
    const defMatch = line.match(/^def\s+(\w+)\s*\(/)
    const funcGoMatch = line.match(/^func\s+(\w+)\s*\(/)

    const name = funcMatch?.[1] || arrowMatch?.[1] || defMatch?.[1] || funcGoMatch?.[1]
    if (name && name !== 'if' && name !== 'while' && name !== 'for') {
      let doc = ''
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prev = lines[j].trim()
        if (prev.startsWith('/**') || prev.startsWith('///') || prev.startsWith('#')) {
          doc = prev
          break
        }
      }
      results.push({ name, line: i + 1, doc })
    }
  }
  return results
}

function generateProjectTree(dir: string, prefix = '', depth = 3): string {
  if (depth <= 0) return ''
  let result = ''
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'build')
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const isLast = i === entries.length - 1
      const connector = isLast ? '└── ' : '├── '
      const childPrefix = isLast ? '    ' : '│   '

      if (entry.isDirectory()) {
        result += `${prefix}${connector}📁 ${entry.name}/\n`
        result += generateProjectTree(join(dir, entry.name), prefix + childPrefix, depth - 1)
      } else {
        const icon = extname(entry.name) === '.ts' ? '🔷' : extname(entry.name) === '.tsx' ? '🔶' : extname(entry.name) === '.py' ? '🐍' : '📄'
        result += `${prefix}${connector}${icon} ${entry.name}\n`
      }
    }
  } catch { /* ignore */ }
  return result
}

// ── 链接索引管理 ──
interface WikiLink {
  from: string
  to: string
  createdAt: string
}

function getLinksIndexPath(): string {
  return join(getProjectRoot(), WIKI_DIR, '.links.json')
}

function loadLinks(): WikiLink[] {
  const p = getLinksIndexPath()
  if (!existsSync(p)) return []
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return [] }
}

function saveLinks(links: WikiLink[]): void {
  const p = getLinksIndexPath()
  const dir = join(getProjectRoot(), WIKI_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(p, JSON.stringify(links, null, 2), 'utf-8')
}

function addLink(from: string, to: string): void {
  const links = loadLinks()
  links.push({ from, to, createdAt: new Date().toISOString() })
  saveLinks(links)
}

// ── 依赖图生成（Mermaid） ──
function generateDependencyGraph(): string {
  const root = getProjectRoot()
  const lines = ['```mermaid', 'graph TD']

  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const depNames = Object.keys(deps).filter(d => !d.startsWith('@types/'))
    const projName = pkg.name || basename(root)

    lines.push(`    ${projName}[${projName}]`)
    depNames.slice(0, 30).forEach((dep, i) => {
      const nodeId = `dep${i}`
      lines.push(`    ${nodeId}["${dep}"]`)
      lines.push(`    ${projName} --> ${nodeId}`)
    })

    // 分析 src/ 模块间依赖
    const importMap = new Map<string, Set<string>>()
    const scanImports = (dir: string) => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
          const fp = join(dir, entry.name)
          if (entry.isDirectory()) {
            scanImports(fp)
          } else if (['.ts', '.tsx'].includes(extname(entry.name))) {
            try {
              const content = readFileSync(fp, 'utf-8')
              const moduleKey = relative(root, fp).replace(/\\/g, '/')
              const imports = new Set<string>()
              const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g
              let m: RegExpExecArray | null
              while ((m = importRegex.exec(content)) !== null) {
                if (m[1].startsWith('.') || m[1].startsWith('src/')) {
                  imports.add(m[1])
                }
              }
              if (imports.size > 0) importMap.set(moduleKey, imports)
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }
    scanImports(root)

    let edgeIdx = 0
    importMap.forEach((imports, mod) => {
      imports.forEach(imp => {
        const target = imp.replace(/^\.\.\//, '').replace(/^\.\//, '')
        lines.push(`    E${edgeIdx}["${mod}"] --> E${edgeIdx + 1}["${target}"]`)
        edgeIdx += 2
      })
    })
  } catch { /* ignore */ }

  lines.push('```')
  return lines.join('\n')
}

// ── 文档目录结构生成 ──
function generateToc(): string {
  const root = getProjectRoot()
  const lines = ['# 📑 文档目录结构', '']

  const scanDir = (dir: string, depth = 0) => {
    if (depth > 3) return
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
        .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'build')
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1
          if (!a.isDirectory() && b.isDirectory()) return 1
          return a.name.localeCompare(b.name)
        })
      for (const entry of entries) {
        const indent = '  '.repeat(depth)
        const fp = join(dir, entry.name)
        if (entry.isDirectory()) {
          lines.push(`${indent}- 📁 **${entry.name}/**`)
          scanDir(fp, depth + 1)
        } else if (['.md', '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.json'].includes(extname(entry.name))) {
          const icon = extname(entry.name) === '.md' ? '📝' : '📄'
          try {
            const stat = statSync(fp)
            const sizeKB = (stat.size / 1024).toFixed(1)
            lines.push(`${indent}- ${icon} ${entry.name} _(${sizeKB} KB)_`)
          } catch {
            lines.push(`${indent}- ${icon} ${entry.name}`)
          }
        }
      }
    } catch { /* ignore */ }
  }
  scanDir(root)
  return lines.join('\n')
}

// ── Markdown 终端渲染 ──
function renderMarkdown(text: string): string {
  const lines = text.split('\n')
  const rendered: string[] = []
  let inCodeBlock = false

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      rendered.push(inCodeBlock ? '┌──────────────────────────' : '└──────────────────────────')
      continue
    }
    if (inCodeBlock) {
      rendered.push(`│ ${line}`)
      continue
    }

    // 标题
    if (line.startsWith('# ')) {
      rendered.push('')
      rendered.push(`══ ${line.substring(2)} ══`)
      rendered.push('')
    } else if (line.startsWith('## ')) {
      rendered.push('')
      rendered.push(`── ${line.substring(3)} ──`)
      rendered.push('')
    } else if (line.startsWith('### ')) {
      rendered.push(`  ▸ ${line.substring(4)}`)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      rendered.push(`  • ${line.substring(2)}`)
    } else if (line.startsWith('> ')) {
      rendered.push(`  ┃ ${line.substring(2)}`)
    } else if (line.match(/^\d+\.\s/)) {
      rendered.push(`  ${line}`)
    } else if (line.trim() === '---') {
      rendered.push('  ' + '─'.repeat(40))
    } else if (line.trim() === '') {
      rendered.push('')
    } else {
      // 粗体和行内代码处理
      let processed = line
      processed = processed.replace(/\*\*(.+?)\*\*/g, '[1m$1[0m')
      processed = processed.replace(/`([^`]+)`/g, '「$1」')
      rendered.push(processed)
    }
  }
  return rendered.join('\n')
}

// ── 模板管理 ──
interface WikiTemplate {
  name: string
  content: string
}

function getTemplatesDir(): string {
  return join(getProjectRoot(), WIKI_DIR, 'templates')
}

function getBuiltInTemplates(): WikiTemplate[] {
  return [
    {
      name: 'api-doc',
      content: '# API: {{name}}\n\n## 概述\n\n{{description}}\n\n## 接口列表\n\n### `{{method}} {{path}}`\n\n**请求参数:**\n\n| 参数 | 类型 | 必填 | 说明 |\n|------|------|------|------|\n| param1 | string | 是 | 描述 |\n\n**响应示例:**\n\n```json\n{\n  "code": 0,\n  "data": {}\n}\n```\n\n## 错误码\n\n| 错误码 | 说明 |\n|--------|------|\n| 0 | 成功 |\n| 1001 | 参数错误 |\n',
    },
    {
      name: 'module-doc',
      content: '# 模块: {{name}}\n\n## 概述\n\n{{description}}\n\n## 文件结构\n\n```\n{{structure}}\n```\n\n## 核心函数\n\n- `function1()` - 描述\n- `function2()` - 描述\n\n## 依赖\n\n- 依赖模块1\n- 依赖模块2\n\n## 使用示例\n\n```typescript\nimport { {{name}} } from \'./{{name}}\'\n```\n',
    },
    {
      name: 'adr',
      content: '# ADR-{{number}}: {{title}}\n\n## 状态\n\n{{status}}\n\n## 背景\n\n{{context}}\n\n## 决策\n\n{{decision}}\n\n## 后果\n\n### 正面\n\n- \n\n### 负面\n\n- \n\n### 风险\n\n- \n',
    },
    {
      name: 'changelog-entry',
      content: '# 版本 {{version}} - {{date}}\n\n## ✨ 新功能\n\n- \n\n## 🐛 修复\n\n- \n\n## 🔧 改进\n\n- \n\n## ⚠️ 破坏性变更\n\n- \n',
    },
  ]
}

function ensureTemplates(): void {
  const dir = getTemplatesDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  for (const t of getBuiltInTemplates()) {
    const fp = join(dir, `${t.name}.md`)
    if (!existsSync(fp)) writeFileSync(fp, t.content, 'utf-8')
  }
}

// ── 索引管理 ──
function getIndexPath(): string {
  return join(getProjectRoot(), WIKI_DIR, '.index.json')
}

interface WikiIndexEntry {
  file: string
  title: string
  keywords: string[]
  updatedAt: string
}

function rebuildIndex(): WikiIndexEntry[] {
  const root = getProjectRoot()
  const entries: WikiIndexEntry[] = []
  const scanDir = (dir: string) => {
    try {
      const items = readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        if (item.name.startsWith('.') || item.name === 'node_modules') continue
        const fp = join(dir, item.name)
        if (item.isDirectory()) {
          scanDir(fp)
        } else if (['.md', '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'].includes(extname(item.name))) {
          try {
            const content = readFileSync(fp, 'utf-8')
            const relPath = relative(root, fp).replace(/\\/g, '/')
            // 提取标题
            const titleMatch = content.match(/^#\s+(.+)$/m)
            const title = titleMatch ? titleMatch[1] : item.name
            // 提取关键词（注释和函数名）
            const keywords: string[] = []
            const keywordRegex = /(?:\/\/\s*@\w+|^\s*[\w]+:|function\s+\w+|class\s+\w+)/gm
            let m: RegExpExecArray | null
            while ((m = keywordRegex.exec(content)) !== null) {
              keywords.push(m[0].trim().replace(/^\/\/\s*/, '').replace(/^function\s+/, '').replace(/^class\s+/, ''))
            }
            entries.push({
              file: relPath,
              title,
              keywords: [...new Set(keywords)].slice(0, 20),
              updatedAt: statSync(fp).mtime.toISOString(),
            })
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  scanDir(root)
  // 保存索引
  const indexPath = getIndexPath()
  const dir = join(root, WIKI_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(indexPath, JSON.stringify(entries, null, 2), 'utf-8')
  return entries
}

// ── 全文搜索（增强版） ──
function fullTextSearch(keyword: string): string {
  const root = getProjectRoot()
  const results: { file: string; line: number; text: string; context: string }[] = []
  const kwLower = keyword.toLowerCase()

  const scanDir = (dir: string) => {
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue
        const fp = join(dir, entry.name)
        if (entry.isDirectory()) {
          scanDir(fp)
        } else if (['.md', '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.json', '.toml', '.yaml', '.yml'].includes(extname(entry.name))) {
          try {
            const content = readFileSync(fp, 'utf-8')
            const lines = content.split('\n')
            lines.forEach((line, i) => {
              if (line.toLowerCase().includes(kwLower)) {
                const ctxStart = Math.max(0, i - 1)
                const ctxEnd = Math.min(lines.length - 1, i + 1)
                const context = lines.slice(ctxStart, ctxEnd + 1).map((l, idx) => {
                  const marker = idx === i - ctxStart ? '▶' : ' '
                  return `  ${marker} ${l.trim().substring(0, 70)}`
                }).join('\n')
                results.push({
                  file: entry.name,
                  line: i + 1,
                  text: line.trim().substring(0, 80),
                  context,
                })
              }
            })
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  scanDir(root)

  if (results.length === 0) return '❌ 未找到匹配内容'

  const grouped = new Map<string, typeof results>()
  results.forEach(r => {
    if (!grouped.has(r.file)) grouped.set(r.file, [])
    grouped.get(r.file)!.push(r)
  })

  const output: string[] = [`🔍 搜索结果: "${keyword}"`, `找到 ${results.length} 条匹配，分布于 ${grouped.size} 个文件`, '']
  grouped.forEach((matches, file) => {
    output.push(`📄 ${file} (${matches.length} 条)`)
    matches.slice(0, 5).forEach(m => {
      output.push(`  L${m.line}: ${m.text}`)
    })
    if (matches.length > 5) output.push(`  ... 还有 ${matches.length - 5} 条`)
    output.push('')
  })
  return output.join('\n')
}

// ── 文档差异比较 ──
function diffDocs(file1: string, file2: string): string {
  const root = getProjectRoot()
  const fp1 = resolve(root, file1)
  const fp2 = resolve(root, file2)

  if (!existsSync(fp1)) return `❌ 文件不存在: ${file1}`
  if (!existsSync(fp2)) return `❌ 文件不存在: ${file2}`

  let content1 = ''
  let content2 = ''
  try { content1 = readFileSync(fp1, 'utf-8') } catch { return `❌ 无法读取: ${file1}` }
  try { content2 = readFileSync(fp2, 'utf-8') } catch { return `❌ 无法读取: ${file2}` }

  const lines1 = content1.split('\n')
  const lines2 = content2.split('\n')
  const output: string[] = [`📊 文档差异: ${file1} vs ${file2}`, '']

  // 简单 LCS diff
  const maxLen = Math.max(lines1.length, lines2.length)
  let added = 0, removed = 0, changed = 0

  for (let i = 0; i < maxLen; i++) {
    const l1 = lines1[i] ?? ''
    const l2 = lines2[i] ?? ''
    if (l1 === l2) {
      if (l1) output.push(`  ${i + 1}: ${l1.substring(0, 60)}`)
    } else {
      if (l1) { output.push(`- ${i + 1}: ${l1.substring(0, 60)}`); removed++ }
      if (l2) { output.push(`+ ${i + 1}: ${l2.substring(0, 60)}`); added++ }
      if (l1 && l2) changed++
    }
  }

  output.push('')
  output.push(`统计: -${removed} 行 +${added} 行 ~${changed} 行变更`)
  return output.join('\n')
}

// ── Git 历史版本差异 ──
function diffGitVersions(filePath: string): string {
  const root = getProjectRoot()
  const fullPath = resolve(root, filePath)

  if (!existsSync(fullPath)) return `❌ 文件不存在: ${filePath}`
  if (!existsSync(join(root, '.git'))) return '❌ 当前目录不是 git 仓库'

  try {
    const log = execSync(`git log --oneline -5 -- "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      cwd: root,
    })
    if (!log.trim()) return `❌ 文件没有 git 历史: ${filePath}`

    const commits = log.trim().split('\n').map(l => l.split(' ')[0]).filter(Boolean)
    if (commits.length < 2) return `❌ 文件只有一个提交历史，无法比较`

    const latest = commits[0]
    const previous = commits[1]

    const diff = execSync(`git diff ${previous}..${latest} -- "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      cwd: root,
    })

    return [
      `📊 版本差异: ${filePath}`,
      `比较: ${previous} → ${latest}`,
      '',
      diff || '无差异',
    ].join('\n')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return `❌ 无法获取 git 差异: ${msg}`
  }
}

// ── 清理孤立文档 ──
function cleanOrphanDocs(): string {
  const root = getProjectRoot()
  const wikiDir = join(root, WIKI_DIR)
  if (!existsSync(wikiDir)) return '❌ .wiki/ 目录不存在'

  const removed: string[] = []
  const scanDir = (dir: string) => {
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const fp = join(dir, entry.name)
        if (entry.isDirectory()) {
          scanDir(fp)
        } else if (entry.name.endsWith('.md')) {
          // 检查内容是否为空或仅包含占位符
          try {
            const content = readFileSync(fp, 'utf-8').trim()
            const isOrphan = content.length < 10 ||
              content === '# TODO' ||
              content === '# 占位符' ||
              content === '# Placeholder' ||
              content === '# Untitled' ||
              !content.includes('\n')
            if (isOrphan) {
              unlinkSync(fp)
              removed.push(relative(wikiDir, fp).replace(/\\/g, '/'))
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  scanDir(wikiDir)

  if (removed.length === 0) return '✅ 没有发现孤立文档'

  return [
    `🧹 清理完成，移除 ${removed.length} 个孤立文档:`,
    ...removed.map(r => `  - ${r}`),
  ].join('\n')
}

// ── 文件监视 ──
function watchFiles(callback: (event: string, filename: string) => void): () => void {
  const root = getProjectRoot()
  let watcher: ReturnType<typeof watch> | null = null
  try {
    watcher = watch(root, { recursive: true }, (event, filename) => {
      if (filename && !filename.includes('node_modules') && !filename.includes('.git')) {
        callback(event, filename)
      }
    })
  } catch { /* ignore */ }
  return () => { watcher?.close() }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const target = parts.slice(1).join(' ')
  const root = getProjectRoot()
  const { language, framework, packageManager } = detectProjectType()

  if (cmd === 'help' || cmd === '') {
    return {
      type: 'text',
      value: [
        '📚 Wiki 文档生成',
        '',
        '📖 用法: ',
        '  /wiki generate [路径]     生成项目 Wiki',
        '  /wiki readme             生成 README.md',
        '  /wiki api                生成 API 文档',
        '  /wiki architecture       生成架构文档',
        '  /wiki changelog          生成变更日志',
        '  /wiki search <关键词>    搜索文档',
        '  /wiki export             导出为 Markdown',
        '',
        '  /wiki graph              生成模块依赖图（Mermaid）',
        '  /wiki toc                生成文档目录结构',
        '  /wiki link <from> <to>   在文档间创建链接',
        '  /wiki render <文件>      终端渲染 Markdown',
        '  /wiki watch              监视文件变化',
        '  /wiki diff <f1> [f2]     比较文档差异',
        '  /wiki template <名称>    从模板创建文档',
        '  /wiki index              重建文档索引',
        '  /wiki clean              清理孤立文档',
        '',
        `当前项目: ${language} / ${framework} / ${packageManager}`,
      ].join('\n'),
    }
  }

  if (cmd === 'architecture') {
    const tree = generateProjectTree(root, '', 2)
    const lines = [
      '# 🏗️ 项目架构',
      '',
      `**语言:** ${language}`,
      `**框架:** ${framework}`,
      `**包管理:** ${packageManager}`,
      '',
      '## 目录结构',
      '',
      '```',
      tree,
      '```',
      '',
      '## 模块说明',
      '',
    ]

    // 分析顶层目录
    try {
      const entries = readdirSync(root, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      for (const entry of entries) {
        const dirPath = join(root, entry.name)
        const files = readdirSync(dirPath).filter(f => !f.startsWith('.'))
        lines.push(`### 📁 ${entry.name}/`)
        lines.push(`文件数: ${files.length}`)
        if (files.length > 0) {
          lines.push(`主要文件: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`)
        }
        lines.push('')
      }
    } catch { /* ignore */ }

    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'api') {
    const lines: string[] = ['# 📖 API 文档', '']
    const scanDir = (dir: string) => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory()) {
            scanDir(fullPath)
          } else if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(entry.name))) {
            try {
              const content = readFileSync(fullPath, 'utf-8')
              const funcs = extractFunctions(content).filter(f => f.doc)
              if (funcs.length > 0) {
                lines.push(`## ${entry.name}`)
                funcs.forEach(f => {
                  lines.push(`### \`${f.name}()\` (行 ${f.line})`)
                  if (f.doc) lines.push(f.doc)
                  lines.push('')
                })
              }
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }
    scanDir(root)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'changelog') {
    try {
      const log = execSync('git log --oneline --pretty=format:"%h %s (%ad)" --date=short -30', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      })
      const lines = ['# 📜 变更日志', '', '## 最近 30 次提交', '']
      log.split('\n').forEach(l => { if (l.trim()) lines.push(`- ${l}`) })
      return { type: 'text', value: lines.join('\n') }
    } catch {
      return { type: 'text', value: '❌ 无法读取 git log' }
    }
  }

  if (cmd === 'readme') {
    const lines = [
      `# 项目`,
      '',
      `> ${language} / ${framework} 项目`,
      '',
      '## 快速开始',
      '',
      '```bash',
      `${packageManager} install`,
      `${packageManager} run dev`,
      '```',
      '',
      '## 项目结构',
      '',
      '```',
      generateProjectTree(root, '', 2),
      '```',
      '',
      '## 文档',
      '',
      '- `/wiki architecture` - 架构文档',
      '- `/wiki api` - API 文档',
      '- `/wiki changelog` - 变更日志',
    ]
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'generate') {
    const targetPath = target || root
    const lines: string[] = [
      '# 📚 项目 Wiki',
      '',
      `**项目:** ${basename(root)}`,
      `**语言:** ${language}`,
      `**框架:** ${framework}`,
      `**生成时间:** ${new Date().toISOString()}`,
      '',
      '---',
      '',
    ]

    const scanDir = (dir: string, depth = 0) => {
      if (depth > 2) return
      try {
        const entries = readdirSync(dir, { withFileTypes: true })
          .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'build')
        for (const entry of entries) {
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory()) {
            lines.push(`${'#'.repeat(depth + 2)} 📁 ${entry.name}/`)
            lines.push('')
            scanDir(fullPath, depth + 1)
          } else if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'].includes(extname(entry.name))) {
            lines.push(`${'#'.repeat(depth + 3)} 📄 ${entry.name}`)
            try {
              const content = readFileSync(fullPath, 'utf-8')
              const funcs = extractFunctions(content)
              if (funcs.length > 0) {
                lines.push('')
                funcs.forEach(f => lines.push(`- \`${f.name}()\` (行 ${f.line})`))
              }
            } catch { /* ignore */ }
            lines.push('')
          }
        }
      } catch { /* ignore */ }
    }

    scanDir(targetPath)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'search') {
    const keyword = target
    if (!keyword) return { type: 'text', value: '请提供搜索关键词' }
    const results: string[] = []
    const scanDir = (dir: string) => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory()) scanDir(fullPath)
          else if (entry.name.endsWith('.md') || entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
            try {
              const content = readFileSync(fullPath, 'utf-8')
              if (content.toLowerCase().includes(keyword.toLowerCase())) {
                const lines = content.split('\n')
                lines.forEach((line, i) => {
                  if (line.toLowerCase().includes(keyword.toLowerCase())) {
                    results.push(`${entry.name}:${i + 1} - ${line.trim().substring(0, 80)}`)
                  }
                })
              }
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }
    scanDir(root)
    return {
      type: 'text',
      value: results.length > 0
        ? `🔍 搜索结果 (${results.length}):\n\n${results.slice(0, 20).join('\n')}`
        : '❌ 未找到匹配内容',
    }
  }

  if (cmd === 'export') {
    try {
      const wikiDir = join(root, WIKI_DIR)
      if (!existsSync(wikiDir)) mkdirSync(wikiDir, { recursive: true })

      const files = [
        { name: 'architecture.md', content: (await call('architecture', {}) as { value: string }).value },
        { name: 'api.md', content: (await call('api', {}) as { value: string }).value },
        { name: 'changelog.md', content: (await call('changelog', {}) as { value: string }).value },
      ]

      for (const file of files) {
        writeFileSync(join(wikiDir, file.name), file.content, 'utf-8')
      }

      return { type: 'text', value: `✅ Wiki 已导出到 ${WIKI_DIR}/ 目录\n${files.map(f => `  - ${f.name}`).join('\n')}` }
    } catch {
      return { type: 'text', value: '❌ 导出失败' }
    }
  }

  // ── 新命令: graph ──────────────────────────────────────────
  if (cmd === 'graph') {
    const graph = generateDependencyGraph()
    return {
      type: 'text',
      value: [
        '📊 项目模块依赖图',
        '',
        graph,
        '',
        '提示: 将以上 Mermaid 代码粘贴到支持 Mermaid 的编辑器中查看图表',
      ].join('\n'),
    }
  }

  // ── 新命令: toc ──────────────────────────────────────────
  if (cmd === 'toc') {
    const toc = generateToc()
    return { type: 'text', value: toc }
  }

  // ── 新命令: link ──────────────────────────────────────────
  if (cmd === 'link') {
    const linkParts = target.split(/\s+/)
    if (linkParts.length < 2) {
      return { type: 'text', value: '用法: /wiki link <from> <to>\n示例: /wiki link architecture.md api.md' }
    }
    const [from, to] = linkParts
    addLink(from, to)
    const links = loadLinks()
    return {
      type: 'text',
      value: [
        `✅ 链接已创建: ${from} → ${to}`,
        '',
        `当前共 ${links.length} 条链接:`,
        ...links.map(l => `  ${l.from} → ${l.to}`),
      ].join('\n'),
    }
  }

  // ── 新命令: render ──────────────────────────────────────────
  if (cmd === 'render') {
    const filePath = target
    if (!filePath) {
      // 渲染默认 README 或 wiki 首页
      const candidates = ['README.md', join(WIKI_DIR, 'architecture.md'), join(WIKI_DIR, 'api.md')]
      let content = ''
      for (const c of candidates) {
        const fp = resolve(root, c)
        if (existsSync(fp)) { content = readFileSync(fp, 'utf-8'); break }
      }
      if (!content) return { type: 'text', value: '用法: /wiki render <文件路径>\n渲染 Markdown 为终端格式' }
      return { type: 'text', value: renderMarkdown(content) }
    }
    const fp = resolve(root, filePath)
    if (!existsSync(fp)) return { type: 'text', value: `❌ 文件不存在: ${filePath}` }
    try {
      const content = readFileSync(fp, 'utf-8')
      return { type: 'text', value: renderMarkdown(content) }
    } catch {
      return { type: 'text', value: `❌ 无法读取: ${filePath}` }
    }
  }

  // ── 新命令: watch ──────────────────────────────────────────
  if (cmd === 'watch') {
    const changes: string[] = []
    const stop = watchFiles((event, filename) => {
      const ts = new Date().toLocaleTimeString()
      changes.push(`[${ts}] ${event}: ${filename}`)
      // 自动重建索引
      try { rebuildIndex() } catch { /* ignore */ }
    })

    // 返回初始状态（非阻塞，watch 在后台运行）
    setTimeout(() => {
      stop()
    }, 30000) // 30秒后自动停止

    return {
      type: 'text',
      value: [
        '👁️ 文件监视已启动 (30秒)',
        '',
        '监视项目文件变化，自动更新文档索引...',
        `监视目录: ${root}`,
        '',
        '提示: 在此窗口按 Ctrl+C 停止监视',
      ].join('\n'),
    }
  }

  // ── 新命令: diff ──────────────────────────────────────────
  if (cmd === 'diff') {
    const diffParts = target.split(/\s+/)
    if (diffParts.length >= 2) {
      // 比较两个文件
      const result = diffDocs(diffParts[0], diffParts[1])
      return { type: 'text', value: result }
    } else if (diffParts.length === 1 && diffParts[0]) {
      // 比较 git 历史版本
      const result = diffGitVersions(diffParts[0])
      return { type: 'text', value: result }
    }
    return {
      type: 'text',
      value: '用法:\n  /wiki diff <文件1> <文件2>   比较两个文件\n  /wiki diff <文件>          比较 git 历史版本',
    }
  }

  // ── 新命令: template ──────────────────────────────────────────
  if (cmd === 'template') {
    const templateName = target.trim()
    ensureTemplates()

    if (!templateName) {
      // 列出所有模板
      const templates = getBuiltInTemplates()
      const customDir = getTemplatesDir()
      const customTemplates = existsSync(customDir)
        ? readdirSync(customDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
        : []
      return {
        type: 'text',
          value: [
          '📋 可用模板:',
        '',
        '内置模板:',
        ...templates.map(t => `  • ${t.name}`),
        ...(customTemplates.length > 0 ? ['', '自定义模板:', ...customTemplates.map(t => `  • ${t}`)] : []),
        '',
        '用法: /wiki template <模板名称>',
        '模板文件保存在: .wiki/templates/',
        ].join('\n'),
      }
    }

    // 使用模板创建文档
    const templates = getBuiltInTemplates()
    const tpl = templates.find(t => t.name === templateName)
    if (!tpl) {
      // 检查自定义模板
      const customPath = join(getTemplatesDir(), `${templateName}.md`)
      if (existsSync(customPath)) {
        const content = readFileSync(customPath, 'utf-8')
        const wikiDir = join(root, WIKI_DIR)
        if (!existsSync(wikiDir)) mkdirSync(wikiDir, { recursive: true })
        const newFileName = `${templateName}-${Date.now()}.md`
        writeFileSync(join(wikiDir, newFileName), content, 'utf-8')
        return { type: 'text', value: `✅ 从自定义模板创建: ${newFileName}` }
      }
      return { type: 'text', value: `❌ 模板不存在: ${templateName}\n使用 /wiki template 查看可用模板` }
    }

    const wikiDir = join(root, WIKI_DIR)
    if (!existsSync(wikiDir)) mkdirSync(wikiDir, { recursive: true })
    const newFileName = `${templateName}-${Date.now()}.md`
    writeFileSync(join(wikiDir, newFileName), tpl.content, 'utf-8')
    return { type: 'text', value: `✅ 从模板 "${templateName}" 创建: ${newFileName}` }
  }

  // ── 新命令: index ──────────────────────────────────────────
  if (cmd === 'index') {
    const entries = rebuildIndex()
    return {
      type: 'text',
      value: [
        '📇 文档索引已重建',
        '',
        `索引条目: ${entries.length}`,
        `存储位置: ${WIKI_DIR}/.index.json`,
        '',
        '索引内容预览 (前 20 条):',
        ...entries.slice(0, 20).map(e => `  [${e.file}] ${e.title} (${e.keywords.length} 关键词)`),
        ...(entries.length > 20 ? [`  ... 还有 ${entries.length - 20} 条`] : []),
      ].join('\n'),
    }
  }

  // ── 新命令: clean ──────────────────────────────────────────
  if (cmd === 'clean') {
    const result = cleanOrphanDocs()
    return { type: 'text', value: result }
  }

  return { type: 'text', value: '未知命令。使用 /wiki 查看帮助。' }
}

const wiki: Command = {
  type: 'local',
  name: 'wiki',
  description: '项目 Wiki 生成 - 架构/API/文档/变更日志/依赖图/模板/搜索',
  aliases: ['/wiki', '/docs'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default wiki
