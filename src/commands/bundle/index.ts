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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Bundle Analyzer (Advanced)', '', 'Usage:', '  /bundle                        Analyze bundle', '  /bundle size                   Size breakdown', '  /bundle largest [N]            Largest files', '  /bundle types                  Breakdown by type', '  /bundle history                Bundle size history', '  /bundle trend                  Size trends', '  /bundle optimize               Optimization tips', '  /bundle analyze               Deep analysis with source maps', '  /bundle config                 Show/edit config', '  /bundle set <key> <val>        Set config value', '  /bundle export [file]          Export analysis', ''].join('\n') }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown: ${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: 'Usage: /bundle set <key> <value>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown key: ${key}. Keys: ${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'No bundle history. Run /bundle first.' }
    const lines = ['Bundle History:', '═══════════════', '']
    history.slice(-10).forEach(h => lines.push(`${h.date.slice(0, 19)} | ${h.grade} | ${formatSize(h.totalSize)} (${formatSize(h.gzipSize)} gzip) | ${h.fileCount} files`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'trend') {
    const history = loadHistory()
    if (history.length < 2) return { type: 'text', value: 'Need at least 2 analyses for trends' }
    const lines = ['Bundle Size Trend:', '══════════════════', '']
    history.slice(-14).forEach(h => {
      const bar = '█'.repeat(Math.min(Math.round(h.totalSize / 50 / 1024), 40))
      lines.push(`${h.date.slice(0, 10)} ${bar} ${formatSize(h.totalSize)}`)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  const files = collectBundleFiles(config)

  if (cmd === 'size' || cmd === '') {
    if (files.length === 0) return { type: 'text', value: 'No bundle found. Build first (npm run build), dirs checked: ' + config.dirs.join(', ') }
    const totalSize = files.reduce((s, f) => s + f.size, 0)
    const gzipTotal = files.reduce((s, f) => s + f.gzipSize, 0)
    const jsTotal = files.filter(f => f.type === 'js').reduce((s, f) => s + f.size, 0)
    const cssTotal = files.filter(f => f.type === 'css').reduce((s, f) => s + f.size, 0)
    const grade = gradeBundle(jsTotal)
    saveHistory({ date: new Date().toISOString(), totalSize, gzipSize: gzipTotal, fileCount: files.length, largest: files[0]?.path || '', grade })
    const lines = [
      'Bundle Analysis:', '═════════════════', '',
      `Grade: ${grade}`,
      `Total: ${formatSize(totalSize)} (${formatSize(gzipTotal)} gzip)`,
      `JS: ${formatSize(jsTotal)} | CSS: ${formatSize(cssTotal)}`,
      `Files: ${files.length}`,
      '',
      'Largest Files:',
    ]
    files.slice(0, 15).forEach((f, i) => {
      const bar = '█'.repeat(Math.min(Math.round((f.size / (files[0]?.size || 1)) * 30), 30))
      lines.push(`  ${i + 1}. ${bar} ${formatSize(f.size)} (${formatSize(f.gzipSize)} gzip) ${f.path}`)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'largest') {
    const n = parseInt(parts[1]) || 20
    if (files.length === 0) return { type: 'text', value: 'No bundle found' }
    const lines = ['Largest Files (' + Math.min(n, files.length) + '):', '══════════════════════', '']
    files.slice(0, n).forEach((f, i) => {
      const flag = f.size > config.criticalSize ? ' 🔴' : f.size > config.warnSize ? ' 🟠' : ''
      lines.push(`  ${i + 1}. ${formatSize(f.size).padEnd(9)} ${f.type}${flag} ${f.path}`)
    })
    lines.push('', `Warn: >${formatSize(config.warnSize)}  Critical: >${formatSize(config.criticalSize)}`)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'types') {
    if (files.length === 0) return { type: 'text', value: 'No bundle found' }
    const byType: Record<string, { size: number; gzip: number; count: number }> = {}
    files.forEach(f => {
      if (!byType[f.type]) byType[f.type] = { size: 0, gzip: 0, count: 0 }
      byType[f.type].size += f.size
      byType[f.type].gzip += f.gzipSize
      byType[f.type].count++
    })
    const lines = ['Bundle by Type:', '═══════════════', '']
    for (const [type, data] of Object.entries(byType).sort((a: any, b: any) => b[1].size - a[1].size)) {
      const pct = Math.round((data.size / files.reduce((s, f) => s + f.size, 0)) * 100)
      lines.push(`  ${type}: ${formatSize(data.size)} (${formatSize(data.gzip)} gzip) - ${data.count} files - ${pct}%`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'optimize') {
    const jsTotal = files.filter(f => f.type === 'js').reduce((s, f) => s + f.size, 0)
    const lines = ['Optimization Tips:', '══════════════════', '', `Current JS bundle: ${formatSize(jsTotal)}`, '']
    const tips: Array<[string, string]> = [
      ['Code splitting', 'Split large chunks by route or vendor. Use dynamic import()'],
      ['Tree shaking', 'Use ES6 imports, set sideEffects: false in package.json'],
      ['Compression', 'Enable gzip (saves ~70%) or brotli (saves ~80%)'],
      ['Image optimization', 'Convert to WebP/AVIF, lazy load, use responsive sizes'],
      ['Remove duplicates', 'Check for duplicate dependencies with /duplicate'],
      ['Minify', 'Use terser/esbuild/swc for minification'],
      ['Caching', 'Add content hash to filenames for long-term caching'],
      ['Preload', 'Preload critical CSS/fonts, defer non-critical JS'],
      ['PurgeCSS', 'Remove unused CSS with PurgeCSS/Tailwind'],
      ['Source maps', 'Generate source maps only in development'],
    ]
    tips.forEach(([title, desc]) => lines.push(`  • ${title}: ${desc}`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'analyze') {
    if (files.length === 0) return { type: 'text', value: 'No bundle found' }
    try {
      const output = execSync('npx source-map-explorer ' + files.filter(f => f.type === 'js').slice(0, 5).map(f => `"${f.path}"`).join(' ') + ' 2>/dev/null || echo "Install source-map-explorer for deep analysis"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 30000 })
      return { type: 'text', value: output.slice(0, 1500) }
    } catch { return { type: 'text', value: 'Deep analysis: npm install -D source-map-explorer' } }
  }

  if (cmd === 'export') {
    const file = parts[1] || 'bundle-report.json'
    writeFileSync(file, JSON.stringify(files, null, 2), 'utf-8')
    return { type: 'text', value: `[OK] Exported: ${file}` }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const bundle: Command = {
  type: 'local', name: 'bundle',
  description: 'Bundle - size/largest/types/analyze/optimize/history/trend/config/export',
  aliases: ['/bundle', '/bun'],
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default bundle
