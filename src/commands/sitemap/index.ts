import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'sitemap')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

interface SitemapConfig {
  baseUrl: string
  scanDirs: string[]
  extensions: string[]
  excludePatterns: string[]
  changeFreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority: number
  includeLastMod: boolean
  includeImages: boolean
  outputFile: string
  maxUrls: number
}

interface SitemapUrl {
  loc: string
  lastmod?: string
  changefreq: string
  priority: number
}

const DEFAULT_CONFIG: SitemapConfig = {
  baseUrl: 'https://example.com',
  scanDirs: ['.'],
  extensions: ['.html', '.tsx', '.jsx', '.php', '.md', '.vue'],
  excludePatterns: ['node_modules', 'dist', 'build', '.git', 'coverage', '_', '[', 'components/', 'node_modules/'],
  changeFreq: 'weekly',
  priority: 0.8,
  includeLastMod: true,
  includeImages: false,
  outputFile: 'sitemap.xml',
  maxUrls: 50000,
}

function loadConfig(): SitemapConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: SitemapConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function scanPages(config: SitemapConfig): SitemapUrl[] {
  const pages: SitemapUrl[] = []
  const fs = require('fs')
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (config.excludePatterns.includes(entry.name) || entry.name.startsWith('.')) continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile() && config.extensions.includes(extname(entry.name))) {
          const rel = fp.replace(/\\/g, '/').replace(/^\.\//, '')
          // Convert file to URL path
          const urlPath = rel
            .replace(/^index\.(html|php)$/, '')
            .replace(/\.(html|php|tsx|jsx|vue|md)$/, '')
            .replace(/\\/g, '/')
          if (urlPath.includes('_') || urlPath.includes('[') || urlPath.includes('components')) return
          let lastmod: string | undefined
          if (config.includeLastMod) {
            try { lastmod = new Date(statSync(fp).mtime).toISOString().split('T')[0] } catch { /* ignore */ }
          }
          pages.push({ loc: urlPath || '/', lastmod, changefreq: config.changeFreq, priority: urlPath === '/' ? 1 : config.priority })
        }
      }
    } catch { /* ignore */ }
  }
  config.scanDirs.forEach(d => { if (existsSync(d)) scan(d) })
  return pages.slice(0, config.maxUrls)
}

function generateSitemapXml(pages: SitemapUrl[], baseUrl: string): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
  pages.forEach(p => {
    lines.push('  <url>')
    lines.push('    <loc>' + baseUrl.replace(/\/$/, '') + p.loc + '</loc>')
    if (p.lastmod) lines.push('    <lastmod>' + p.lastmod + '</lastmod>')
    lines.push('    <changefreq>' + p.changefreq + '</changefreq>')
    lines.push('    <priority>' + p.priority.toFixed(1) + '</priority>')
    lines.push('  </url>')
  })
  lines.push('</urlset>')
  return lines.join('\n')
}

function generateRobotsTxt(baseUrl: string): string {
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /admin/', '', 'Sitemap: ' + baseUrl.replace(/\/$/, '') + '/sitemap.xml', ''].join('\n')
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['🗺️ 站点地图生成器（高级）', '', '📖 用法：', '  /sitemap                        生成 sitemap.xml', '  /sitemap scan                   扫描并列出页面', '  /sitemap robots                 生成 robots.txt', '  /sitemap preview                预览 XML 输出', '  /sitemap validate               验证提示', '  /sitemap submit                 提交到搜索引擎', '  /sitemap config                 显示/编辑配置', '  /sitemap set <key> <val>        设置配置值', '  /sitemap base-url <url>         设置基础 URL', '  /sitemap freq <value>           设置更新频率', '  /sitemap priority <n>           设置优先级（0-1）', ''].join('\n') }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知：${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: '📖 用法：/sitemap set <key> <value>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value === 'true' ? true : value === 'false' ? false : value; saveConfig(config); return { type: 'text', value: `✅ [OK] ${key} = ${value}` } }
    return { type: 'text', value: `❌ 未知键：${key}。可用键：${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'base-url') {
    const url = parts[1]
    if (!url) return { type: 'text', value: '📖 用法：/sitemap base-url <url>' }
    config.baseUrl = url
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] 基础 URL：${url}` }
  }

  if (cmd === 'freq') {
    const freq = parts[1] as SitemapConfig['changeFreq']
    const valid = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']
    if (!valid.includes(freq)) return { type: 'text', value: '有效值：' + valid.join(', ') }
    config.changeFreq = freq
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] 更新频率：${freq}` }
  }

  if (cmd === 'priority') {
    const val = parseFloat(parts[1])
    if (isNaN(val) || val < 0 || val > 1) return { type: 'text', value: '优先级必须在 0 到 1 之间' }
    config.priority = val
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] 优先级：${val}` }
  }

  const pages = scanPages(config)

  if (cmd === 'scan') {
    if (pages.length === 0) return { type: 'text', value: '未找到页面。检查配置扩展名：' + config.extensions.join(', ') }
    const lines = ['找到页面（' + pages.length + '）：', '═══════════════════', '']
    pages.slice(0, 30).forEach((p, i) => lines.push(`  ${i + 1}. ${config.baseUrl}${p.loc} (${p.lastmod || '无日期'})`))
    if (pages.length > 30) lines.push(`... 还有 ${pages.length - 30} 个`)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'preview') {
    if (pages.length === 0) return { type: 'text', value: '未找到页面' }
    return { type: 'text', value: generateSitemapXml(pages, config.baseUrl).slice(0, 2000) + '\n\n...' }
  }

  if (cmd === 'robots') {
    const content = generateRobotsTxt(config.baseUrl)
    writeFileSync('robots.txt', content, 'utf-8')
    return { type: 'text', value: '✅ 已生成 robots.txt\n\n' + content }
  }

  if (cmd === 'validate') return { type: 'text', value: ['🔍 验证：', '════════════', '', '1. XML 格式正确：https://validator.w3.org/feed/', '2. Google Search Console：https://search.google.com/search-console/sitemaps', '3. 站点地图限制：', '   - 每个 sitemap 最多 50,000 个 URL', '   - 未压缩最大 50 MB', '   - URL 必须是绝对路径', '', '当前：' + pages.length + ' 个 URL', '限制：' + config.maxUrls].join('\n') }

  if (cmd === 'submit') return { type: 'text', value: ['📤 提交站点地图：', '═══════════════', '', 'Google：https://search.google.com/search-console', '  → Sitemaps → 添加：' + config.baseUrl + '/sitemap.xml', '', 'Bing：https://www.bing.com/webmasters', '  → Sitemaps → 提交', '', 'Yandex：https://webmaster.yandex.com/', '  → Indexing → Sitemap files'].join('\n') }

  if (pages.length === 0) return { type: 'text', value: '未找到页面。运行 /sitemap scan 进行调试。' }
  const xml = generateSitemapXml(pages, config.baseUrl)
  writeFileSync(config.outputFile, xml, 'utf-8')
  return { type: 'text', value: `✅ [OK] Generated ${config.outputFile}\nPages: ${pages.length}\nBase URL: ${config.baseUrl}\nOutput: ${config.outputFile}\n\nVerify at: ${config.baseUrl}/sitemap.xml` }
}

const sitemap: Command = {
  type: 'local', name: 'sitemap',
  description: 'Sitemap - generate/scan/preview/robots/validate/submit/config/base-url',
  aliases: ['/sitemap', '/sm'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default sitemap
