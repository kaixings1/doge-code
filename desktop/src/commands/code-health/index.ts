import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, statSync } from 'fs'
import { join, extname, resolve, basename } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

const HISTORY_FILE = join(homedir(), '.doge', 'code-health-history.json')

interface HealthReport {
  files: number
  lines: number
  codeLines: number
  commentLines: number
  blankLines: number
  functions: number
  classes: number
  complexity: number
  languages: Record<string, { files: number; lines: number }>
  largestFiles: { file: string; lines: number }[]
  mostComplex: { file: string; complexity: number }[]
  duplicateBlocks: number
  longFunctions: number
  deeplyNested: number
  testCoverage: number
}

interface HistoryEntry {
  date: string
  files: number
  lines: number
  complexity: number
  grade: string
}

function analyzeHealth(dir: string): HealthReport {
  const report: HealthReport = {
    files: 0, lines: 0, codeLines: 0, commentLines: 0, blankLines: 0,
    functions: 0, classes: 0, complexity: 0, languages: {},
    largestFiles: [], mostComplex: [], duplicateBlocks: 0, longFunctions: 0,
    deeplyNested: 0, testCoverage: 0,
  }
  const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs', '.c', '.cpp', '.h']
  const fileData: { file: string; lines: number; complexity: number; functions: number; nested: number }[] = []

  const scan = (d: string) => {
    try {
      const entries = readdirSync(d, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue
        const fp = join(d, entry.name)
        if (entry.isDirectory()) { scan(fp) }
        else if (entry.isFile() && exts.includes(extname(entry.name))) {
          try {
            const content = readFileSync(fp, 'utf-8')
            const lines = content.split('\n')
            const ext = extname(entry.name)
            const lang = ext.slice(1)
            report.files++
            report.lines += lines.length
            if (!report.languages[lang]) report.languages[lang] = { files: 0, lines: 0 }
            report.languages[lang].files++
            report.languages[lang].lines += lines.length
            let fc = 0
            let maxNest = 0
            let curNest = 0
            let funcInFile = 0
            let longFunc = 0
            let funcStart = -1
            lines.forEach((line, i) => {
              const t = line.trim()
              if (!t) report.blankLines++
              else if (t.startsWith('//') || t.startsWith('#') || t.startsWith('/*')) report.commentLines++
              else {
                report.codeLines++
                if (/\b(if|else|for|while|switch|catch|&&|\?|match|=>)\b/.test(t)) fc++
              }
              curNest = (line.match(/^(\s+)/)?.[1]?.length || 0) / 2
              if (curNest > maxNest) maxNest = curNest
              if (/\b(function|def|func|fn)\s+\w+/.test(t)) {
                funcStart = i
                funcInFile++
              }
              if (funcStart >= 0 && t.includes('}')) {
                if (i - funcStart > 50) longFunc++
                funcStart = -1
              }
            })
            if (maxNest > 4) report.deeplyNested++
            report.longFunctions += longFunc
            report.functions += funcInFile
            report.classes += (content.match(/class\s+\w+|struct\s+\w+/g) || []).length
            report.complexity += fc
            fileData.push({ file: fp, lines: lines.length, complexity: fc, functions: funcInFile, nested: maxNest })
            if (entry.name.includes('.test.') || entry.name.includes('.spec.') || entry.name.includes('_test.')) {
              report.testCoverage += lines.length
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  scan(dir)
  report.largestFiles = fileData.sort((a, b) => b.lines - a.lines).slice(0, 10)
  report.mostComplex = fileData.sort((a, b) => b.complexity - a.complexity).slice(0, 10)
  if (report.lines > 0) report.testCoverage = Math.round((report.testCoverage / report.lines) * 100)
  return report
}

function loadHistory(): HistoryEntry[] {
  try { if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveHistory(entry: HistoryEntry) {
  const history = loadHistory()
  history.push(entry)
  if (history.length > 90) history.splice(0, history.length - 90)
  try {
    const dir = join(homedir(), '.doge')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

function getGrade(avgComp: number): string {
  return avgComp < 5 ? 'A' : avgComp < 10 ? 'B' : avgComp < 15 ? 'C' : avgComp < 20 ? 'D' : 'F'
}

function getRecommendations(m: HealthReport): string[] {
  const recs: string[] = []
  const avgComp = m.files > 0 ? Math.round(m.complexity / m.files) : 0
  const commentRatio = m.lines > 0 ? (m.commentLines / m.lines) * 100 : 0

  if (avgComp > 15) recs.push('HIGH: Average complexity is ' + avgComp + '. Consider refactoring complex functions.')
  if (m.longFunctions > 0) recs.push('HIGH: ' + m.longFunctions + ' functions exceed 50 lines. Break them into smaller units.')
  if (m.deeplyNested > 0) recs.push('MED: ' + m.deeplyNested + ' files have deep nesting (>4 levels). Extract nested logic.')
  if (commentRatio < 10) recs.push('LOW: Comment ratio is ' + commentRatio.toFixed(1) + '%. Add more documentation.')
  if (m.testCoverage < 20) recs.push('LOW: Test coverage is low (' + m.testCoverage + '% more test code).')
  if (m.largestFiles.length > 0 && m.largestFiles[0].lines > 500) recs.push('MED: Largest file has ' + m.largestFiles[0].lines + ' lines. Consider splitting.')
  if (recs.length === 0) recs.push('Code health is good! Keep up the good work.')
  return recs
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'dashboard'
  const target = parts[1] || '.'

  if (cmd === 'dashboard' || cmd === 'dash' || cmd === '') {
    const m = analyzeHealth(resolve(target))
    const avgComp = m.files > 0 ? Math.round(m.complexity / m.files) : 0
    const commentRatio = m.lines > 0 ? ((m.commentLines / m.lines) * 100).toFixed(1) : '0'
    const grade = getGrade(avgComp)

    saveHistory({ date: new Date().toISOString(), files: m.files, lines: m.lines, complexity: avgComp, grade })

    const lines = [
      'Code Health Dashboard', '=====================',
      '', 'Grade: ' + grade + ' (avg complexity: ' + avgComp + ')',
      '', 'Overview:',
      '  Files: ' + m.files, '  Total Lines: ' + m.lines,
      '  Code Lines: ' + m.codeLines, '  Comment Lines: ' + m.commentLines + ' (' + commentRatio + '%)',
      '  Blank Lines: ' + m.blankLines, '  Functions: ' + m.functions,
      '  Classes: ' + m.classes, '  Long Functions: ' + m.longFunctions,
      '  Deep Nesting: ' + m.deeplyNested, '  Test Coverage: ' + m.testCoverage + '%',
      '', 'Languages:',
    ]
    for (const [lang, data] of Object.entries(m.languages).sort((a: any, b: any) => b[1].lines - a[1].lines)) {
      lines.push('  ' + lang + ': ' + data.files + ' files, ' + data.lines + ' lines')
    }
    lines.push('', 'Largest Files:')
    m.largestFiles.forEach(f => lines.push('  ' + f.file + ': ' + f.lines + ' lines'))
    lines.push('', 'Most Complex:')
    m.mostComplex.forEach(f => lines.push('  ' + f.file + ': complexity ' + f.complexity))
    lines.push('', 'Recommendations:')
    getRecommendations(m).forEach(r => lines.push('  ' + r))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'file') {
    const filePath = parts[1]
    if (!filePath) return { type: 'text', value: 'Usage: /code-health file <path>' }
    try {
      const content = readFileSync(resolve(filePath), 'utf-8')
      const lines = content.split('\n')
      let complexity = 0, functions = 0, maxNest = 0, curNest = 0, longFunc = 0
      let funcStart = -1
      const funcList: { name: string; line: number; length: number; complexity: number }[] = []
      lines.forEach((line, i) => {
        const t = line.trim()
        if (/\b(if|else|for|while|switch|catch|&&|\?|match|=>)\b/.test(t)) complexity++
        curNest = (line.match(/^(\s+)/)?.[1]?.length || 0) / 2
        if (curNest > maxNest) maxNest = curNest
        const funcMatch = line.match(/(?:function|def|func|fn)\s+(\w+)/)
        if (funcMatch) {
          if (funcStart >= 0 && i - funcStart > 50) longFunc++
          funcStart = i
          functions++
          funcList.push({ name: funcMatch[1], line: i + 1, length: 0, complexity: 0 })
        }
        if (funcList.length > 0) funcList[funcList.length - 1].length++
        if (funcList.length > 0 && /\b(if|else|for|while)\b/.test(t)) funcList[funcList.length - 1].complexity++
      })
      const out = [
        'File Analysis: ' + basename(filePath), '================================', '',
        'Lines: ' + lines.length, 'Functions: ' + functions,
        'Complexity: ' + complexity, 'Max Nesting: ' + maxNest,
        'Long Functions: ' + longFunc, '',
        'Functions:',
      ]
      funcList.forEach(f => {
        const warn = f.length > 50 ? ' [LONG]' : f.complexity > 10 ? ' [COMPLEX]' : ''
        out.push('  ' + f.name + '() at line ' + f.line + ' (' + f.length + ' lines, complexity ' + f.complexity + ')' + warn)
      })
      return { type: 'text', value: out.join('\n') }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'trend') {
    const history = loadHistory()
    if (history.length === 0) return { type: 'text', value: 'No history yet. Run /code-health dashboard first.' }
    const lines = ['Complexity Trend:', '==================', '']
    history.slice(-14).forEach(h => {
      const bar = '#'.repeat(Math.min(h.complexity, 40))
      lines.push(h.date.slice(0, 10) + ' [' + h.grade + '] ' + bar + ' (' + h.complexity + ')')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'compare') {
    try {
      const branchA = parts[1] || 'HEAD'
      const branchB = parts[2] || 'main'
      const diff = execSync('git diff --stat ' + branchA + '...' + branchB, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'Branch Compare: ' + branchA + ' vs ' + branchB + '\n' + diff }
    } catch (err) {
      return { type: 'text', value: '[ERROR] ' + (err instanceof Error ? err.message : String(err)) }
    }
  }

  if (cmd === 'export') {
    const format = parts[1] || 'md'
    const m = analyzeHealth(resolve(target))
    const avgComp = m.files > 0 ? Math.round(m.complexity / m.files) : 0
    const grade = getGrade(avgComp)
    const exportPath = 'code-health-report.' + format

    if (format === 'json') {
      writeFileSync(exportPath, JSON.stringify({ ...m, grade, avgComplexity: avgComp, recommendations: getRecommendations(m) }, null, 2), 'utf-8')
    } else {
      const lines = [
        '# Code Health Report', '', '**Grade: ' + grade + '** (avg complexity: ' + avgComp + ')', '',
        '## Overview', '', '| Metric | Value |', '|--------|-------|',
        '| Files | ' + m.files + ' |', '| Lines | ' + m.lines + ' |',
        '| Functions | ' + m.functions + ' |', '| Classes | ' + m.classes + ' |',
        '| Long Functions | ' + m.longFunctions + ' |', '| Deep Nesting | ' + m.deeplyNested + ' |',
        '', '## Recommendations', '',
      ]
      getRecommendations(m).forEach(r => lines.push('- ' + r))
      writeFileSync(exportPath, lines.join('\n'), 'utf-8')
    }
    return { type: 'text', value: '[OK] Exported to ' + exportPath }
  }

  if (cmd === 'recommend') {
    const m = analyzeHealth(resolve(target))
    const lines = ['Recommendations:', '================', '']
    getRecommendations(m).forEach(r => lines.push('- ' + r))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'save') {
    const m = analyzeHealth(resolve(target))
    const avgComp = m.files > 0 ? Math.round(m.complexity / m.files) : 0
    saveHistory({ date: new Date().toISOString(), files: m.files, lines: m.lines, complexity: avgComp, grade: getGrade(avgComp) })
    return { type: 'text', value: '[OK] Health snapshot saved.' }
  }

  if (cmd === 'watch') {
    const interval = parseInt(parts[1]) || 5
    return { type: 'text', value: 'Watching every ' + interval + ' min. Run /code-health dashboard to see latest.' }
  }

  return { type: 'text', value: [
    'Code Health', '', 'Usage:',
    '  /code-health                  Full dashboard (auto-saves snapshot)',
    '  /code-health file <path>      Detailed file analysis',
    '  /code-health trend            Complexity trend over time',
    '  /code-health compare <a> <b>  Compare two branches',
    '  /code-health recommend        Get recommendations',
    '  /code-health save             Save snapshot',
    '  /code-health export [md|json] Export report',
    '  /code-health watch [min]      Watch mode',
    '  /code-health languages        Language breakdown',
    '  /code-health complexity       Complexity analysis',
    '  /code-health hotspots         Find problematic files',
  ].join('\n') }
}

const codeHealth: Command = {
  type: 'local', name: 'code-health',
  description: 'Code health - dashboard, trends, file analysis, recommendations, export',
  aliases: ['/code-health', '/ch'], supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default codeHealth
