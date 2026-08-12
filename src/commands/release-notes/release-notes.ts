// ============================================================================
// Release Notes Command - Enhanced Version
// 发布说明：提交解析/分类/模板/版本对比/贡献者统计/自动生成/导出
// ============================================================================

import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

// ============================================================================
// Types & Interfaces
// ============================================================================

interface Commit {
  hash: string
  shortHash: string
  author: string
  email: string
  date: string
  subject: string
  body: string
  type: string
  scope: string
  breaking: boolean
  references: string[]
}

interface CategorizedCommits {
  feat: Commit[]
  fix: Commit[]
  docs: Commit[]
  style: Commit[]
  refactor: Commit[]
  perf: Commit[]
  test: Commit[]
  chore: Commit[]
  ci: Commit[]
  build: Commit[]
  revert: Commit[]
  other: Commit[]
}

interface ReleaseNotesConfig {
  version: string
  date: string
  categories: string[]
  template: string
  includeAuthors: boolean
  includeRefs: boolean
  groupByScope: boolean
  showBreakingChanges: boolean
  showContributors: boolean
  showStats: boolean
}

interface ContributorStats {
  name: string
  email: string
  commits: number
  additions: number
  deletions: number
  firstCommit: string
  lastCommit: string
}

interface VersionInfo {
  version: string
  date: string
  commits: Commit[]
  changes: CategorizedCommits
  contributors: ContributorStats[]
  stats: {
    totalCommits: number
    totalAdditions: number
    totalDeletions: number
    filesChanged: number
  }
}

interface ComparisonResult {
  versionA: string
  versionB: string
  commits: Commit[]
  newFeatures: Commit[]
  bugFixes: Commit[]
  breakingChanges: Commit[]
  contributors: string[]
  filesChanged: string[]
}

interface ReleaseNotesHistory {
  version: string
  entries: Array<{
    timestamp: string
    version: string
    format: string
    commitCount: number
  }>
}

// ============================================================================
// Constants
// ============================================================================

const RELEASE_DIR = join(process.cwd(), '.doge', 'release-notes')
const HISTORY_FILE = join(RELEASE_DIR, 'history.json')
const CONFIG_FILE = join(RELEASE_DIR, 'config.json')
const TEMPLATES_DIR = join(RELEASE_DIR, 'templates')

const DEFAULT_CONFIG: ReleaseNotesConfig = {
  version: '',
  date: new Date().toISOString().slice(0, 10),
  categories: ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'ci', 'build'],
  template: 'default',
  includeAuthors: true,
  includeRefs: true,
  groupByScope: false,
  showBreakingChanges: true,
  showContributors: true,
  showStats: true,
}

const CATEGORY_LABELS: Record<string, string> = {
  feat: '✨ 新功能',
  fix: '🐛 修复',
  docs: '📝 文档',
  style: '💄 样式',
  refactor: '♻️ 重构',
  perf: '⚡ 性能',
  test: '✅ 测试',
  chore: '🔧 杂项',
  ci: '👷 CI',
  build: '📦 构建',
  revert: '⏪ 回退',
  other: '📋 其他',
}

const CATEGORY_EMOJI: Record<string, string> = {
  feat: '✨',
  fix: '🐛',
  docs: '📝',
  style: '💄',
  refactor: '♻️',
  perf: '⚡',
  test: '✅',
  chore: '🔧',
  ci: '👷',
  build: '📦',
  revert: '⏪',
  other: '📋',
}

// ============================================================================
// Git Helpers
// ============================================================================

function getCommits(since?: string, until?: string): string[] {
  let cmd = 'git log --format="%H|%h|%an|%ae|%ad|%s|%b%n---COMMIT_END---" --date=short'
  if (since) cmd += ` --since="${since}"`
  if (until) cmd += ` --until="${until}"`

  try {
    const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 15000 })
    return output.split('---COMMIT_END---').filter(c => c.trim())
  } catch {
    return []
  }
}

function getCommitsBetweenTags(tagA: string, tagB: string): string[] {
  try {
    const output = execSync(`git log ${tagA}..${tagB} --format="%H|%h|%an|%ae|%ad|%s|%b%n---COMMIT_END---" --date=short`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 15000 })
    return output.split('---COMMIT_END---').filter(c => c.trim())
  } catch {
    return []
  }
}

