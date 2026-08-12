import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir } from 'os'
import { gzipSync } from 'zlib'

const CONFIG_DIR = join(homedir(), '.doge', 'bundle')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const HISTORY_FILE = join(CONFIG_DIR, 'history.json')

interface BundleFile {
  path: string
  size: number
  gzipSize: number
  brotliSize: number
  type: 'js' | 'css' | 'html' | 'map' | 'other'
}

interface BundleConfig {
  dirs: string[]
  excludePatterns: string[]
  analyzeMaps: boolean
  minFileSize: number
  warnSize: number
  criticalSize: number
}

interface BundleRecord {
  date: string
  totalSize: number
  gzipSize: number
  fileCount: number
  largest: string
  grade: string
}

const DEFAULT_CONFIG: BundleConfig = {
  dirs: ['dist', 'build', 'out', 'public'],
  excludePatterns: ['*.map', '*.LICENSE.txt', '.DS_Store'],
  analyzeMaps: true,
  minFileSize: 1024,
  warnSize: 200 * 1024,
  criticalSize: 500 * 1024,
}

function loadConfig(): BundleConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: BundleConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function loadHistory(): BundleRecord[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHistory(record: BundleRecord) {
  const history = loadHistory()
  history.push(record)
  if (history.length > 50) history.splice(0, history.length - 50)
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8') } catch { /* ignore */ }
}

function collectBundleFiles(config: BundleConfig): BundleFile[] {
  const files: BundleFile[] = []
  config.dirs.forEach(dir => {
    if (!existsSync(dir)) return
    const scan = (d: string) => {
      try {
        for (const entry of readdirSync(d, { withFileTypes: true })) {
          const fp = join(d, entry.name)
          if (entry.isDirectory()) scan(fp)
          else if (entry.isFile()) {
            if (config.excludePatterns.some(p => entry.name.includes(p.replace('*', '')))) continue
            try {
              const buf = readFileSync(fp)
              if (buf.length < config.minFileSize) continue
              const ext = extname(entry.name).toLowerCase()
              const type: BundleFile['type'] = ext === '.js' || ext === '.mjs' || ext === '.cjs' ? 'js' : ext === '.css' ? 'css' : ext === '.html' ? 'html' : ext === '.map' ? 'map' : 'other'
              files.push({ path: fp, size: buf.length, gzipSize: gzipSync(buf).length, brotliSize: 0, type })
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }
    scan(dir)
  })
  return files.sort((a, b) => b.size - a.size)
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

function gradeBundle(totalSize: number): string {
  if (totalSize < 100 * 1024) return 'A'
  if (totalSize < 500 * 1024) return 'B'
  if (totalSize < 1024 * 1024) return 'C'
  if (totalSize < 2 * 1024 * 1024) return 'D'
  return 'F'
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📦 Bundle 分析器 (高级)', '', '📖 用法: ', '  /bundle                        分析打包文件', '  /bundle size                   体积明细', '  /bundle largest [N]            最大文件', '  /bundle types                  按类型统计', '  /bundle history                打包体积历史', '  /bundle trend                  体积趋势', '  /bundle optimize               优化建议', '  /bundle analyze                深度分析含 source map', '  /bundle config                 查看/编辑配置', '  /bundle set <key> <val>        设置配置项', '  /bundle export [file]          导出分析结果', ''].join('\n') }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知配置项: ${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: '📖 用法: /bundle set <配置项> <值>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知配置项: ${key}。可用配置项: ${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: '⚠️ 暂无打包历史记录，请先执行 /bundle 进行分析。' }
    const lines = ['📊 打包历史记录:', '═══════════════', '']
    history.slice(-10).forEach(h => lines.push(`${h.date.slice(0, 19)} | ${h.grade} | ${formatSize(h.totalSize)} (${formatSize(h.gzipSize)} gzip) | ${h.fileCount} files`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'trend') {
    const history = loadHistory()
    if (history.length < 2) return { type: 'text', value: '⚠️ 趋势分析至少需要 2 次分析记录。' }
    const lines = ['📈 打包体积趋势:', '══════════════════', '']
    history.slice(-14).forEach(h => {
      const bar = '█'.repeat(Math.min(Math.round(h.totalSize / 50 / 1024), 40))
      lines.push(`${h.date.slice(0, 10)} ${bar} ${formatSize(h.totalSize)}`)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  const files = collectBundleFiles(config)

  if (cmd === 'size' || cmd === '') {
    if (files.length === 0) return { type: 'text', value: '❌ 未找到打包产物，请先执行构建（npm run build）。已检查目录: ' + config.dirs.join(', ') }
    const totalSize = files.reduce((s, f) => s + f.size, 0)
    const gzipTotal = files.reduce((s, f) => s + f.gzipSize, 0)
    const jsTotal = files.filter(f => f.type === 'js').reduce((s, f) => s + f.size, 0)
    const cssTotal = files.filter(f => f.type === 'css').reduce((s, f) => s + f.size, 0)
    const grade = gradeBundle(jsTotal)
    saveHistory({ date: new Date().toISOString(), totalSize, gzipSize: gzipTotal, fileCount: files.length, largest: files[0]?.path || '', grade })
    const lines = [
      '📊 打包分析:', '═════════════════', '',
      `📈 评分: ${grade}`,
      `📦 总体积: ${formatSize(totalSize)} (gzip: ${formatSize(gzipTotal)})`,
      `📝 JS: ${formatSize(jsTotal)} | CSS: ${formatSize(cssTotal)}`,
      `📁 文件数: ${files.length}`,
      '',
      '🔝 最大文件:',
    ]
    files.slice(0, 15).forEach((f, i) => {
      const bar = '█'.repeat(Math.min(Math.round((f.size / (files[0]?.size || 1)) * 30), 30))
      lines.push(`  ${i + 1}. ${bar} ${formatSize(f.size)} (${formatSize(f.gzipSize)} gzip) ${f.path}`)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'largest') {
    const n = parseInt(parts[1]) || 20
    if (files.length === 0) return { type: 'text', value: '❌ 未找到打包产物' }
    const lines = ['🔝 最大文件 (共 ' + Math.min(n, files.length) + ' 个):', '══════════════════════', '']
    files.slice(0, n).forEach((f, i) => {
      const flag = f.size > config.criticalSize ? ' 🔴' : f.size > config.warnSize ? ' 🟠' : ''
      lines.push(`  ${i + 1}. ${formatSize(f.size).padEnd(9)} ${f.type}${flag} ${f.path}`)
    })
    lines.push('', `⚠️ 警告阈值: >${formatSize(config.warnSize)}  危险阈值: >${formatSize(config.criticalSize)}`)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'types') {
    if (files.length === 0) return { type: 'text', value: '❌ 未找到打包产物' }
    const byType: Record<string, { size: number; gzip: number; count: number }> = {}
    files.forEach(f => {
      if (!byType[f.type]) byType[f.type] = { size: 0, gzip: 0, count: 0 }
      byType[f.type].size += f.size
      byType[f.type].gzip += f.gzipSize
      byType[f.type].count++
    })
    const lines = ['📊 按类型统计:', '═══════════════', '']
    for (const [type, data] of Object.entries(byType).sort((a: any, b: any) => b[1].size - a[1].size)) {
      const pct = Math.round((data.size / files.reduce((s, f) => s + f.size, 0)) * 100)
      lines.push(`  ${type}: ${formatSize(data.size)} (${formatSize(data.gzip)} gzip) - ${data.count} files - ${pct}%`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'optimize') {
    const jsTotal = files.filter(f => f.type === 'js').reduce((s, f) => s + f.size, 0)
    const lines = ['💡 优化建议:', '══════════════════', '', `📦 当前 JS 打包体积: ${formatSize(jsTotal)}`, '']
    const tips: Array<[string, string]> = [
      ['代码分割', '按路由或厂商拆分大块代码，使用动态 import()'],
      ['Tree Shaking', '使用 ES6 导入，在 package.json 中设置 sideEffects: false'],
      ['压缩', '启用 gzip（节省约 70%）或 brotli（节省约 80%）'],
      ['图片优化', '转换为 WebP/AVIF，懒加载，使用响应式图片尺寸'],
      ['去重', '使用 /duplicate 检查重复依赖'],
      ['压缩混淆', '使用 terser/esbuild/swc 进行代码压缩'],
      ['缓存', '在文件名中添加内容哈希以实现长期缓存'],
      ['预加载', '预加载关键 CSS/字体，延迟非关键 JS'],
      ['PurgeCSS', '使用 PurgeCSS/Tailwind 移除未使用的 CSS'],
      ['Source Map', '仅在开发环境生成 source map'],
    ]
    tips.forEach(([title, desc]) => lines.push(`  • ${title}: ${desc}`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'analyze') {
    if (files.length === 0) return { type: 'text', value: '❌ 未找到打包产物' }
    try {
      const output = execSync('npx source-map-explorer ' + files.filter(f => f.type === 'js').slice(0, 5).map(f => `"${f.path}"`).join(' ') + ' 2>/dev/null || echo "请安装 source-map-explorer 进行深度分析"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 30000 })
      return { type: 'text', value: output.slice(0, 1500) }
    } catch { return { type: 'text', value: '🔍 深度分析: 请执行 npm install -D source-map-explorer' } }
  }

  if (cmd === 'export') {
    const file = parts[1] || 'bundle-report.json'
    writeFileSync(file, JSON.stringify(files, null, 2), 'utf-8')
    return { type: 'text', value: `✅ [OK] Exported: ${file}` }
  }

  return { type: 'text', value: '❌ 未知命令: ' + cmd }
}

const bundle: Command = {
  type: 'local', name: 'bundle',
  description: '📦 Bundle - 体积/最大文件/类型/分析/优化/历史/趋势/配置/导出',
  aliases: ['/bundle', '/bun'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default bundle
