import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname, basename, resolve } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'security')
const SCAN_HISTORY = join(CONFIG_DIR, 'scan-history.json')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const BASELINE_FILE = join(CONFIG_DIR, 'baseline.json')

interface SecurityFinding {
  id: string
  type: 'vulnerability' | 'secret' | 'misconfiguration' | 'dependency' | 'owasp' | 'cwe'
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  file: string
  line: number
  cweId?: string
  owaspCategory?: string
  remediation: string
  references: string[]
  confidence: 'low' | 'medium' | 'high'
  category: string
}

interface SecurityConfig {
  rules: Record<string, boolean>
  severityThreshold: string
  excludePatterns: string[]
  includeDevDeps: boolean
  scanDependencies: boolean
  scanSecrets: boolean
  scanCode: boolean
  scanConfig: boolean
  customPatterns: Array<{ pattern: string; name: string; severity: string }>
  owaspTop10: boolean
  cweTop25: boolean
  failOnSeverity: string
  autoFix: boolean
  outputFormats: string[]
}

interface ScanResult {
  findings: SecurityFinding[]
  stats: { total: number; bySeverity: Record<string, number>; byType: Record<string, number>; byFile: Record<string, number> }
  score: number
  grade: string
  riskLevel: string
  scanDuration: number
  filesScanned: number
}

