import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'lighthouse')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const HISTORY_FILE = join(CONFIG_DIR, 'history.json')

interface LighthouseScore {
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
  pwa: number
}

interface AuditRecord {
  date: string
  url: string
  scores: LighthouseScore
  grade: string
  passed: boolean
}

interface AuditConfig {
  categories: string[]
  budgets: { performance: number; accessibility: number; bestPractices: number; seo: number; pwa: number }
  defaultUrl: string
  chromePort: number
  timeout: number
  saveReports: boolean
  failOnBudget: boolean
}

const DEFAULT_CONFIG: AuditConfig = {
  categories: ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'],
  budgets: { performance: 80, accessibility: 90, bestPractices: 90, seo: 90, pwa: 50 },
  defaultUrl: 'http://localhost:3000',
  chromePort: 9222,
  timeout: 60000,
  saveReports: true,
  failOnBudget: true,
}

function loadConfig(): AuditConfig {
  try { if (existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: AuditConfig) {
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8') } catch { /* ignore */ }
}

function loadHistory(): AuditRecord[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHistory(record: AuditRecord) {
  const history = loadHistory()
  history.push(record)
  if (history.length > 50) history.splice(0, history.length - 50)
  try { if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8') } catch { /* ignore */ }
}

function gradeScore(score: number): string {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 50 ? 'D' : 'F'
}

function parseScores(jsonOutput: string): LighthouseScore {
  try {
    const data = JSON.parse(jsonOutput)
    const categories = data.categories || {}
    const toPct = (cat: any) => cat ? Math.round((cat.score || 0) * 100) : 0
    return {
      performance: toPct(categories.performance),
      accessibility: toPct(categories.accessibility),
      bestPractices: toPct(categories['best-practices']),
      seo: toPct(categories.seo),
      pwa: toPct(categories.pwa),
    }
  } catch { return { performance: 0, accessibility: 0, bestPractices: 0, seo: 0, pwa: 0 } }
}

function runAudit(url: string, config: AuditConfig, format: 'json' | 'html' = 'json'): { ok: boolean; output: string } {
  try {
    const cats = config.categories.join(',')
    const output = execSync(`npx lighthouse "${url}" --only-categories=${cats} --output=${format} --chrome-flags="--headless --no-sandbox --disable-gpu" --port=${config.chromePort} 2>&1`, { encoding: 'utf-8', timeout: config.timeout, stdio: ['pipe', 'pipe', 'ignore'] })
    return { ok: true, output }
  } catch (e: any) { return { ok: false, output: e.message || 'Lighthouse failed' } }
}

function generateRecommendations(scores: LighthouseScore, config: AuditConfig): string[] {
  const recs: string[] = []
  if (scores.performance < 80) recs.push('Performance: Enable compression, lazy-load images, reduce main-thread work, use CDN')
  if (scores.performance < 50) recs.push('Performance (critical): Consider SSR/SSG, code splitting, preconnect to origins')
  if (scores.accessibility < 90) recs.push('Accessibility: Add aria-labels, fix color contrast, ensure keyboard navigation')
  if (scores.bestPractices < 90) recs.push('Best Practices: Check for console errors, use HTTPS, set CSP headers')
  if (scores.seo < 90) recs.push('SEO: Add meta descriptions, structured data, proper heading hierarchy, sitemap')
  if (scores.pwa < 50) recs.push('PWA: Add manifest.json, service worker, offline support')
  if (recs.length === 0) recs.push('Excellent! All categories meet or exceed targets.')
  return recs
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'
  const config = loadConfig()

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Lighthouse Auditor (Advanced)', '', '📖 📖 Usage: ', '  /lighthouse <url>                Audit URL', '  /lighthouse run [url]            Run audit (default localhost:3000)', '  /lighthouse report [url]         Generate HTML report', '  /lighthouse budget <cat> <n>     Set budget (e.g. perf 80)', '  /lighthouse budgets              Show current budgets', '  /lighthouse history              Audit history', '  /lighthouse trend                Score trends', '  /lighthouse compare <u1> <u2>    Compare two URLs', '  /lighthouse categories           Score categories', '  /lighthouse config               Show/edit config', '  /lighthouse set <key> <val>      Set config value', '  /lighthouse export [url]         Export results JSON', ''].join('\n') }

  if (cmd === 'categories') return { type: 'text', value: ['Lighthouse Categories:', '══════════════════════', '', 'Performance:    Load speed, render blocking, images, JS execution', 'Accessibility:  ARIA, contrast, labels, semantics, keyboard nav', 'Best Practices: HTTPS, HTTP/2, no errors, CSP, security', 'SEO:            Meta tags, mobile-friendliness, crawlable', 'PWA:            Service worker, manifest, offline, installable', '', 'Grades: A(90+) B(80+) C(70+) D(50+) F(<50)'].join('\n') }

  if (cmd === 'budgets') {
    const lines = ['Current Budgets:', '════════════════', '']
    for (const [cat, budget] of Object.entries(config.budgets)) lines.push(`  ${cat}: ${budget}`)
    lines.push('', 'Set with: /lighthouse budget <category> <score>', 'Fail on budget: ' + config.failOnBudget)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'budget') {
    const cat = parts[1]; const val = parseInt(parts[2])
    if (!cat || isNaN(val)) return { type: 'text', value: 'Usage: /lighthouse budget <category> <score>\nCategories: performance, accessibility, bestPractices, seo, pwa' }
    if (!(cat in config.budgets)) return { type: 'text', value: `Unknown category: ${cat}` }
    // @ts-expect-error dynamic
    config.budgets[cat] = val
    saveConfig(config)
    return { type: 'text', value: `[OK] ${cat} budget: ${val}` }
  }

  if (cmd === 'config') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: JSON.stringify(config, null, 2) }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown: ${key}` }
  }

  if (cmd === 'set') {
    const key = parts[1]; const value = parts.slice(2).join(' ')
    if (!key || !value) return { type: 'text', value: 'Usage: /lighthouse set <key> <value>' }
    // @ts-expect-error dynamic
    if (key in config) { config[key] = value; saveConfig(config); return { type: 'text', value: `[OK] ${key} = ${value}` } }
    return { type: 'text', value: `Unknown key: ${key}. Keys: ${Object.keys(config).join(', ')}` }
  }

  if (cmd === 'history') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'No audit history. Run /lighthouse <url> first.' }
    const lines = ['Audit History:', '══════════════', '']
    history.slice(-10).forEach(h => lines.push(`${h.date.slice(0, 19)} | ${h.url} | ${h.grade} | Perf:${h.scores.performance} Acc:${h.scores.accessibility} SEO:${h.scores.seo}`))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'trend') {
    const history = loadHistory()
    if (history.length < 2) return { type: 'text', value: 'Need at least 2 audits for trends' }
    const lines = ['Performance Trend:', '═════════════════', '']
    history.slice(-14).forEach(h => {
      const bar = '█'.repeat(Math.round(h.scores.performance / 5))
      lines.push(`${h.date.slice(0, 10)} ${bar} ${h.scores.performance}`)
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'compare') {
    const u1 = parts[1]; const u2 = parts[2]
    if (!u1 || !u2) return { type: 'text', value: 'Usage: /lighthouse compare <url1> <url2>' }
    const lines = ['Comparing URLs:', '═══════════════', '']
    const r1 = runAudit(u1, config)
    const r2 = runAudit(u2, config)
    const s1 = parseScores(r1.output)
    const s2 = parseScores(r2.output)
    lines.push(`${u1}: Perf ${s1.performance} Acc ${s1.accessibility} BP ${s1.bestPractices} SEO ${s1.seo}`)
    lines.push(`${u2}: Perf ${s2.performance} Acc ${s2.accessibility} BP ${s2.bestPractices} SEO ${s2.seo}`)
    lines.push('', 'Diff:')
    lines.push(`  Performance: ${s1.performance - s2.performance >= 0 ? '+' : ''}${s1.performance - s2.performance}`)
    lines.push(`  Accessibility: ${s1.accessibility - s2.accessibility >= 0 ? '+' : ''}${s1.accessibility - s2.accessibility}`)
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'report') {
    const url = parts[1] || config.defaultUrl
    const result = runAudit(url, config, 'html')
    if (!result.ok) return { type: 'text', value: '[ERROR] Audit failed: ' + result.output.slice(0, 200) }
    const match = result.output.match(/Output written to:\s*(.+)/i) || result.output.match(/(lighthouse[^"]*\.html)/i)
    return { type: 'text', value: match ? '[OK] Report: ' + match[1] : '[OK] HTML report generated' }
  }

  if (cmd === 'export') {
    const url = parts[1] || config.defaultUrl
    const result = runAudit(url, config, 'json')
    if (!result.ok) return { type: 'text', value: '[ERROR] Audit failed: ' + result.output.slice(0, 200) }
    const scores = parseScores(result.output)
    writeFileSync('lighthouse-results.json', JSON.stringify({ url, scores, date: new Date().toISOString() }, null, 2), 'utf-8')
    return { type: 'text', value: '[OK] Exported: lighthouse-results.json' }
  }

  const url = cmd === 'run' ? (parts[1] || config.defaultUrl) : cmd
  const result = runAudit(url, config)
  if (!result.ok) return { type: 'text', value: '[ERROR] Audit failed: ' + result.output.slice(0, 300) + '\n\nInstall: npm install -g lighthouse' }

  const scores = parseScores(result.output)
  const passed = scores.performance >= config.budgets.performance && scores.accessibility >= config.budgets.accessibility && scores.bestPractices >= config.budgets.bestPractices && scores.seo >= config.budgets.seo
  const overall = Math.round((scores.performance + scores.accessibility + scores.bestPractices + scores.seo) / 4)
  const grade = gradeScore(overall)

  saveHistory({ date: new Date().toISOString(), url, scores, grade, passed })

  const lines = [
    'Lighthouse Audit: ' + url,
    '══════════════════════════',
    '',
    `Overall: ${overall}/100 (${grade})`,
    '',
    'Scores:',
    `  ⚡ Performance:  ${scores.performance}/100 ${'█'.repeat(Math.round(scores.performance / 5))}${'░'.repeat(20 - Math.round(scores.performance / 5))}`,
    `  ♿ Accessibility: ${scores.accessibility}/100 ${'█'.repeat(Math.round(scores.accessibility / 5))}${'░'.repeat(20 - Math.round(scores.accessibility / 5))}`,
    `  🛡️  Best Practices: ${scores.bestPractices}/100 ${'█'.repeat(Math.round(scores.bestPractices / 5))}${'░'.repeat(20 - Math.round(scores.bestPractices / 5))}`,
    `  🔍 SEO:          ${scores.seo}/100 ${'█'.repeat(Math.round(scores.seo / 5))}${'░'.repeat(20 - Math.round(scores.seo / 5))}`,
    `  📱 PWA:          ${scores.pwa}/100`,
    '',
    `Result: ${passed ? '[PASS] Meets budgets' : '[FAIL] Below budgets'}${config.failOnBudget ? '' : ' (budget enforcement off)'}`,
    '',
    'Recommendations:',
  ]
  generateRecommendations(scores, config).forEach(r => lines.push('  • ' + r))
  return { type: 'text', value: lines.join('\n') }
}

const lighthouse: Command = {
  type: 'local', name: 'lighthouse',
  description: 'Lighthouse - run/report/compare/trend/history/budgets/export/categories',
  aliases: ['/lighthouse', '/lh'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default lighthouse