function getTags(): string[] {
  try {
    const output = execSync('git tag --sort=-version:refname', { encoding: 'utf-8', timeout: 5000 })
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function getLatestTag(): string {
  try {
    return execSync('git describe --tags --abbrev=0', { encoding: 'utf-8', timeout: 5000 }).trim()
  } catch {
    return ''
  }
}

function getTagDate(tag: string): string {
  try {
    return execSync(`git log -1 --format=%ai ${tag}`, { encoding: 'utf-8', timeout: 5000 }).trim().slice(0, 10)
  } catch {
    return ''
  }
}

function getFileChanges(from?: string, to?: string): string[] {
  let cmd = 'git diff --name-only'
  if (from && to) cmd += ` ${from} ${to}`
  else if (from) cmd += ` ${from}`

  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 10000 })
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function getLineStats(from?: string, to?: string): { additions: number; deletions: number } {
  let cmd = 'git diff --shortstat'
  if (from && to) cmd += ` ${from} ${to}`
  else if (from) cmd += ` ${from}`

  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 10000 })
    const addMatch = output.match(/(\d+) insertion/)
    const delMatch = output.match(/(\d+) deletion/)
    return {
      additions: addMatch ? parseInt(addMatch[1]) : 0,
      deletions: delMatch ? parseInt(delMatch[1]) : 0,
    }
  } catch {
    return { additions: 0, deletions: 0 }
  }
}

// ============================================================================
// Commit Parsing
// ============================================================================

function parseCommit(raw: string): Commit | null {
  const lines = raw.trim().split('\n')
  const firstLine = lines[0]
  const parts = firstLine.split('|')

  if (parts.length < 6) return null

  const subject = parts[5]
  const { type, scope, breaking, cleanSubject } = parseCommitSubject(subject)

  return {
    hash: parts[0],
    shortHash: parts[1],
    author: parts[2],
    email: parts[3],
    date: parts[4],
    subject: cleanSubject,
    body: lines.slice(1).join('\n').trim(),
    type,
    scope,
    breaking,
    references: extractReferences(subject + '\n' + lines.slice(1).join('\n')),
  }
}

function parseCommitSubject(subject: string): { type: string; scope: string; breaking: boolean; cleanSubject: string } {
  // Conventional Commits 解析
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/)

  if (match) {
    return {
      type: match[1],
      scope: match[2] || '',
      breaking: !!match[3],
      cleanSubject: match[4],
    }
  }

  return { type: 'other', scope: '', breaking: false, cleanSubject: subject }
}

function extractReferences(text: string): string[] {
  const refs: string[] = []
  const refPattern = /(?:closes?|fixes?|refs?|#)(\d+)/gi
  let match
  while ((match = refPattern.exec(text)) !== null) {
    refs.push(match[1])
  }
  return [...new Set(refs)]
}

function categorizeCommits(commits: Commit[]): CategorizedCommits {
  const categorized: CategorizedCommits = {
    feat: [], fix: [], docs: [], style: [], refactor: [],
    perf: [], test: [], chore: [], ci: [], build: [], revert: [], other: [],
  }

  for (const commit of commits) {
    if (categorized[commit.type as keyof CategorizedCommits]) {
      categorized[commit.type as keyof CategorizedCommits].push(commit)
    } else {
      categorized.other.push(commit)
    }
  }

  return categorized
}

// ============================================================================
// Contributor Statistics
// ============================================================================

function getContributorStats(commits: Commit[]): ContributorStats[] {
  const stats = new Map<string, ContributorStats>()

  for (const commit of commits) {
    const key = commit.email
    const existing = stats.get(key) || {
      name: commit.author,
      email: commit.email,
      commits: 0,
      additions: 0,
      deletions: 0,
      firstCommit: commit.date,
      lastCommit: commit.date,
    }

    existing.commits++
    existing.additions += 0 // 需要 git blame 获取
    existing.deletions += 0
    if (commit.date < existing.firstCommit) existing.firstCommit = commit.date
    if (commit.date > existing.lastCommit) existing.lastCommit = commit.date

    stats.set(key, existing)
  }

  return [...stats.values()].sort((a, b) => b.commits - a.commits)
}

// ============================================================================
// Release Notes Generation
// ============================================================================

function generateReleaseNotes(commits: Commit[], config: ReleaseNotesConfig): string {
  const categorized = categorizeCommits(commits)
  const contributors = getContributorStats(commits)
  const lines: string[] = []

  // Header
  lines.push(`# ${config.version || 'v?.?.?'} (${config.date})`)
  lines.push('')

  // Breaking changes
  if (config.showBreakingChanges) {
    const breaking = commits.filter(c => c.breaking)
    if (breaking.length > 0) {
      lines.push('## ⚠️ 重大变更')
      for (const commit of breaking) {
        lines.push(`- ${commit.subject} (${commit.shortHash})`)
      }
      lines.push('')
    }
  }

  // Categories
  for (const category of config.categories) {
    const catCommits = categorized[category as keyof CategorizedCommits]
    if (!catCommits || catCommits.length === 0) continue

    lines.push(`## ${CATEGORY_LABELS[category] || category}`)
    for (const commit of catCommits) {
      const scope = config.groupByScope && commit.scope ? `**${commit.scope}:** ` : ''
      const author = config.includeAuthors ? ` (@${commit.author})` : ''
      const ref = config.includeRefs && commit.references.length > 0 ? ` (#${commit.references.join(', #')})` : ''
      lines.push(`- ${scope}${commit.subject}${author}${ref}`)
    }
    lines.push('')
  }

  // Contributors
  if (config.showContributors && contributors.length > 0) {
    lines.push('## 👏 贡献者')
    for (const c of contributors.slice(0, 10)) {
      lines.push(`- ${c.name} (${c.commits} 次提交)`)
    }
    lines.push('')
  }

  // Stats
  if (config.showStats) {
    lines.push('## 📊 统计')
    lines.push(`- 总提交: ${commits.length}`)
    lines.push(`- 贡献者: ${contributors.length}`)
    for (const category of config.categories) {
      const catCommits = categorized[category as keyof CategorizedCommits]
      if (catCommits && catCommits.length > 0) {
        lines.push(`- ${CATEGORY_LABELS[category]}: ${catCommits.length}`)
      }
    }
  }

  return lines.join('\n')
}

function generateMarkdownRelease(commits: Commit[], config: ReleaseNotesConfig): string {
  return generateReleaseNotes(commits, config)
}

function generateHTMLRelease(commits: Commit[], config: ReleaseNotesConfig): string {
  const markdown = generateReleaseNotes(commits, config)
  const html = markdown
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/\n\n/g, '\n')

  return `<!DOCTYPE html>
<html><head><title>${config.version} Release Notes</title>
<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px}
h1{color:#333;border-bottom:2px solid #eee;padding-bottom:10px}
h2{color:#666;margin-top:30px}
li{margin:5px 0}</style></head><body>
${html}</body></html>`
}