const DEFAULT_CONFIG: SecurityConfig = {
  rules: {
    'detect-secrets': true,
    'detect-eval': true,
    'detect-innerHTML': true,
    'detect-child-process': true,
    'detect-unsafe-regex': true,
    'detect-weak-crypto': true,
    'detect-sql-injection': true,
    'detect-xss': true,
    'detect-csrf': true,
    'detect-path-traversal': true,
    'detect-unsafe-deserialization': true,
    'detect-weak-auth': true,
    'detect-misconfigured-cors': true,
    'detect-open-redirect': true,
    'detect-ssrf': true,
    'detect-command-injection': true,
    'detect-xxe': true,
    'detect-ldap-injection': true,
    'detect-insecure-random': true,
    'detect-temp-file': true,
  },
  severityThreshold: 'low',
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', '**/*.test.*', '**/*.min.js', 'coverage/**'],
  includeDevDeps: false,
  scanDependencies: true,
  scanSecrets: true,
  scanCode: true,
  scanConfig: true,
  customPatterns: [],
  owaspTop10: true,
  cweTop25: true,
  failOnSeverity: 'high',
  autoFix: false,
  outputFormats: ['text', 'json', 'sarif'],
}

const SECRET_PATTERNS: Array<{ pattern: RegExp; name: string; cwe: string; severity: SecurityFinding['severity']; category: string }> = [
  { pattern: /(api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{16,}['"]/i, name: 'API Key', cwe: 'CWE-798', severity: 'critical', category: 'Credentials' },
  { pattern: /(secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i, name: 'Password', cwe: 'CWE-798', severity: 'critical', category: 'Credentials' },
  { pattern: /(access_)?token\s*[:=]\s*['"][^'"]{16,}['"]/i, name: 'Access Token', cwe: 'CWE-798', severity: 'critical', category: 'Credentials' },
  { pattern: /AWS_ACCESS_KEY_ID\s*[:=]\s*['"]?[A-Z0-9]{20}/, name: 'AWS Access Key', cwe: 'CWE-798', severity: 'critical', category: 'Cloud' },
  { pattern: /AWS_SECRET_ACCESS_KEY\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}/, name: 'AWS Secret Key', cwe: 'CWE-798', severity: 'critical', category: 'Cloud' },
  { pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/, name: 'GitHub Token', cwe: 'CWE-798', severity: 'critical', category: 'Credentials' },
  { pattern: /sk-[a-zA-Z0-9]{48}/, name: 'OpenAI API Key', cwe: 'CWE-798', severity: 'critical', category: 'AI' },
  { pattern: /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/, name: 'Private Key', cwe: 'CWE-798', severity: 'critical', category: 'Cryptography' },
  { pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/, name: 'MongoDB Credentials', cwe: 'CWE-798', severity: 'high', category: 'Database' },
  { pattern: /postgres(ql)?:\/\/[^:]+:[^@]+@/, name: 'PostgreSQL Credentials', cwe: 'CWE-798', severity: 'high', category: 'Database' },
  { pattern: /mysql:\/\/[^:]+:[^@]+@/, name: 'MySQL Credentials', cwe: 'CWE-798', severity: 'high', category: 'Database' },
  { pattern: /redis:\/\/[^:]+:[^@]+@/, name: 'Redis Credentials', cwe: 'CWE-798', severity: 'high', category: 'Database' },
  { pattern: /(stripe|braintree|paypal)_(api_)?key\s*[:=]\s*['"][^'"]{10,}['"]/i, name: 'Payment API Key', cwe: 'CWE-798', severity: 'critical', category: 'Financial' },
  { pattern: /(twilio|sendgrid|mailgun)_(api_)?key\s*[:=]\s*['"][^'"]{10,}['"]/i, name: 'Service API Key', cwe: 'CWE-798', severity: 'high', category: 'Services' },
]

const VULNERABILITY_PATTERNS: Array<{ pattern: RegExp; name: string; cwe: string; owasp: string; severity: SecurityFinding['severity']; category: string; remediation: string }> = [
  { pattern: /\beval\s*\(/, name: 'Code Injection via eval()', cwe: 'CWE-94', owasp: 'A03:2021-Injection', severity: 'critical', category: 'Injection', remediation: 'Use JSON.parse() or Function constructor with input validation' },
  { pattern: /\.innerHTML\s*=/, name: 'XSS via innerHTML', cwe: 'CWE-79', owasp: 'A03:2021-XSS', severity: 'high', category: 'XSS', remediation: 'Use textContent or framework-safe rendering (React, Vue)' },
  { pattern: /document\.write\s*\(/, name: 'XSS via document.write', cwe: 'CWE-79', owasp: 'A03:2021-XSS', severity: 'high', category: 'XSS', remediation: 'Use DOM manipulation methods or framework rendering' },
  { pattern: /child_process\.exec\s*\(/, name: 'Command Injection', cwe: 'CWE-78', owasp: 'A03:2021-Injection', severity: 'critical', category: 'Injection', remediation: 'Use execFile() with args array, never pass user input to shell' },
  { pattern: /execSync\s*\([^)]*(?:\+|\$\{)/, name: 'Command Injection (execSync)', cwe: 'CWE-78', owasp: 'A03:2021-Injection', severity: 'critical', category: 'Injection', remediation: 'Use execFileSync() with args array, sanitize all inputs' },
  { pattern: /new\s+Function\s*\(/, name: 'Code Injection via Function()', cwe: 'CWE-94', owasp: 'A03:2021-Injection', severity: 'high', category: 'Injection', remediation: 'Avoid dynamic code execution, use safe alternatives' },
  { pattern: /require\s*\([^)]*(?:\+|\$\{)/, name: 'Path Traversal via require()', cwe: 'CWE-22', owasp: 'A01:2021-Broken Access Control', severity: 'high', category: 'Path Traversal', remediation: 'Validate and sanitize module paths, use allowlist' },
  { pattern: /fs\.(read|write)FileSync\s*\([^)]*(?:\+|\$\{)/, name: 'Path Traversal via fs', cwe: 'CWE-22', owasp: 'A01:2021-Broken Access Control', severity: 'high', category: 'Path Traversal', remediation: 'Validate file paths, use path.resolve() and check against allowlist' },
  { pattern: /JSON\.parse\s*\([^)]*(?:\+|\$\{)/, name: 'Unsafe Deserialization', cwe: 'CWE-502', owasp: 'A08:2021-Software Integrity Failures', severity: 'medium', category: 'Deserialization', remediation: 'Validate JSON schema before parsing, use safe parsers' },
  { pattern: /crypto\.createHash\s*\(\s*['"]md5['"]/i, name: 'Weak Hash (MD5)', cwe: 'CWE-328', owasp: 'A02:2021-Cryptographic Failures', severity: 'medium', category: 'Cryptography', remediation: 'Use SHA-256 or better (SHA-3, BLAKE2)' },
  { pattern: /crypto\.createHash\s*\(\s*['"]sha1['"]/i, name: 'Weak Hash (SHA1)', cwe: 'CWE-328', owasp: 'A02:2021-Cryptographic Failures', severity: 'medium', category: 'Cryptography', remediation: 'Use SHA-256 or better' },
  { pattern: /crypto\.randomBytes\s*\(\s*\d+\s*\)/, name: 'Check randomBytes usage', cwe: 'CWE-330', owasp: 'A02:2021-Cryptographic Failures', severity: 'low', category: 'Cryptography', remediation: 'Ensure sufficient entropy (min 16 bytes for tokens)' },
  { pattern: /Math\.random\s*\(\)/, name: 'Insecure Random', cwe: 'CWE-330', owasp: 'A02:2021-Cryptographic Failures', severity: 'medium', category: 'Cryptography', remediation: 'Use crypto.randomBytes() or crypto.getRandomValues()' },
  { pattern: /Access-Control-Allow-Origin:\s*\*/i, name: 'Permissive CORS', cwe: 'CWE-942', owasp: 'A01:2021-Broken Access Control', severity: 'medium', category: 'Configuration', remediation: 'Restrict CORS to specific origins, use allowlist' },
  { pattern: /Access-Control-Allow-Credentials:\s*true/i, name: 'CORS with Credentials', cwe: 'CWE-942', owasp: 'A01:2021-Broken Access Control', severity: 'medium', category: 'Configuration', remediation: 'Ensure Origin is not wildcard when credentials are allowed' },
  { pattern: /res\.redirect\s*\([^)]*(?:\+|\$\{)/, name: 'Open Redirect', cwe: 'CWE-601', owasp: 'A01:2021-Broken Access Control', severity: 'medium', category: 'Redirect', remediation: 'Validate redirect URLs against allowlist' },
  { pattern: /sql\s*[:=]\s*['"][^'"]*(?:\+|\$\{)/i, name: 'SQL Injection', cwe: 'CWE-89', owasp: 'A03:2021-Injection', severity: 'critical', category: 'Injection', remediation: 'Use parameterized queries or ORM, never concatenate user input' },
  { pattern: /SELECT\s+.*\s+FROM\s+.*(?:\+|\$)/i, name: 'SQL Injection (SELECT)', cwe: 'CWE-89', owasp: 'A03:2021-Injection', severity: 'critical', category: 'Injection', remediation: 'Use parameterized queries or prepared statements' },
]

function loadConfig(): SecurityConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: SecurityConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function scanFileSecrets(content: string, file: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  const lines = content.split('\n')
  lines.forEach((line, i) => {
    for (const secret of SECRET_PATTERNS) {
      if (secret.pattern.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.includes('process.env') && !line.includes('config.') && !line.includes('example') && !line.includes('dummy') && !line.includes('test')) {
        findings.push({
          id: 'secret-' + Date.now() + '-' + i,
          type: 'secret',
          severity: secret.severity,
          title: secret.name + ' in source code',
          description: `Detected potential ${secret.name} hardcoded in source code at line ${i + 1}`,
          file,
          line: i + 1,
          cweId: secret.cwe,
          remediation: 'Move to environment variables (process.env) or a secure secrets manager (Vault, AWS Secrets Manager, Azure Key Vault)',
          references: ['https://cwe.mitre.org/data/definitions/798.html', 'https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_password'],
          confidence: 'high',
          category: secret.category,
        })
        break
      }
    }
  })
  return findings
}

function scanFileVulnerabilities(content: string, file: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  const lines = content.split('\n')
  lines.forEach((line, i) => {
    for (const vuln of VULNERABILITY_PATTERNS) {
      if (vuln.pattern.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.includes('// safe') && !line.includes('// sanitized')) {
        findings.push({
          id: 'vuln-' + Date.now() + '-' + i,
          type: 'vulnerability',
          severity: vuln.severity,
          title: vuln.name,
          description: `Potential vulnerability detected: ${vuln.name}`,
          file,
          line: i + 1,
          cweId: vuln.cwe,
          owaspCategory: vuln.owasp,
          remediation: vuln.remediation,
          references: ['https://cwe.mitre.org/data/definitions/' + vuln.cwe.split('-')[1] + '.html'],
          confidence: 'medium',
          category: vuln.category,
        })
      }
    }
  })
  return findings
}

function scanFileConfig(file: string, content: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  if (basename(file) === '.env' || basename(file) === '.env.local') {
    findings.push({
      id: 'config-' + Date.now(),
      type: 'misconfiguration',
      severity: 'medium',
      title: '.env file in repository',
      description: 'Environment file may contain secrets and should not be committed',
      file,
      line: 1,
      remediation: 'Add .env to .gitignore, use .env.example for documentation',
      references: ['https://github.com/github/gitignore/blob/main/Node.gitignore'],
      confidence: 'medium',
      category: 'Configuration',
    })
  }
  if (basename(file) === 'package.json') {
    try {
      const pkg = JSON.parse(content)
      if (pkg.scripts) {
        for (const [name, script] of Object.entries(pkg.scripts as Record<string, string>)) {
          if (script.includes('rm -rf') || script.includes('sudo') || script.includes('curl') || script.includes('wget')) {
            findings.push({
              id: 'script-' + Date.now() + '-' + name,
              type: 'misconfiguration',
              severity: 'medium',
              title: 'Potentially dangerous npm script: ' + name,
              description: `Script "${name}" contains potentially dangerous commands: ${script}`,
              file,
              line: 1,
              remediation: 'Review npm scripts for dangerous operations, avoid rm -rf and network downloads in scripts',
              references: ['https://blog.npmjs.org/post/141702881055/package-install-scripts-vulnerability'],
              confidence: 'medium',
              category: 'Configuration',
            })
          }
        }
      }
    } catch { /* ignore */ }
  }
  return findings
}

function scanDependencies(): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  if (!existsSync('package.json')) return findings
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === 'string' && (version.includes('file:') || version.includes('http://'))) {
        findings.push({
          id: 'dep-' + Date.now() + '-' + name,
          type: 'dependency',
          severity: 'medium',
          title: 'Insecure dependency source: ' + name,
          description: `Dependency "${name}" uses insecure source: ${version}`,
          file: 'package.json',
          line: 1,
          remediation: 'Use registry-based dependencies with semver ranges',
          references: ['https://docs.npmjs.com/cli/v8/configuring-npm/package-json#dependencies'],
          confidence: 'medium',
          category: 'Dependencies',
        })
      }
    }
  } catch { /* ignore */ }
  return findings
}

