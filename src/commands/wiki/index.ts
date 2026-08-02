import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join, extname, basename, resolve } from 'path'
import { execSync } from 'child_process'

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
        '用法:',
        '  /wiki generate [路径]     生成项目 Wiki',
        '  /wiki readme             生成 README.md',
        '  /wiki api                生成 API 文档',
        '  /wiki architecture       生成架构文档',
        '  /wiki changelog          生成变更日志',
        '  /wiki search <关键词>    搜索文档',
        '  /wiki export             导出为 Markdown',
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
        : '未找到匹配内容',
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

  return { type: 'text', value: '未知命令。使用 /wiki 查看帮助。' }
}

const wiki: Command = {
  type: 'local',
  name: 'wiki',
  description: '项目 Wiki 生成 - 架构/API/文档/变更日志',
  aliases: ['/wiki', '/docs'],
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default wiki