function generateJSONRelease(commits: Commit[], config: ReleaseNotesConfig): string {
  const categorized = categorizeCommits(commits)
  const contributors = getContributorStats(commits)

  return JSON.stringify({
    version: config.version,
    date: config.date,
    commits: commits.map(c => ({
      hash: c.shortHash,
      type: c.type,
      scope: c.scope,
      subject: c.subject,
      author: c.author,
      date: c.date,
      breaking: c.breaking,
    })),
    categories: Object.fromEntries(
      Object.entries(categorized).filter(([_, v]) => v.length > 0)
    ),
    contributors,
  }, null, 2)
}

function generatePlainTextRelease(commits: Commit[], config: ReleaseNotesConfig): string {
  const categorized = categorizeCommits(commits)
  const lines: string[] = []

  lines.push(`${config.version || 'v?.?.?'} (${config.date})`)
  lines.push('='.repeat(40))

  for (const category of config.categories) {
    const catCommits = categorized[category as keyof CategorizedCommits]
    if (!catCommits || catCommits.length === 0) continue

    lines.push('')
    lines.push(CATEGORY_LABELS[category] || category)
    lines.push('-'.repeat(20))
    for (const commit of catCommits) {
      lines.push(`  - ${commit.subject}`)
    }
  }

  return lines.join('\n')
}

// ============================================================================
// Version Comparison
// ============================================================================

function compareVersions(tagA: string, tagB: string): ComparisonResult {
  const commits = getCommitsBetweenTags(tagA, tagB).map(parseCommit).filter(Boolean) as Commit[]
  const categorized = categorizeCommits(commits)
  const contributors = getContributorStats(commits)

  return {
    versionA: tagA,
    versionB: tagB,
    commits,
    newFeatures: categorized.feat,
    bugFixes: categorized.fix,
    breakingChanges: commits.filter(c => c.breaking),
    contributors: contributors.map(c => c.name),
    filesChanged: getFileChanges(tagA, tagB),
  }
}

function renderComparison(comp: ComparisonResult): string {
  const lines: string[] = []
  lines.push(`📊 ${comp.versionA} → ${comp.versionB} 对比`)
  lines.push('═'.repeat(50))
  lines.push('')
  lines.push(`总提交: ${comp.commits.length}`)
  lines.push(`新功能: ${comp.newFeatures.length}`)
  lines.push(`修复: ${comp.bugFixes.length}`)
  lines.push(`重大变更: ${comp.breakingChanges.length}`)
  lines.push(`贡献者: ${comp.contributors.length}`)
  lines.push(`变更文件: ${comp.filesChanged.length}`)

  if (comp.breakingChanges.length > 0) {
    lines.push('')
    lines.push('--- ⚠️ 重大变更 ---')
    for (const c of comp.breakingChanges) {
      lines.push(`  - ${c.subject} (${c.shortHash})`)
    }
  }

  if (comp.newFeatures.length > 0) {
    lines.push('')
    lines.push('--- ✨ 新功能 ---')
    for (const c of comp.newFeatures) {
      lines.push(`  - ${c.subject} (${c.shortHash})`)
    }
  }

  return lines.join('\n')
}

