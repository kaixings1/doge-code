import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'htaccess')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const BACKUP_DIR = join(CONFIG_DIR, 'backups')

interface HtaccessConfig {
  domain: string
  https: boolean
  wwwRedirect: 'none' | 'to-non-www' | 'to-www'
  cacheDuration: string
  gzip: boolean
  brotli: boolean
  http2: boolean
  customRules: string[]
}

interface Module {
  name: string
  description: string
  generate: (config: HtaccessConfig) => string
}

const DEFAULT_CONFIG: HtaccessConfig = {
  domain: '',
  https: true,
  wwwRedirect: 'none',
  cacheDuration: '1 month',
  gzip: true,
  brotli: false,
  http2: true,
  customRules: [],
}

const MODULES: Module[] = [
  {
    name: 'security', description: '安全头部 + 保护敏感文件',
    generate: (c) => `# Security Headers
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set X-XSS-Protection "1; mode=block"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
  Header set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  Header set Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
</IfModule>

# Disable directory listing
Options -Indexes

# Block access to sensitive files
<FilesMatch "^\\.(env|htaccess|htpasswd|git|gitignore|log|sql|bak|config)$">
  <IfModule mod_authz_core.c>
    Require all denied
  </IfModule>
</FilesMatch>

# Block dot files
RedirectMatch 404 /\\.(git|env|htaccess|ssh|idea|vscode)(/.*)?$`,
  },
  {
    name: 'spa', description: 'SPA 路由（React/Vue/Angular）',
    generate: (c) => `# SPA Routing
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

${c.https ? `# Redirect HTTP to HTTPS
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
` : ''}${c.wwwRedirect === 'to-non-www' ? `# Redirect www to non-www
RewriteCond %{HTTP_HOST} ^www\\.(.*)$ [NC]
RewriteRule ^(.*)$ https://%1/$1 [R=301,L]
` : c.wwwRedirect === 'to-www' ? `# Redirect non-www to www
RewriteCond %{HTTP_HOST} !^www\\. [NC]
RewriteRule ^(.*)$ https://www.%{HTTP_HOST}/$1 [R=301,L]
` : ''}# Serve existing files directly
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# Route everything else to index.html
RewriteRule ^ index.html [L]
</IfModule>`,
  },
  {
    name: 'caching', description: '按文件类型设置浏览器缓存',
    generate: (c) => `# Browser Caching
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpg "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/gif "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType text/css "access plus ${c.cacheDuration}"
  ExpiresByType application/javascript "access plus ${c.cacheDuration}"
  ExpiresByType application/pdf "access plus ${c.cacheDuration}"
  ExpiresByType application/json "access plus 0"
  ExpiresByType text/html "access plus 0"
</IfModule>

<IfModule mod_headers.c>
  <FilesMatch "\\.(ico|pdf|flv|jpg|jpeg|png|gif|webp|svg|js|css|woff2)$">
    Header set Cache-Control "max-age=2592000, public"
  </FilesMatch>
</IfModule>`,
  },
  {
    name: 'compression', description: 'gzip/brotli 压缩',
    generate: (c) => `${c.gzip ? `# Gzip Compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json application/xml image/svg+xml
  # Remove browser bugs
  BrowserMatch ^Mozilla/4 gzip-only-text/html
  BrowserMatch ^Mozilla/4\\.0[678] no-gzip
  BrowserMatch \\bMSIE !no-gzip !gzip-only-text/html
</IfModule>
` : ''}${c.brotli ? `# Brotli Compression
<IfModule mod_brotli.c>
  AddOutputFilterByType BROTLI_COMPRESS text/html text/plain text/css text/javascript application/javascript application/json image/svg+xml
</IfModule>
` : ''}# Serve correct content types
AddType application/javascript .js
AddType text/css .css`,
  },
  {
    name: 'redirect', description: '域名重定向',
    generate: (c) => `# Redirects
<IfModule mod_rewrite.c>
  RewriteEngine On

${c.https ? `# Force HTTPS
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
` : ''}${c.wwwRedirect === 'to-non-www' ? `# www to non-www
RewriteCond %{HTTP_HOST} ^www\\.(.*)$ [NC]
RewriteRule ^(.*)$ https://%1/$1 [R=301,L]
` : c.wwwRedirect === 'to-www' ? `# non-www to www
RewriteCond %{HTTP_HOST} !^www\\. [NC]
RewriteRule ^(.*)$ https://www.%{HTTP_HOST}/$1 [R=301,L]
` : ''}# Custom redirects (uncomment and edit)
# Redirect 301 /old-page.html /new-page.html
# RedirectMatch 301 ^/old/ /new/
</IfModule>`,
  },
  {
    name: 'performance', description: 'ETag、连接保持、服务器推送',
    generate: (c) => `# Performance
# Disable ETags (use Last-Modified + Cache-Control instead)
<IfModule mod_headers.c>
  Header unset ETag
  FileETag None
</IfModule>

# Keep-alive
<IfModule mod_keepalive.c>
  KeepAlive On
  MaxKeepAliveRequests 100
  KeepAliveTimeout 5
</IfModule>

# HTTP/2
${c.http2 ? `<IfModule mod_http2.c>
  Protocols h2 http/1.1
</IfModule>` : '# HTTP/2 disabled'}`,
  },
  {
    name: 'api', description: 'REST API - CORS、JSON、OPTIONS',
    generate: (c) => `# REST API
# CORS headers
<IfModule mod_headers.c>
  Header set Access-Control-Allow-Origin "*"
  Header set Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  Header set Access-Control-Allow-Headers "Content-Type, Authorization"
  Header set Access-Control-Max-Age "86400"
</IfModule>

# Handle OPTIONS preflight
RewriteEngine On
RewriteCond %{REQUEST_METHOD} OPTIONS
RewriteRule ^(.*)$ $1 [R=200,L]

# JSON content type
AddType application/json .json`,
  },
  {
    name: 'maintenance', description: '维护模式（带 IP 白名单）',
    generate: (c) => `# Maintenance Mode
RewriteEngine On
RewriteCond %{REQUEST_URI} !/maintenance\\.html$
RewriteCond %{REMOTE_ADDR} !^127\\.0\\.0\\.1$
RewriteCond %{REMOTE_ADDR} !^::1$
# Add your IP to whitelist: RewriteCond %{REMOTE_ADDR} !^123\\.456\\.789\\.000$
RewriteRule ^(.*)$ /maintenance.html [R=503,L]
ErrorDocument 503 /maintenance.html`,
  },
]