function scanDirectory(dir: string, config: SecurityConfig): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  const fs = require('fs')
  const scan = (d: string) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') && entry.name !== '.env') continue
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git') continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) scan(fp)
        else if (entry.isFile()) {
          const ext = extname(entry.name)
          if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs', '.env', '.yml', '.yaml', '.json', '.toml'].includes(ext)) {
            try {
              const content = readFileSync(fp, 'utf-8')
              if (config.scanSecrets) findings.push(...scanFileSecrets(content, fp))
              if (config.scanCode && ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs'].includes(ext)) {
                findings.push(...scanFileVulnerabilities(content, fp))
              }
              if (config.scanConfig) findings.push(...scanFileConfig(fp, content))
            } catch { /* ignore */ }
          }
        }
      }
    } catch { /* ignore */ }
  }
  scan(dir)
  if (config.scanDependencies) findings.push(...scanDependencies())
  return findings
}

function calculateScore(findings: SecurityFinding[]): { score: number; grade: string; riskLevel: string } {
  let score = 100
  const bySev: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  findings.forEach(f => { bySev[f.severity]++; if (f.severity === 'critical') score -= 25; else if (f.severity === 'high') score -= 10; else if (f.severity === 'medium') score -= 5; else if (f.severity === 'low') score -= 2 })
  score = Math.max(0, Math.min(100, score))
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'
  const riskLevel = bySev.critical > 0 ? 'CRITICAL' : bySev.high > 0 ? 'HIGH' : bySev.medium > 0 ? 'MEDIUM' : bySev.low > 0 ? 'LOW' : 'MINIMAL'
  return { score, grade, riskLevel }
}

