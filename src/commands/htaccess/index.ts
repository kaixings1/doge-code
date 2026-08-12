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
    name: 'security', description: 'Security headers + protect sensitive files',
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
    name: 'spa', description: 'SPA routing (React/Vue/Angular)',
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
    name: 'caching', description: 'Browser caching by file type',
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
    name: 'compression', description: 'gzip/brotli compression',
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
    name: 'redirect', description: 'Domain redirects',
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
    name: 'performance', description: 'ETags, connection keep-alive, server push',
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
    name: 'api', description: 'REST API - CORS, JSON, OPTIONS',
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
    name: 'maintenance', description: 'Maintenance mode with IP whitelist',
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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['htaccess Manager (Advanced)', '', '📖 Usage: ', '  /htaccess <module> [modules...]  Generate (combine multiple)', '  /htaccess list                   List modules', '  /htaccess view                   View current .htaccess', '  /htaccess backup                 Backup current', '  /htaccess restore <file>        Restore backup', '  /htaccess config                Show config', '  /htaccess set-domain <domain>   Set domain', '  /htaccess https <on|off>        Toggle HTTPS redirect', '  /htaccess www <none|to-www|to-non-www>  WWW redirect', '  /htaccess gzip <on|off>         Toggle gzip', '  /htaccess custom <rules>        Add custom rules', '', 'Modules: ' + MODULES.map(m => m.name).join(', '), ''].join('\n') }

  if (cmd === 'list') {
    const lines = ['Modules:', '════════', '']
    MODULES.forEach(m => lines.push(`  ${m.name}: ${m.description}`))
    lines.push('', 'Usage: /htaccess security caching compression')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'view') {
    if (!existsSync('.htaccess')) return { type: 'text', value: 'No .htaccess found. Generate with /htaccess <module>' }
    return { type: 'text', value: 'Current .htaccess:\n═══════════════════\n' + readFileSync('.htaccess', 'utf-8') }
  }

  if (cmd === 'backup') {
    const path = backupExisting()
    return path ? `[OK] Backed up: ${path}` : 'No .htaccess to backup'
  }

  if (cmd === 'restore') {
    const file = parts[1]
    if (!file || !existsSync(join(BACKUP_DIR, file))) return { type: 'text', value: 'Usage: /htaccess restore <backup-file>' }
    copyFileSync(join(BACKUP_DIR, file), '.htaccess')
    return { type: 'text', value: `✅ [OK] Restored: ${file}` }
  }

  if (cmd === 'config') return { type: 'text', value: JSON.stringify(config, null, 2) }

  if (cmd === 'set-domain') {
    const domain = parts[1]
    if (!domain) return { type: 'text', value: 'Usage: /htaccess set-domain <domain>' }
    config.domain = domain
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] Domain: ${domain}` }
  }

  if (cmd === 'https') {
    const val = parts[1]
    if (!['on', 'off'].includes(val)) return { type: 'text', value: 'Usage: /htaccess https on|off' }
    config.https = val === 'on'
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] HTTPS redirect: ${val}` }
  }

  if (cmd === 'www') {
    const val = parts[1]
    if (!['none', 'to-www', 'to-non-www'].includes(val)) return { type: 'text', value: 'Usage: /htaccess www none|to-www|to-non-www' }
    config.wwwRedirect = val as HtaccessConfig['wwwRedirect']
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] WWW redirect: ${val}` }
  }

  if (cmd === 'gzip') {
    const val = parts[1]
    if (!['on', 'off'].includes(val)) return { type: 'text', value: 'Usage: /htaccess gzip on|off' }
    config.gzip = val === 'on'
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] Gzip: ${val}` }
  }

  if (cmd === 'custom') {
    const rules = parts.slice(1).join(' ')
    if (!rules) return { type: 'text', value: 'Usage: /htaccess custom <apache rules>' }
    config.customRules.push(rules)
    saveConfig(config)
    return { type: 'text', value: `✅ [OK] Custom rule added` }
  }

  // Generate from modules
  const moduleNames = parts.filter(p => p !== cmd)
  if (moduleNames.length === 0) return { type: 'text', value: 'Usage: /htaccess <module> [more modules]\nModules: ' + MODULES.map(m => m.name).join(', ') }

  const selected = moduleNames.map(n => MODULES.find(m => m.name === n)).filter(Boolean) as Module[]
  if (selected.length === 0) return { type: 'text', value: `❌ Unknown modules: ${moduleNames.join(', ')}\nAvailable: ${MODULES.map(m => m.name).join(', ')}` }

  const backup = backupExisting()
  const header = ['# Generated by doge-code htaccess', '# Date: ' + new Date().toISOString(), '# Modules: ' + selected.map(m => m.name).join(', '), '# ⚠️ DO NOT EDIT THIS SECTION', '']
  const content = [...header, ...selected.map(m => m.generate(config)), ...(config.customRules.length ? ['# Custom Rules', ...config.customRules] : [])].join('\n\n')

  writeFileSync('.htaccess', content, 'utf-8')
  return { type: 'text', value: `✅ [OK] Generated .htaccess\nModules: ${selected.map(m => m.name).join(', ')}\nBackup: ${backup || '(none existed)'}\n\n${content.slice(0, 800)}...` }
}

const htaccess: Command = {
  type: 'local', name: 'htaccess',
  description: 'htaccess - security/spa/caching/compression/redirect/performance/api/maintenance',
  aliases: ['/htaccess', '/hta'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default htaccess
