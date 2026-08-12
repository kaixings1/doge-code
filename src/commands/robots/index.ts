import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'robots')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

interface RobotsConfig {
  baseUrl: string
  sitemapUrl: string
  crawlDelay: number
  allowAll: boolean
  customRules: string[]
}

interface RobotsTemplate {
  name: string
  description: string
  generate: (config: RobotsConfig) => string
}

const DEFAULT_CONFIG: RobotsConfig = {
  baseUrl: 'https://example.com',
  sitemapUrl: '',
  crawlDelay: 1,
  allowAll: false,
  customRules: [],
}

const TEMPLATES: RobotsTemplate[] = [
  {
    name: 'default', description: 'Standard - allow all, block private paths',
    generate: (c) => ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /admin/', 'Disallow: /private/', 'Disallow: /tmp/', '', `Crawl-delay: ${c.crawlDelay}`, c.sitemapUrl ? '' : '', c.sitemapUrl ? 'Sitemap: ' + c.sitemapUrl : ''].filter(l => l !== '').join('\n'),
  },
  {
    name: 'strict', description: 'Block all crawlers',
    generate: () => 'User-agent: *\nDisallow: /',
  },
  {
    name: 'permissive', description: 'Allow all with minimal rules',
    generate: (c) => ['User-agent: *', 'Allow: /', '', `Crawl-delay: ${c.crawlDelay}`, c.sitemapUrl ? 'Sitemap: ' + c.sitemapUrl : ''].filter(l => l !== '').join('\n'),
  },
  {
    name: 'ecommerce', description: 'E-commerce - block cart/checkout/account',
    generate: (c) => ['User-agent: *', 'Allow: /', 'Disallow: /cart/', 'Disallow: /checkout/', 'Disallow: /account/', 'Disallow: /api/', 'Disallow: /admin/', 'Disallow: /search?', 'Disallow: /*?sort=', 'Disallow: /*?filter=', '', 'User-agent: GPTBot', 'Disallow: /', '', c.sitemapUrl ? 'Sitemap: ' + c.sitemapUrl : ''].filter(l => l !== '').join('\n'),
  },
  {
    name: 'blog', description: 'Blog - block wp-admin/includes',
    generate: (c) => ['User-agent: *', 'Allow: /', 'Disallow: /wp-admin/', 'Disallow: /wp-includes/', 'Disallow: /trackback/', 'Disallow: /comments/', 'Disallow: /author/', 'Disallow: /tag/', 'Disallow: /category/?', '', 'User-agent: Googlebot', 'Allow: /', '', 'User-agent: Bingbot', 'Allow: /', '', c.sitemapUrl ? 'Sitemap: ' + c.sitemapUrl : ''].filter(l => l !== '').join('\n'),
  },
  {
    name: 'app', description: 'Mobile app - block non-app crawlers',
    generate: (c) => ['User-agent: *', 'Disallow: /', '', 'User-agent: Googlebot', 'Allow: /', '', 'User-agent: bingbot', 'Allow: /', '', 'User-agent: Applebot', 'Allow: /', '', c.sitemapUrl ? 'Sitemap: ' + c.sitemapUrl : ''].filter(l => l !== '').join('\n'),
  },
]

function loadConfig(): RobotsConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: RobotsConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['🤖 robots.txt 管理器（高级）', '', '📖 用法：', '  /robots <模板>              生成（默认/严格/宽松/电商/博客/应用）', '  /robots list                列出模板', '  /robots view                查看当前 robots.txt', '  /robots custom <规则>       添加自定义规则', '  /robots set-url <url>       设置基础 URL', '  /robots set-sitemap <url>   设置站点地图 URL', '  /robots set-delay <秒数>    设置爬取延迟', '  /robots config              查看配置', '  /robots validate            验证提示', ''].join('\n') }

  if (cmd === 'list') {
    const lines = ['📋 可用模板：', '══════════', '']
    TEMPLATES.forEach(t => lines.push(`  ${t.name}: ${t.description}`))
    lines.push('', '💡 使用：/robots <模板名>')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'view') {
    if (!existsSync('robots.txt')) return { type: 'text', value: 'ℹ️ 未找到 robots.txt。使用 /robots <模板> 生成' }
    return { type: 'text', value: 'Current robots.txt:\n═══════════════════\n' + readFileSync('robots.txt', 'utf-8') }
  }

  if (cmd === 'set-url') {
    const url = parts[1]
    if (!url) return { type: 'text', value: '📖 用法：/robots set-url <url>' }
    config.baseUrl = url
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] Base URL: ${url}` }
  }

  if (cmd === 'set-sitemap') {
    const url = parts[1]
    if (!url) return { type: 'text', value: '📖 用法：/robots set-sitemap <url>' }
    config.sitemapUrl = url
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] Sitemap: ${url}` }
  }

  if (cmd === 'set-delay') {
    const n = parseInt(parts[1])
    if (isNaN(n) || n < 0) return { type: 'text', value: '📖 用法：/robots set-delay <秒数>' }
    config.crawlDelay = n
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] Crawl delay: ${n}s` }
  }

  if (cmd === 'custom') {
    const rules = parts.slice(1).join(' ')
    if (!rules) return { type: 'text', value: '📖 用法：/robots custom <规则行>' }
    config.customRules.push(rules)
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] Custom rule added: ${rules}` }
  }

  if (cmd === 'config') {
    return { type: 'text', value: JSON.stringify(config, null, 2) }
  }

  if (cmd === 'validate') {
    return { type: 'text', value: ['✅ 验证提示：', '════════════', '', '1. Google Search Console: https://search.google.com/search-console/robots-testing-tool', '2. TechnicalSEO: https://technicalseo.com/tools/robots-txt/', '3. 要求：', '   - 必须放在域名根目录：/robots.txt', '   - 最大 500 KB（Google）', '   - 每个 user-agent 最多 50 条爬取规则', '   - Sitemap 使用绝对 URL', '', '当前状态：' + (existsSync('robots.txt') ? 'robots.txt 已存在' : 'robots.txt 不存在')].join('\n') }
  }

  if (cmd === 'view' || cmd === '') return { type: 'text', value: 'robots.txt ' + (existsSync('robots.txt') ? 'exists' : 'missing') }

  const template = TEMPLATES.find(t => t.name === cmd)
  if (!template) return { type: 'text', value: `❌ 未知模板：${cmd}\n可用模板：${TEMPLATES.map(t => t.name).join(', ')}` }

  // Generate
  let content = template.generate(config)
  if (config.customRules.length > 0) {
    content += '\n\n# Custom rules\n' + config.customRules.join('\n')
  }
  writeFileSync('robots.txt', content, 'utf-8')
  return { type: 'text', value: `✅ [OK] Generated robots.txt (${template.name})\n\n${content}` }
}

const robots: Command = {
  type: 'local', name: 'robots',
  description: 'Robots.txt - default/strict/permissive/ecommerce/blog/app/list/view/custom',
  aliases: ['/robots', '/robots-txt'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default robots