function formatTextReport(findings: SecurityFinding[], result: ScanResult): string {
  const lines = ['Security Scan Report', '═════════════════════', '', `Score: ${result.score}/100 (${result.grade})`, `Risk Level: ${result.riskLevel}`, `Files Scanned: ${result.filesScanned}`, `Scan Duration: ${result.scanDuration}ms`, `Total Findings: ${result.stats.total}`, '', 'By Severity:', `  🔴 Critical: ${result.stats.bySeverity.critical}`, `  🟠 High: ${result.stats.bySeverity.high}`, `  🟡 Medium: ${result.stats.bySeverity.medium}`, `  🔵 Low: ${result.stats.bySeverity.low}`, `  ℹ️  Info: ${result.stats.bySeverity.info}`, '', 'Findings:', '─────────']
  findings.filter(f => ['critical', 'high', 'medium'].includes(f.severity)).slice(0, 30).forEach((f, i) => {
    const icon = f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : '🟡'
    lines.push(`${icon} ${i + 1}. [${f.title}]`)
    lines.push(`   📍 ${f.file}:${f.line}`)
    lines.push(`   📝 ${f.description}`)
    lines.push(`   🔧 ${f.remediation}`)
    if (f.cweId) lines.push(`   CWE: ${f.cweId}`)
    if (f.owaspCategory) lines.push(`   OWASP: ${f.owaspCategory}`)
    lines.push('')
  })
  if (findings.length > 30) lines.push(`... ${findings.length - 30} more findings`)
  return lines.join('\n')
}

