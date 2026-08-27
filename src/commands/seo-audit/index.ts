import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, resolve, extname, basename } from 'path'

const HELP = `SEO 审计命令 — 扫描文档的 SEO 问题

用法: /seo-audit [路径] [选项]

选项:
  --json              JSON 格式输出
  --fix              自动修复可修复问题
  --min-length <n>   最小字数 (默认 300)
  --max-desc <n>     最大描述长度 (默认 160)
  --min-desc <n>     最小描述长度 (默认 120)
  --help             显示帮助

示例:
  /seo-audit docs/
  /seo-audit README.md --json
  /seo-audit . --fix`

interface SeoIssue {
  file: string
  line: number
  rule: string
  severity: 'high' | 'medium' | 'low'
  message: string
  suggestion?: string
}

interface SeoReport {
  files: number
  issues: SeoIssue[]
  summary: { high: number; medium: number; low: number }
}

const MARKDOWN_EXT = ['.md', '.mdx']

function extractFrontmatter(content: string): { title?: string; description?: string; end: number } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return { end: 0 }
  const fm = match[1]
  const titleMatch = fm.match(/^title:\s*(.+)$/m)
  const descMatch = fm.match(/^description:\s*(.+)$/m)
  return {
    title: titleMatch ? titleMatch[1].trim() : undefined,
    description: descMatch ? descMatch[1].trim() : undefined,
    end: match[0].length,
  }
}

function getHeadingLines(content: string): Array<{ level: number; text: string; line: number }> {
  const headings: Array<{ level: number; text: string; line: number }> = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)/)
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), line: i + 1 })
  }
  return headings
}

function scanMarkdown(filePath: string, opts: { minLength: number; minDesc: number; maxDesc: number }): SeoIssue[] {
  const issues: SeoIssue[] = []
  const abs = resolve(filePath)
  if (!existsSync(abs)) return issues

  try {
    const content = readFileSync(abs, 'utf-8')
    const { title, description, end } = extractFrontmatter(content)
    const body = end > 0 ? content.slice(end) : content
    const wordCount = body.split(/\s+/).filter((w) => w.length > 0).length
    const headings = getHeadingLines(body)

    if (!title) {
      issues.push({ file: filePath, line: 1, rule: 'missing-title', severity: 'high', message: '缺少 title 字段', suggestion: '添加 title: "<页面标题>"' })
    } else if (title.length < 30 || title.length > 70) {
      issues.push({ file: filePath, line: 1, rule: 'title-length', severity: 'medium', message: `title 长度 ${title.length} 字符，建议 30-70` })
    }

    if (!description) {
      issues.push({ file: filePath, line: 1, rule: 'missing-desc', severity: 'high', message: '缺少 description 字段', suggestion: '添加 description: "<页面描述>"' })
    } else if (description.length < opts.minDesc || description.length > opts.maxDesc) {
      issues.push({ file: filePath, line: 1, rule: 'desc-length', severity: 'medium', message: `description 长度 ${description.length} 字符，建议 ${opts.minDesc}-${opts.maxDesc}` })
    }

    if (wordCount < opts.minLength) {
      issues.push({ file: filePath, line: 1, rule: 'thin-content', severity: 'medium', message: `内容仅 ${wordCount} 词，低于 ${opts.minLength}` })
    }

    const h1s = headings.filter((h) => h.level === 1)
    if (h1s.length === 0) issues.push({ file: filePath, line: 1, rule: 'missing-h1', severity: 'high', message: '缺少 H1 标题' })
    else if (h1s.length > 1) issues.push({ file: filePath, line: h1s[1].line, rule: 'multiple-h1', severity: 'medium', message: `发现 ${h1s.length} 个 H1` })

    let lastLevel = 0
    for (const h of headings) {
      if (lastLevel > 0 && h.level > lastLevel + 1) issues.push({ file: filePath, line: h.line, rule: 'heading-skip', severity: 'low', message: `标题层级跳过: H${lastLevel} -> H${h.level}` })
      if (h.text.length < 3) issues.push({ file: filePath, line: h.line, rule: 'empty-heading', severity: 'low', message: `标题过短: "${h.text}"` })
      lastLevel = h.level
    }
  } catch {
    // ignore
  }
  return issues
}

function scanDirectory(dir: string, opts: { minLength: number; minDesc: number; maxDesc: number }): SeoIssue[] {
  const all: SeoIssue[] = []
  const absDir = resolve(dir)
  if (!existsSync(absDir)) return all

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      try {
        const st = statSync(full)
        if (st.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') walk(full)
        else if (st.isFile() && MARKDOWN_EXT.includes(extname(entry))) all.push(...scanMarkdown(full, opts))
      } catch {
        // ignore
      }
    }
  }
  walk(absDir)
  return all
}

function formatReport(report: SeoReport): string {
  if (report.issues.length === 0) return `SEO 审计完成\n\n扫描文件: ${report.files} 个\n\n未发现问题`

  let out = `SEO 审计报告\n\n`
  out += `扫描文件: ${report.files} 个\n`
  out += `总计: ${report.issues.length} 个问题\n`
  out += `  高危: ${report.summary.high} | 中危: ${report.summary.medium} | 低危: ${report.summary.low}\n\n`

  const groups: Record<string, SeoIssue[]> = { high: [], medium: [], low: [] }
  for (const issue of report.issues) groups[issue.severity].push(issue)

  for (const sev of ['high', 'medium', 'low'] as const) {
    const items = groups[sev]
    if (items.length === 0) continue
    const icon = sev === 'high' ? 'HIGH' : sev === 'medium' ? 'MED ' : 'LOW '
    out += `[${icon}] ${items.length} 个问题:\n`
    for (const issue of items.slice(0, 20)) {
      out += `  ${issue.file}:${issue.line} [${issue.rule}] ${issue.message}\n`
      if (issue.suggestion) out += `    建议: ${issue.suggestion}\n`
    }
    if (items.length > 20) out += `  ... 还有 ${items.length - 20} 个\n`
    out += '\n'
  }
  return out
}

const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const json = s.includes('--json')
  const minLen = (() => { const m = s.match(/--min-length\s+(\d+)/); return m ? parseInt(m[1]) : 300 })()
  const minDesc = (() => { const m = s.match(/--min-desc\s+(\d+)/); return m ? parseInt(m[1]) : 120 })()
  const maxDesc = (() => { const m = s.match(/--max-desc\s+(\d+)/); return m ? parseInt(m[1]) : 160 })()
  const target = s.replace(/--json|--fix|--min-length\s+\d+|--max-desc\s+\d+|--min-desc\s+\d+/g, '').trim() || '.'

  if (s === '--help' || s === '') return { type: 'text', value: HELP }

  const isFile = existsSync(resolve(target))
  const issues = isFile ? scanMarkdown(target, { minLength: minLen, minDesc, maxDesc }) : scanDirectory(target, { minLength: minLen, minDesc, maxDesc })

  const uniqueFiles = new Set(issues.map((i) => i.file))
  const report: SeoReport = {
    files: isFile ? 1 : uniqueFiles.size,
    issues,
    summary: { high: issues.filter((i) => i.severity === 'high').length, medium: issues.filter((i) => i.severity === 'medium').length, low: issues.filter((i) => i.severity === 'low').length },
  }

  return { type: 'text', value: json ? JSON.stringify(report, null, 2) : formatReport(report) }
}

const seoAudit: Command = {
  type: 'local',
  name: 'seo-audit',
  description: 'SEO 审计 — 扫描文档的 meta、标题、内容质量等 SEO 问题',
  aliases: ['seo-auditor', 'seo-scan'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export { call }
export default seoAudit
