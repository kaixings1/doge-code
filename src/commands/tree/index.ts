import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

const CONFIG_DIR = join(homedir(), '.doge', 'tree')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

interface TreeConfig {
  maxDepth: number
  showHidden: boolean
  showSizes: boolean
  showIcons: boolean
  showFiles: boolean
  useUnicode: boolean
  excludePatterns: string[]
  sortBySize: boolean
  gitTrackedOnly: boolean
}

const DEFAULT_CONFIG: TreeConfig = {
  maxDepth: 4,
  showHidden: false,
  showSizes: false,
  showIcons: true,
  showFiles: true,
  useUnicode: true,
  excludePatterns: ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt'],
  sortBySize: false,
  gitTrackedOnly: false,
}

function loadConfig(): TreeConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: TreeConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function getFileIcon(file: string): string {
  const ext = extname(file).toLowerCase()
  const icons: Record<string, string> = {
    '.ts': '🔷', '.tsx': '🔶', '.js': '🟡', '.jsx': '🟠', '.py': '🐍', '.go': '🔵',
    '.rs': '🦀', '.java': '☕', '.json': '📋', '.md': '📝', '.css': '🎨', '.scss': '🎨',
    '.html': '🌐', '.yml': '⚙️', '.yaml': '⚙️', '.sql': '🗃️', '.sh': '💻', '.env': '🔒',
    '.c': '⚙️', '.cpp': '⚙️', '.h': '⚙️', '.svg': '🖼️', '.png': '🖼️', '.jpg': '🖼️',
    '.pdf': '📄', '.zip': '📦', '.tar': '📦', '.gz': '📦', '.exe': '⚙️', '.lock': '🔒',
  }
  return icons[ext] || '📄'
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + 'M'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + 'K'
  return bytes + 'B'
}

function getGitTrackedFiles(): Set<string> {
  try {
    const output = execSync('git ls-files 2>/dev/null', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    return new Set(output.split('\n').filter(Boolean).map(f => f.replace(/\\/g, '/')))
  } catch { return new Set() }
}

function generateTree(dir: string, config: TreeConfig, prefix = '', depth = 0, gitTracked?: Set<string>): string[] {
  if (depth >= config.maxDepth) return []
  const lines: string[] = []
  try {
    let entries = readdirSync(dir, { withFileTypes: true })
      .filter(e => !config.excludePatterns.includes(e.name))
      .filter(e => !e.name.startsWith('.') || config.showHidden)
    if (config.gitTrackedOnly && gitTracked) {
      entries = entries.filter(e => {
        const rel = join(dir, e.name).replace(/\\/g, '/').replace(/^\.\//, '')
        return gitTracked.has(rel) || (e.isDirectory() && readdirSync(join(dir, e.name)).some(c => gitTracked.has(join(dir, e.name, c).replace(/\\/g, '/').replace(/^\.\//, ''))))
      })
    }
    if (config.sortBySize) {
      entries = entries.sort((a, b) => {
        try {
          const sa = a.isDirectory() ? dirSize(join(dir, a.name)) : statSync(join(dir, a.name)).size
          const sb = b.isDirectory() ? dirSize(join(dir, b.name)) : statSync(join(dir, b.name)).size
          return sb - sa
        } catch { return 0 }
      })
    } else {
      entries = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const isLast = i === entries.length - 1
      const connector = config.useUnicode ? (isLast ? '└── ' : '├── ') : (isLast ? '`-- ' : '|-- ')
      const childPrefix = config.useUnicode ? (isLast ? '    ' : '│   ') : (isLast ? '    ' : '|   ')
      const fp = join(dir, entry.name)
      let sizeStr = ''
      if (config.showSizes && !entry.isDirectory()) {
        try { sizeStr = ' ' + formatSize(statSync(fp).size) } catch { /* ignore */ }
      } else if (config.showSizes && entry.isDirectory()) {
        try { sizeStr = ' ' + formatSize(dirSize(fp)) } catch { /* ignore */ }
      }
      if (entry.isDirectory()) {
        const icon = config.showIcons ? '📁 ' : ''
        lines.push(prefix + connector + icon + entry.name + '/')
        lines.push(...generateTree(fp, config, prefix + childPrefix, depth + 1, gitTracked))
      } else if (config.showFiles) {
        const icon = config.showIcons ? getFileIcon(entry.name) + ' ' : ''
        lines.push(prefix + connector + icon + entry.name + sizeStr)
      }
    }
  } catch { /* ignore */ }
  return lines
}

function dirSize(dir: string): number {
  let size = 0
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fp = join(dir, entry.name)
      if (entry.isDirectory()) size += dirSize(fp)
      else { try { size += statSync(fp).size } catch { /* ignore */ } }
    }
  } catch { /* ignore */ }
  return size
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Directory Tree (Advanced)', '', '📖 Usage: ', '  /tree [path]                    Show tree', '  /tree depth <N>                  Set max depth', '  /tree sizes                      Show file sizes', '  /tree no-icons                   Hide icons', '  /tree files-only                Files only', '  /tree dirs-only                 Directories only', '  /tree hidden                    Include hidden files', '  /tree git                       Git tracked only', '  /tree sort-size                 Sort by size', '  /tree export <file>             Export to file', '  /tree config                    Show config', ''].join('\n') }

  if (cmd === 'config') {
    return { type: 'text', value: JSON.stringify(config, null, 2) }
  }

  if (cmd === 'depth') {
    const n = parseInt(parts[1])
    if (isNaN(n)) return { type: 'text', value: 'Usage: /tree depth <N>' }
    config.maxDepth = n
    saveConfig(config)
    return { type: 'text', value: `[OK] Max depth: ${n}` }
  }

  const options: TreeConfig = { ...config }
  if (parts.includes('sizes')) options.showSizes = true
  if (parts.includes('no-icons')) options.showIcons = false
  if (parts.includes('files-only')) options.showFiles = true
  if (parts.includes('dirs-only')) options.showFiles = false
  if (parts.includes('hidden')) options.showHidden = true
  if (parts.includes('git')) options.gitTrackedOnly = true
  if (parts.includes('sort-size')) options.sortBySize = true

  const target = parts.find(p => !['help', 'depth', 'sizes', 'no-icons', 'files-only', 'dirs-only', 'hidden', 'git', 'sort-size', 'export', 'config'].includes(p) && p !== cmd) || '.'
  if (!existsSync(target)) return { type: 'text', value: 'Path not found: ' + target }

  const gitTracked = options.gitTrackedOnly ? getGitTrackedFiles() : undefined
  const lines = generateTree(target, options, '', 0, gitTracked)

  if (cmd === 'export') {
    const file = parts[1] || 'tree.txt'
    const content = basename(target) + '/\n' + lines.join('\n')
    writeFileSync(file, content, 'utf-8')
    return { type: 'text', value: `[OK] Exported: ${file}` }
  }

  const header = basename(target) + '/'
  const footer = lines.length > 0 ? '' : '(empty)'
  return { type: 'text', value: header + '\n' + lines.join('\n') + (footer ? '\n' + footer : '') }
}

const tree: Command = {
  type: 'local', name: 'tree',
  description: 'Tree - depth/sizes/icons/files/dirs/hidden/git/sort-size/export/config',
  aliases: ['/tree', '/t'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default tree
