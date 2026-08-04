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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Sitemap Generator (Advanced)', '', 'Usage:', '  /sitemap                        Generate sitemap.xml', '  /sitemap scan                   Scan and list pages', '  /sitemap robots                 Generate robots.txt', '  /sitemap preview                Preview XML output', '  /sitemap validate               Validation tips', '  /sitemap submit                 Submit to search engines', '  /sitemap config                 Show/edit config', '  /sitemap set <key> <val>        Set config value', '  /sitemap base-url <url>         Set base URL', '  /sitemap freq <value>           Set change frequency', '  /sitemap priority <n>           Set priority (0-1)', ''].join('\n') }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown: ${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: 'Usage: /sitemap set <key> <value>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value === 'true' ? true : value === 'false' ? false : value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown key: ${key}. Keys: ${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'base-url') {
    const url = parts[1]
    if (!url) return { type: 'text', value: 'Usage: /sitemap base-url <url>' }
    config.baseUrl = url
    saveConfig(config)
    return { type: 'text', value: `[OK] Base URL: ${url}` }
  }

  if (cmd === 'freq') {
    const freq = parts[1] as SitemapConfig['changeFreq']
    const valid = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']
    if (!valid.includes(freq)) return { type: 'text', value: 'Valid: ' + valid.join(', ') }
    config.changeFreq = freq
    saveConfig(config)
    return { type: 'text', value: `[OK] Change frequency: ${freq}` }
  }

  if (cmd === 'priority') {
    const val = parseFloat(parts[1])
    if (isNaN(val) || val < 0 || val > 1) return { type: 'text', value: 'Priority must be between 0 and 1' }
    config.priority = val
    saveConfig(config)
    return { type: 'text', value: `[OK] Priority: ${val}` }
  }

  const pages = scanPages(config)

  if (cmd === 'scan') {
    if (pages.length === 0) return { type: 'text', value: 'No pages found. Check config extensions: ' + config.extensions.join(', ') }
    const lines = ['Pages Found (' + pages.length + '):', '═══════════════════', '']
    pages.slice(0, 30).forEach((p, i) => lines.push(`  ${i + 1}. ${config.baseUrl}${p.loc} (${p.lastmod || 'no date'})`))
    if (pages.length > 30) lines.push(`... ${pages.length - 30} more`)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'preview') {
    if (pages.length === 0) return { type: 'text', value: 'No pages found' }
    return { type: 'text', value: generateSitemapXml(pages, config.baseUrl).slice(0, 2000) + '\n\n...' }
  }

  if (cmd === 'robots') {
    const content = generateRobotsTxt(config.baseUrl)
    writeFileSync('robots.txt', content, 'utf-8')
    return { type: 'text', value: '[OK] Generated robots.txt\n\n' + content }
  }

  if (cmd === 'validate') return { type: 'text', value: ['Validation:', '════════════', '', '1. XML well-formed: https://validator.w3.org/feed/', '2. Google Search Console: https://search.google.com/search-console/sitemaps', '3. Sitemap limits:', '   - Max 50,000 URLs per sitemap', '   - Max 50 MB uncompressed', '   - URLs must be absolute', '', 'Current: ' + pages.length + ' URLs', 'Limit: ' + config.maxUrls].join('\n') }

  if (cmd === 'submit') return { type: 'text', value: ['Submit Sitemap:', '═══════════════', '', 'Google: https://search.google.com/search-console', '  → Sitemaps → Add: ' + config.baseUrl + '/sitemap.xml', '', 'Bing: https://www.bing.com/webmasters', '  → Sitemaps → Submit', '', 'Yandex: https://webmaster.yandex.com/', '  → Indexing → Sitemap files'].join('\n') }

  if (pages.length === 0) return { type: 'text', value: 'No pages found. Run /sitemap scan to debug.' }
  const xml = generateSitemapXml(pages, config.baseUrl)
  writeFileSync(config.outputFile, xml, 'utf-8')
  return { type: 'text', value: `[OK] Generated ${config.outputFile}\nPages: ${pages.length}\nBase URL: ${config.baseUrl}\nOutput: ${config.outputFile}\n\nVerify at: ${config.baseUrl}/sitemap.xml` }
}

const sitemap: Command = {
  type: 'local', name: 'sitemap',
  description: 'Sitemap - generate/scan/preview/robots/validate/submit/config/base-url',
  aliases: ['/sitemap', '/sm'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default sitemap