function loadConfig(): HtaccessConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: HtaccessConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function backupExisting() {
  try {
    if (!existsSync('.htaccess')) return null
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
    const backupPath = join(BACKUP_DIR, 'htaccess-' + Date.now() + '.bak')
    copyFileSync('.htaccess', backupPath)
    return backupPath
  } catch { return null }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['📁 htaccess 管理器（高级）', '', '📖 用法: ', '  /htaccess <模块> [多个模块...]  生成（可组合多个）', '  /htaccess list                   列出所有模块', '  /htaccess view                   查看当前 .htaccess', '  /htaccess backup                 备份当前配置', '  /htaccess restore <文件>         恢复备份', '  /htaccess config                 显示配置', '  /htaccess set-domain <域名>      设置域名', '  /htaccess https <on|off>         切换 HTTPS 重定向', '  /htaccess www <none|to-www|to-non-www>  WWW 重定向', '  /htaccess gzip <on|off>          切换 gzip 压缩', '  /htaccess custom <规则>          添加自定义规则', '', '可用模块: ' + MODULES.map(m => m.name).join(', '), ''].join('\n') }

  if (cmd === 'list') {
    const lines = ['📦 可用模块:', '════════', '']
    MODULES.forEach(m => lines.push(`  ${m.name}: ${m.description}`))
    lines.push('', '💡 用法：/htaccess security caching compression')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'view') {
    if (!existsSync('.htaccess')) return { type: 'text', value: 'ℹ️ 未找到 .htaccess。使用 /htaccess <模块> 生成' }
    return { type: 'text', value: '当前 .htaccess:\n═══════════════════\n' + readFileSync('.htaccess', 'utf-8') }
  }

  if (cmd === 'backup') {
    const path = backupExisting()
    return path ? `✅ [成功] 已备份: ${path}` : '没有可备份的 .htaccess 文件'
  }

  if (cmd === 'restore') {
    const file = parts[1]
    if (!file || !existsSync(join(BACKUP_DIR, file))) return { type: 'text', value: '用法: /htaccess restore <备份文件>' }
    copyFileSync(join(BACKUP_DIR, file), '.htaccess')
    return { type: 'text', value: `✅ [成功] 已恢复: ${file}` }
  }

  if (cmd === 'config') return { type: 'text', value: JSON.stringify(config, null, 2) }

  if (cmd === 'set-domain') {
    const domain = parts[1]
    if (!domain) return { type: 'text', value: '用法: /htaccess set-domain <域名>' }
    config.domain = domain
    saveConfig(config)
    return { type: 'text', value: `✅ [成功] 域名: ${domain}` }
  }

  if (cmd === 'https') {
    const val = parts[1]
    if (!['on', 'off'].includes(val)) return { type: 'text', value: '用法: /htaccess https on|off' }
    config.https = val === 'on'
    saveConfig(config)
    return { type: 'text', value: `✅ [成功] HTTPS 重定向: ${val}` }
  }

  if (cmd === 'www') {
    const val = parts[1]
    if (!['none', 'to-www', 'to-non-www'].includes(val)) return { type: 'text', value: '用法: /htaccess www none|to-www|to-non-www' }
    config.wwwRedirect = val as HtaccessConfig['wwwRedirect']
    saveConfig(config)
    return { type: 'text', value: `✅ [成功] WWW 重定向: ${val}` }
  }

  if (cmd === 'gzip') {
    const val = parts[1]
    if (!['on', 'off'].includes(val)) return { type: 'text', value: '用法: /htaccess gzip on|off' }
    config.gzip = val === 'on'
    saveConfig(config)
    return { type: 'text', value: `✅ [成功] Gzip 压缩: ${val}` }
  }

  if (cmd === 'custom') {
    const rules = parts.slice(1).join(' ')
    if (!rules) return { type: 'text', value: '用法: /htaccess custom <Apache 规则>' }
    config.customRules.push(rules)
    saveConfig(config)
    return { type: 'text', value: `✅ [成功] 已添加自定义规则` }
  }

  // Generate from modules
  const moduleNames = parts.filter(p => p !== cmd)
  if (moduleNames.length === 0) return { type: 'text', value: '用法: /htaccess <模块> [更多模块]\n可用模块: ' + MODULES.map(m => m.name).join(', ') }

  const selected = moduleNames.map(n => MODULES.find(m => m.name === n)).filter(Boolean) as Module[]
  if (selected.length === 0) return { type: 'text', value: `❌ 未知模块: ${moduleNames.join(', ')}\n可用模块: ${MODULES.map(m => m.name).join(', ')}` }

  const backup = backupExisting()
  const header = ['# Generated by doge-code htaccess', '# Date: ' + new Date().toISOString(), '# Modules: ' + selected.map(m => m.name).join(', '), '# ⚠️ DO NOT EDIT THIS SECTION', '']
  const content = [...header, ...selected.map(m => m.generate(config)), ...(config.customRules.length ? ['# Custom Rules', ...config.customRules] : [])].join('\n\n')

  writeFileSync('.htaccess', content, 'utf-8')
  return { type: 'text', value: `✅ [OK] Generated .htaccess\nModules: ${selected.map(m => m.name).join(', ')}\nBackup: ${backup || '(none existed)'}\n\n${content.slice(0, 800)}...` }
}

const htaccess: Command = {
  type: 'local', name: 'htaccess',
  description: 'htaccess 管理器 - 安全/SPA/缓存/压缩/重定向/性能/API/维护模式',
  aliases: ['/htaccess', '/hta'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default htaccess