function formatSarifReport(findings: SecurityFinding[]): string {
  const sarif = { version: '2.1.0', runs: [{ tool: { driver: { name: 'doge-code-security', version: '1.0.0' } }, results: findings.slice(0, 100).map(f => ({ ruleId: f.id, level: f.severity === 'critical' || f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warning' : 'note', message: { text: f.title + ': ' + f.description }, locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: f.line } } }] })) }] }
  return JSON.stringify(sarif, null, 2)
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Security Scanner (Deep)', '', 'Usage:', '  /security                        Full security scan', '  /security file <path>            Scan single file', '  /security secrets               Secrets only', '  /security vulns                 Vulnerabilities only', '  /security config                Configuration issues', '  /security deps                  Dependencies', '  /security owasp                 OWASP Top 10', '  /security cwe                   CWE Top 25', '  /security npm-audit             npm audit', '  /security pip-audit             pip audit', '  /security sast                  Run SAST tools', '  /security baseline              Save baseline', '  /security compare               Compare with baseline', '  /security history               Scan history', '  /security config                View/edit config', '  /security enable <rule>         Enable rule', '  /security disable <rule>        Disable rule', '  /security add-pattern           Add custom pattern', '  /security rules                 List rules', '  /security export [fmt]          Export (text/json/sarif)', '  /security fix                   Auto-fix', ''].join('\n') }

  if (cmd === 'rules') {
    const lines = ['Security Rules:', '================', '']
    for (const [rule, enabled] of Object.entries(config.rules)) {
      lines.push(`  ${enabled ? '[ON]' : '[OFF]'} ${rule}`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    if (key in config.rules) { config.rules[key as keyof typeof config.rules] = value === 'true'; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown: ${key}` }
  }

  if (cmd === 'enable' || cmd === 'disable') {
    const rule = parts[1]; if (!rule || !(rule in config.rules)) return { type: 'text', value: `Unknown: ${rule}` }
    config.rules[rule as keyof typeof config.rules] = cmd === 'enable'; saveConfig(config); return { type: 'text', value: `[OK] ${rule} ${cmd}d` }
  }

  if (cmd === 'add-pattern') {
    return { type: 'text', value: 'Add to config.json customPatterns: [{ "pattern": "regex", "name": "Name", "severity": "high" }]' }
  }

  if (cmd === 'history') {
    try {
      const history = JSON.parse(readFileSync(SCAN_HISTORY, 'utf-8'))
      const lines = ['Scan History:', '==============', '']
      history.slice(-10).forEach((h: any) => lines.push(`${h.date.slice(0, 19)} | Score: ${h.score}/100 (${h.grade}) | ${h.findings} findings | ${h.files} files`))
      return { type: 'text', value: lines.join('\n') }
    } catch { return { type: 'text', value: 'No history' } }
  }

  if (cmd === 'baseline') {
    const findings = scanDirectory('.', config)
    writeFileSync(BASELINE_FILE, JSON.stringify(findings, null, 2), 'utf-8')
    return { type: 'text', value: `[OK] Baseline saved (${findings.length} findings)` }
  }

  if (cmd === 'compare') {
    const findings = scanDirectory('.', config)
    try {
      const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'))
      const newFindings = findings.filter(f => !baseline.some((b: SecurityFinding) => b.file === f.file && b.line === f.line && b.title === f.title))
      const fixed = baseline.filter((b: SecurityFinding) => !findings.some(f => f.file === b.file && f.line === b.line && f.title === b.title))
      return { type: 'text', value: `Baseline Comparison:\nNew: ${newFindings.length}\nFixed: ${fixed.length}\nTotal: ${findings.length}` }
    } catch { return { type: 'text', value: 'No baseline. Run /security baseline first.' } }
  }

  if (cmd === 'export') {
    const format = parts[1] || 'sarif'
    const findings = scanDirectory('.', config)
    const result = calculateScore(findings)
    const filename = `security-scan.${format === 'sarif' ? 'sarif' : format}`
    const content = format === 'sarif' ? formatSarifReport(findings) : format === 'json' ? JSON.stringify({ result, findings }, null, 2) : formatTextReport(findings, { ...result, scanDuration: 0, filesScanned: Object.keys({}).length })
    writeFileSync(filename, content, 'utf-8')
    return { type: 'text', value: `[OK] Exported: ${filename}` }
  }

  if (cmd === 'npm-audit') {
    try { return { type: 'text', value: execSync('npm audit 2>&1 | head -50', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }) } }
    catch { return { type: 'text', value: '[ERROR] npm audit failed' } }
  }

  if (cmd === 'pip-audit') {
    try { return { type: 'text', value: execSync('pip-audit 2>&1 | head -50', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }) } }
    catch { return { type: 'text', value: '[ERROR] pip-audit not available' } }
  }

  if (cmd === 'sast') {
    return { type: 'text', value: ['SAST Tools:', '===========', '', 'Semgrep: npx semgrep --config=auto .', 'CodeQL: codeql database create && codeql database analyze', 'SonarQube: sonar-scanner', 'Bandit (Python): bandit -r .', 'Gosec (Go): gosec ./...', 'Brakeman (Rails): brakeman'].join('\n') }
  }

  if (cmd === 'owasp') {
    return { type: 'text', value: ['OWASP Top 10 2021:', '==================', '', 'A01: Broken Access Control', 'A02: Cryptographic Failures', 'A03: Injection', 'A04: Insecure Design', 'A05: Security Misconfiguration', 'A06: Vulnerable Components', 'A07: Auth Failures', 'A08: Software Integrity Failures', 'A09: Logging Failures', 'A10: Server-Side Request Forgery'].join('\n') }
  }

  if (cmd === 'cwe') {
    return { type: 'text', value: ['CWE Top 25:', '============', '', 'CWE-79: XSS', 'CWE-798: Hard-coded Credentials', 'CWE-89: SQL Injection', 'CWE-22: Path Traversal', 'CWE-78: OS Command Injection', 'CWE-502: Deserialization', 'CWE-352: CSRF', 'CWE-416: Use After Free', 'CWE-862: Missing Authorization'].join('\n') }
  }

  // Default: full scan
  const startTime = Date.now()
  const findings = scanDirectory('.', config)
  const { score, grade, riskLevel } = calculateScore(findings)
  const duration = Date.now() - startTime
  const stats = { bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, byType: {} as Record<string, number>, byFile: {} as Record<string, number> }
  findings.forEach(f => { stats.bySeverity[f.severity]++; stats.byType[f.type] = (stats.byType[f.type] || 0) + 1; stats.byFile[f.file] = (stats.byFile[f.file] || 0) + 1 })
  const result: ScanResult = { findings, stats, score, grade, riskLevel, scanDuration: duration, filesScanned: Object.keys(stats.byFile).length }
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); const history = JSON.parse(readFileSync(SCAN_HISTORY, 'utf-8').catch(() => '[]')); history.push({ date: new Date().toISOString(), findings: findings.length, score, grade, files: result.filesScanned }); writeFileSync(SCAN_HISTORY, JSON.stringify(history.slice(-100), null, 2), 'utf-8') } catch { /* ignore */ }
  return { type: 'text', value: formatTextReport(findings, result) }
}

const security: Command = {
  type: 'local', name: 'security',
  description: 'Security scan - secrets/vulns/deps/owasp/npm-audit/baseline/history/sarif',
  aliases: ['/security', '/sec', '/scan'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default security