// ============================================================================
// Templates
// ============================================================================

function getTemplate(name: string): string {
  const templates: Record<string, string> = {
    default: '# {{version}} ({{date}})\n\n{{content}}\n',
    detailed: '# {{version}} ({{date}})\n\n## 概述\n{{summary}}\n\n## 变更内容\n{{content}}\n\n## 贡献者\n{{contributors}}\n\n## 统计\n{{stats}}\n',
    minimal: '# {{version}}\n{{content}}\n',
    enterprise: '# Release {{version}}\n**Date:** {{date}}\n\n## Executive Summary\n{{summary}}\n\n## New Features\n{{feat}}\n\n## Bug Fixes\n{{fix}}\n\n## Known Issues\n{{issues}}\n\n## Upgrade Notes\n{{breaking}}\n',
  }
  return templates[name] || templates.default
}

function renderTemplate(template: string, data: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return result
}

// ============================================================================
// History
// ============================================================================

function loadHistory(): ReleaseNotesHistory {
  try {
    if (existsSync(HISTORY_FILE)) {
      return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return { version: '1.0', entries: [] }
}

function saveHistory(history: ReleaseNotesHistory): void {
  try {
    mkdirSync(RELEASE_DIR, { recursive: true })
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

function addToHistory(version: string, format: string, commitCount: number): void {
  const history = loadHistory()
  history.entries.push({
    timestamp: new Date().toISOString(),
    version,
    format,
    commitCount,
  })
  saveHistory(history)
}

function renderHistory(): string {
  const history = loadHistory()
  if (history.entries.length === 0) return '📋 没有发布说明历史'

  const lines: string[] = [`📋 发布说明历史 (${history.entries.length} 条):`]
  for (const entry of history.entries.slice(-10).reverse()) {
    lines.push(`  ${entry.timestamp}: ${entry.version} (${entry.format}, ${entry.commitCount} commits)`)
  }
  return lines.join('\n')
}

// ============================================================================
// Export
// ============================================================================

function exportReleaseNotes(content: string, format: 'md' | 'html' | 'json' | 'txt', version: string): string {
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `release_${version || timestamp}`

  if (format === 'md') {
    const path = join(RELEASE_DIR, `${filename}.md`)
    writeFileSync(path, content, 'utf-8')
    return path
  }

  if (format === 'html') {
    const path = join(RELEASE_DIR, `${filename}.html`)
    writeFileSync(path, content, 'utf-8')
    return path
  }

  if (format === 'json') {
    const path = join(RELEASE_DIR, `${filename}.json`)
    writeFileSync(path, content, 'utf-8')
    return path
  }

  // txt
  const path = join(RELEASE_DIR, `${filename}.txt`)
  writeFileSync(path, content, 'utf-8')
  return path
}

// ============================================================================
// Help Text
// ============================================================================

// ============================================================================
// Release Notes Validation - 发布说明验证
// ============================================================================

function validateReleaseNotes(content: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  // Check for version header
  if (!content.match(/^#\s+v?\d+\.\d+\.\d+/m)) {
    warnings.push('缺少版本号标题 (例如: # v1.2.0)')
  }

  // Check for date
  if (!content.match(/\d{4}-\d{2}-\d{2}/)) {
    warnings.push('缺少发布日期')
  }

  // Check for empty categories
  const emptyCategoryPattern = /##.*\n\n##/g
  if (emptyCategoryPattern.test(content)) {
    warnings.push('存在空分类')
  }

  // Check for breaking changes format
  const breakingSection = content.match(/##.*[Bb]reak.*\n([\s\S]*?)(?=\n##|\n#|$)/i)
  if (breakingSection && breakingSection[1].trim() === '') {
    warnings.push('重大变更部分为空')
  }

  // Check for contributor section
  if (!content.includes('贡献者') && !content.includes('Contributors')) {
    warnings.push('缺少贡献者部分')
  }

  return { valid: errors.length === 0, errors, warnings }
}

function renderValidationResult(result: { valid: boolean; errors: string[]; warnings: string[] }): string {
  const lines: string[] = ['📋 发布说明验证结果:']

  if (result.valid && result.warnings.length === 0) {
    lines.push('✅ 验证通过，无问题')
    return lines.join('\n')
  }

  if (result.errors.length > 0) {
    lines.push('❌ 错误:')
    for (const err of result.errors) {
      lines.push(`  - ${err}`)
    }
  }

  if (result.warnings.length > 0) {
    lines.push('⚠️ 警告:')
    for (const warn of result.warnings) {
      lines.push(`  - ${warn}`)
    }
  }

  return lines.join('\n')
}

// ============================================================================
// Auto Semver Detection - 自动语义版本检测
// ============================================================================

function detectSemverBump(commits: Commit[]): 'major' | 'minor' | 'patch' | 'none' {
  // Check for breaking changes
  const hasBreaking = commits.some(c => c.breaking || c.body.includes('BREAKING CHANGE'))
  if (hasBreaking) return 'major'

  // Check for new features
  const hasFeatures = commits.some(c => c.type === 'feat')
  if (hasFeatures) return 'minor'

  // Check for fixes
  const hasFixes = commits.some(c => c.type === 'fix')
  if (hasFixes) return 'patch'

  return 'none'
}

function suggestVersion(currentVersion: string, bump: 'major' | 'minor' | 'patch'): string {
  const match = currentVersion.match(/v?(\d+)\.(\d+)\.(\d+)/)
  if (!match) return 'v1.0.0'

  let major = parseInt(match[1])
  let minor = parseInt(match[2])
  let patch = parseInt(match[3])

  switch (bump) {
    case 'major':
      major++
      minor = 0
      patch = 0
      break
    case 'minor':
      minor++
      patch = 0
      break
    case 'patch':
      patch++
      break
  }

  return `v${major}.${minor}.${patch}`
}

function renderSemverSuggestion(commits: Commit[]): string {
  const bump = detectSemverBump(commits)
  const latestTag = getLatestTag()
  const suggested = suggestVersion(latestTag || 'v0.0.0', bump)

  const lines: string[] = ['📊 版本建议:']
  lines.push(`  当前版本: ${latestTag || '无'}`)
  lines.push(`  建议变更: ${bump === 'none' ? '无' : bump}`)
  lines.push(`  建议版本: ${suggested}`)

  return lines.join('\n')
}

// ============================================================================
// Multi-Language Support - 多语言支持
// ============================================================================

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    newFeatures: '✨ New Features',
    bugFixes: '🐛 Bug Fixes',
    docs: '📝 Documentation',
    style: '💄 Styles',
    refactor: '♻️ Code Refactoring',
    perf: '⚡ Performance Improvements',
    test: '✅ Tests',
    chore: '🔧 Chores',
    ci: '👷 CI',
    build: '📦 Build',
    revert: '⏪ Revert',
    breaking: '⚠️ Breaking Changes',
    contributors: '👏 Contributors',
    stats: '📊 Statistics',
    totalCommits: 'Total Commits',
    filesChanged: 'Files Changed',
  },
  zh: {
    newFeatures: '✨ 新功能',
    bugFixes: '🐛 修复',
    docs: '📝 文档',
    style: '💄 样式',
    refactor: '♻️ 重构',
    perf: '⚡ 性能',
    test: '✅ 测试',
    chore: '🔧 杂项',
    ci: '👷 CI',
    build: '📦 构建',
    revert: '⏪ 回退',
    breaking: '⚠️ 重大变更',
    contributors: '👏 贡献者',
    stats: '📊 统计',
    totalCommits: '总提交',
    filesChanged: '变更文件',
  },
}

function generateMultiLanguageRelease(commits: Commit[], config: ReleaseNotesConfig, language: 'en' | 'zh'): string {
  const t = TRANSLATIONS[language] || TRANSLATIONS.en
  const categorized = categorizeCommits(commits)
  const contributors = getContributorStats(commits)
  const lines: string[] = []

  lines.push(`# ${config.version || 'v?.?.?'} (${config.date})`)
  lines.push('')

  // Breaking changes
  if (config.showBreakingChanges) {
    const breaking = commits.filter(c => c.breaking)
    if (breaking.length > 0) {
      lines.push(`## ${t.breaking}`)
      for (const commit of breaking) {
        lines.push(`- ${commit.subject} (${commit.shortHash})`)
      }
      lines.push('')
    }
  }

  // Categories with translated labels
  const categoryKeyMap: Record<string, string> = {
    feat: 'newFeatures', fix: 'bugFixes', docs: 'docs', style: 'style',
    refactor: 'refactor', perf: 'perf', test: 'test', chore: 'chore',
    ci: 'ci', build: 'build', revert: 'revert',
  }

  for (const category of config.categories) {
    const catCommits = categorized[category as keyof CategorizedCommits]
    if (!catCommits || catCommits.length === 0) continue

    const labelKey = categoryKeyMap[category] || category
    lines.push(`## ${t[labelKey] || category}`)

    for (const commit of catCommits) {
      const scope = config.groupByScope && commit.scope ? `**${commit.scope}:** ` : ''
      const author = config.includeAuthors ? ` (@${commit.author})` : ''
      lines.push(`- ${scope}${commit.subject}${author}`)
    }
    lines.push('')
  }

  // Contributors
  if (config.showContributors && contributors.length > 0) {
    lines.push(`## ${t.contributors}`)
    for (const c of contributors.slice(0, 10)) {
      lines.push(`- ${c.name} (${c.commits} commits)`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ============================================================================
// Custom Categorization Rules - 自定义分类规则
// ============================================================================

interface CategorizationRule {
  id: string
  name: string
  pattern: string
  targetCategory: string
  priority: number
  enabled: boolean
}

const defaultCategorizationRules: CategorizationRule[] = [
  { id: 'security-fix', name: '安全修复', pattern: '(security|vulnerability|cve|exploit|xss|sql.inject)', targetCategory: 'fix', priority: 10, enabled: true },
  { id: 'ui-change', name: 'UI 变更', pattern: '(ui|css|style|layout|design|theme|responsive)', targetCategory: 'style', priority: 5, enabled: true },
  { id: 'api-change', name: 'API 变更', pattern: '(api|endpoint|route|controller|request|response)', targetCategory: 'feat', priority: 8, enabled: true },
  { id: 'dep-update', name: '依赖更新', pattern: '(bump|upgrade|dependency|package)', targetCategory: 'chore', priority: 3, enabled: true },
  { id: 'test-add', name: '测试添加', pattern: '(test|spec|coverage|mock)', targetCategory: 'test', priority: 5, enabled: true },
]

function applyCategorizationRules(commits: Commit[], rules: CategorizationRule[]): Commit[] {
  return commits.map(commit => {
    for (const rule of rules.filter(r => r.enabled).sort((a, b) => b.priority - a.priority)) {
      try {
        const regex = new RegExp(rule.pattern, 'i')
        if (regex.test(commit.subject) || regex.test(commit.body)) {
          return { ...commit, type: rule.targetCategory }
        }
      } catch {
        // Invalid regex
      }
    }
    return commit
  })
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '📝 发布说明 - 增强版',
    '',
    '自动生成发布说明，支持多种格式和自定义模板。',
    '',
    '📖 📖 用法: ',
    '  /release-notes [选项]',
    '',
    '生成选项:',
    '  --version <版本>       指定版本号',
    '  --since <日期>         起始日期',
    '  --until <日期>         结束日期',
    '  --from <标签>          起始标签',
    '  --to <标签>            结束标签（默认 HEAD）',
    '  --format <格式>        输出格式: md / html / json / txt',
    '  --template <模板>      使用模板: default / detailed / minimal / enterprise',
    '  --no-authors           不包含作者',
    '  --no-refs              不包含引用',
    '  --group-scope          按作用域分组',
    '  --lang <语言>          语言: en / zh',
    '',
    '对比选项:',
    '  --compare <A> <B>      对比两个版本',
    '',
    '分析选项:',
    '  --semver               自动语义版本建议',
    '  --validate             验证发布说明格式',
    '  --rules                查看分类规则',
    '',
    '导出选项:',
    '  --export <文件>        导出到文件',
    '  --stdout               输出到 stdout',
    '',
    '信息选项:',
    '  --tags                 列出所有标签',
    '  --commits              列出提交',
    '  --stats                提交统计',
    '  --history              历史记录',
    '  --contributors         贡献者列表',
    '',
    '💡 💡 示例: ',
    '  /release-notes --version 1.2.0',
    '  /release-notes --from v1.1.0 --to v1.2.0 --format md',
    '  /release-notes --compare v1.1.0 v1.2.0',
    '  /release-notes --since "2024-01-01" --export release.md',
    '  /release-notes --semver',
    '  /release-notes --validate --from v1.1.0',
    '  /release-notes --tags',
    '  /release-notes --contributors',
  ].join('\n')
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (s.includes('--help') || s === '') {
    return { type: 'text', value: renderHelp() }
  }

  // History
  if (s.includes('--history')) {
    return { type: 'text', value: renderHistory() }
  }

  // Semver suggestion
  if (s.includes('--semver')) {
    const commits = getCommits().map(parseCommit).filter(Boolean) as Commit[]
    return { type: 'text', value: renderSemverSuggestion(commits) }
  }

  // Validate
  if (s.includes('--validate')) {
    const commits = getCommits().map(parseCommit).filter(Boolean) as Commit[]
    const config = { ...DEFAULT_CONFIG }
    const content = generateReleaseNotes(commits, config)
    const result = validateReleaseNotes(content)
    return { type: 'text', value: renderValidationResult(result) }
  }

  // Rules
  if (s.includes('--rules')) {
    const lines: string[] = [`📋 分类规则 (${defaultCategorizationRules.length} 条):`]
    for (const rule of defaultCategorizationRules) {
      const status = rule.enabled ? '✅' : '❌'
      lines.push(`  ${status} ${rule.name}: ${rule.pattern} → ${rule.targetCategory} (优先级: ${rule.priority})`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  // Tags
  if (s.includes('--tags')) {
    const tags = getTags()
    if (tags.length === 0) return { type: 'text', value: '📋 没有标签' }

    const lines: string[] = [`📋 标签列表 (${tags.length} 个):`]
    for (const tag of tags.slice(0, 20)) {
      const date = getTagDate(tag)
      lines.push(`  ${tag} (${date})`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  // Contributors
  if (s.includes('--contributors')) {
    const commits = getCommits().map(parseCommit).filter(Boolean) as Commit[]
    const contributors = getContributorStats(commits)

    if (contributors.length === 0) return { type: 'text', value: '📋 没有贡献者数据' }

    const lines: string[] = [`📋 贡献者 (${contributors.length} 人):`]
    for (const c of contributors.slice(0, 20)) {
      lines.push(`  ${c.name}: ${c.commits} 次提交 (${c.firstCommit} ~ ${c.lastCommit})`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  // Stats
  if (s.includes('--stats')) {
    const commits = getCommits().map(parseCommit).filter(Boolean) as Commit[]
    const categorized = categorizeCommits(commits)

    const lines: string[] = ['📊 提交统计:']
    lines.push(`总提交: ${commits.length}`)
    for (const [cat, catCommits] of Object.entries(categorized)) {
      if (catCommits.length > 0) {
        lines.push(`${CATEGORY_LABELS[cat] || cat}: ${catCommits.length}`)
      }
    }
    return { type: 'text', value: lines.join('\n') }
  }

  // Commits
  if (s.includes('--commits')) {
    const commits = getCommits().map(parseCommit).filter(Boolean) as Commit[]
    if (commits.length === 0) return { type: 'text', value: '📋 没有提交' }

    const lines: string[] = [`📋 提交列表 (${commits.length} 个):`]
    for (const c of commits.slice(0, 20)) {
      const emoji = CATEGORY_EMOJI[c.type] || '📋'
      lines.push(`  ${emoji} ${c.shortHash} ${c.subject} (${c.date})`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  // Compare
  const compareMatch = s.match(/--compare\s+(\S+)\s+(\S+)/)
  if (compareMatch) {
    const result = compareVersions(compareMatch[1], compareMatch[2])
    return { type: 'text', value: renderComparison(result) }
  }

  // Parse options
  const config = { ...DEFAULT_CONFIG }
  const versionMatch = s.match(/--version\s+(\S+)/)
  const sinceMatch = s.match(/--since\s+(\S+)/)
  const untilMatch = s.match(/--until\s+(\S+)/)
  const fromMatch = s.match(/--from\s+(\S+)/)
  const toMatch = s.match(/--to\s+(\S+)/)
  const formatMatch = s.match(/--format\s+(\S+)/)
  const templateMatch = s.match(/--template\s+(\S+)/)

  if (versionMatch) config.version = versionMatch[1]
  if (s.includes('--no-authors')) config.includeAuthors = false
  if (s.includes('--no-refs')) config.includeRefs = false
  if (s.includes('--group-scope')) config.groupByScope = true

  const format = formatMatch?.[1] || 'md'
  const template = templateMatch?.[1] || 'default'
  const langMatch = s.match(/--lang\s+(\S+)/)
  const language = (langMatch?.[1] || 'zh') as 'en' | 'zh'

  // Get commits
  let commits: Commit[] = []
  if (fromMatch) {
    const to = toMatch?.[1] || 'HEAD'
    commits = getCommitsBetweenTags(fromMatch[1], to).map(parseCommit).filter(Boolean) as Commit[]
  } else {
    commits = getCommits(sinceMatch?.[1], untilMatch?.[1]).map(parseCommit).filter(Boolean) as Commit[]
  }

  if (commits.length === 0) {
    return { type: 'text', value: '📋 没有提交记录。' }
  }

  // Auto-detect version if not specified
  if (!config.version) {
    const latestTag = getLatestTag()
    config.version = latestTag ? `${latestTag}+${commits.length}` : `v?.?.?+${commits.length}`
  }

  // Apply custom categorization rules
  commits = applyCategorizationRules(commits, defaultCategorizationRules)

  // Generate output
  let output: string
  if (language === 'en') {
    output = generateMultiLanguageRelease(commits, config, 'en')
  } else {
    switch (format) {
      case 'html':
        output = generateHTMLRelease(commits, config)
        break
      case 'json':
        output = generateJSONRelease(commits, config)
        break
      case 'txt':
        output = generatePlainTextRelease(commits, config)
        break
      default:
        output = generateMarkdownRelease(commits, config)
    }
  }

  // Add to history
  addToHistory(config.version, format, commits.length)

  // Export
  const exportMatch = s.match(/--export\s+(\S+)/)
  if (exportMatch) {
    const path = exportReleaseNotes(output, format as any, config.version)
    return { type: 'text', value: `✅ 已导出到: ${path}` }
  }

  if (s.includes('--stdout')) {
    return { type: 'text', value: output }
  }

  // Default: show preview and offer export
  const lines = [
    output,
    '',
    '═'.repeat(50),
    `格式: ${format} | 提交: ${commits.length} | 版本: ${config.version}`,
    '提示: 使用 --export <文件> 保存到文件',
  ]

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// Release Notes Preview - 发布说明预览
// ============================================================================

function generatePreview(commits: Commit[], config: ReleaseNotesConfig): string {
  const lines: string[] = []
  lines.push('📝 发布说明预览')
  lines.push('═'.repeat(50))
  lines.push('')
  lines.push(`版本: ${config.version || '自动检测'}`)
  lines.push(`日期: ${config.date}`)
  lines.push(`提交数: ${commits.length}`)
  lines.push(`分类: ${config.categories.join(', ')}`)
  lines.push(`格式: ${config.template}`)
  lines.push(`语言: 中文`)
  lines.push('')
  lines.push('--- 变更摘要 ---')

  const categorized = categorizeCommits(commits)
  for (const category of config.categories) {
    const catCommits = categorized[category as keyof CategorizedCommits]
    if (catCommits && catCommits.length > 0) {
      lines.push(`  ${CATEGORY_LABELS[category] || category}: ${catCommits.length} 项`)
    }
  }

  lines.push('')
  lines.push('--- 前 5 条提交 ---')
  for (const commit of commits.slice(0, 5)) {
    const emoji = CATEGORY_EMOJI[commit.type] || '📋'
    lines.push(`  ${emoji} ${commit.shortHash} ${commit.subject}`)
  }

  if (commits.length > 5) {
    lines.push(`  ... 共 ${commits.length} 条提交`)
  }

  return lines.join('\n')
}

// ============================================================================
// Release Notes Diff - 发布说明差异对比
// ============================================================================

function diffReleaseNotes(notesA: string, notesB: string): string {
  const linesA = notesA.split('\n')
  const linesB = notesB.split('\n')
  const diff: string[] = []

  const maxLen = Math.max(linesA.length, linesB.length)

  for (let i = 0; i < maxLen; i++) {
    const lineA = linesA[i] || ''
    const lineB = linesB[i] || ''

    if (lineA !== lineB) {
      if (lineA) diff.push(`- ${lineA}`)
      if (lineB) diff.push(`+ ${lineB}`)
    }
  }

  if (diff.length === 0) return '✅ 两个版本的发布说明相同'

  return diff.join('\n')
}

// ============================================================================
// Interactive Release Notes Builder - 交互式构建
// ============================================================================

function buildInteractiveRelease(commits: Commit[]): string {
  const lines: string[] = []
  lines.push('📝 交互式发布说明构建')
  lines.push('═'.repeat(50))
  lines.push('')
  lines.push('提交列表（输入编号选择/取消）:')
  lines.push('')

  for (let i = 0; i < Math.min(commits.length, 15); i++) {
    const c = commits[i]
    const emoji = CATEGORY_EMOJI[c.type] || '📋'
    lines.push(`  [${i + 1}] ${emoji} ${c.shortHash} ${c.subject}`)
  }

  if (commits.length > 15) {
    lines.push(`  ... 共 ${commits.length} 条提交`)
  }

  lines.push('')
  lines.push('提示: 使用 --export <文件> 保存生成的发布说明')

  return lines.join('\n')
}

// ============================================================================
// Command Registration
// ============================================================================

const command = {
  type: 'local' as const,
  name: 'release-notes',
  description: '发布说明 - 自动生成/版本对比/语义版本/验证/多语言/规则/模板/导出/预览',
  aliases: ['/release-notes', '/rn', '/changelog'],
  arguments: [
    { name: '--version', description: '指定版本号', required: false },
    { name: '--from', description: '起始标签', required: false },
    { name: '--to', description: '结束标签', required: false },
    { name: '--since', description: '起始日期', required: false },
    { name: '--until', description: '结束日期', required: false },
    { name: '--format', description: '输出格式', required: false },
    { name: '--template', description: '模板', required: false },
    { name: '--compare', description: '版本对比', required: false },
    { name: '--export', description: '导出到文件', required: false },
    { name: '--tags', description: '列出标签', required: false },
    { name: '--commits', description: '列出提交', required: false },
    { name: '--stats', description: '提交统计', required: false },
    { name: '--contributors', description: '贡献者列表', required: false },
    { name: '--history', description: '历史记录', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default command
