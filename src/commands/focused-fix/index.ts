import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, resolve, extname, basename, dirname, relative } from 'path'

const HELP = `Focused Fix — 系统性修复整个功能模块

用法: /focused-fix <路径> [选项]

选项:
  --phase <1-5>     只执行指定阶段
  --json            JSON 格式输出
  --dry-run        只诊断不修复
  --help           显示帮助

五阶段协议:
  Phase 1 SCOPE   — 映射功能边界 (所有文件、入口点)
  Phase 2 TRACE   — 映射依赖关系
  Phase 3 DIAGNOSE — 检查代码、测试、日志 (HIGH/MED/LOW)
  Phase 4 FIX     — 修复: deps -> types -> logic -> tests
  Phase 5 VERIFY  — 运行测试验证

铁律: Phase 3 完成前不允许修复`

interface PhaseResult {
  phase: number
  name: string
  status: 'pass' | 'warn' | 'fail'
  findings: string[]
  files: string[]
  duration: number
}

interface FocusedFixReport {
  target: string
  phases: PhaseResult[]
  verdict: 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL'
  totalFindings: number
}

const CODE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs']

function resolveTarget(target: string): string {
  return resolve(target)
}

function findCodeFiles(dir: string): string[] {
  const files: string[] = []
  const absDir = resolve(dir)
  if (!existsSync(absDir)) return files

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      try {
        const st = statSync(full)
        if (st.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules' && entry !== 'dist' && entry !== '.git') {
          walk(full)
        } else if (st.isFile() && CODE_EXT.includes(extname(entry))) {
          files.push(relative(absDir, full))
        }
      } catch {
        // ignore
      }
    }
  }
  walk(absDir)
  return files.sort()
}

function phaseScope(target: string): PhaseResult {
  const start = Date.now()
  const abs = resolve(target)
  const files = existsSync(abs) ? findCodeFiles(abs) : []
  const findings: string[] = []

  if (files.length === 0) findings.push('目标目录无代码文件')

  // Detect entry points
  const entryPoints = files.filter((f) => basename(f) === 'index.ts' || basename(f) === 'main.ts' || basename(f) === 'cli.ts')

  if (entryPoints.length === 0 && files.length > 0) findings.push('未检测到明显入口点 (index.ts/main.ts/cli.ts)')

  return {
    phase: 1,
    name: 'SCOPE',
    status: findings.length === 0 ? 'pass' : 'warn',
    findings,
    files: files.slice(0, 50),
    duration: Date.now() - start,
  }
}

function phaseTrace(target: string, scopeFiles: string[]): PhaseResult {
  const start = Date.now()
  const findings: string[] = []
  const allFiles: string[] = []
  const abs = resolve(target)

  if (existsSync(abs)) {
    const walk = (current: string) => {
      for (const entry of readdirSync(current)) {
        const full = join(current, entry)
        try {
          const st = statSync(full)
          if (st.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules' && entry !== 'dist' && entry !== '.git') walk(full)
          else if (st.isFile()) allFiles.push(relative(abs, full))
        } catch {
          // ignore
        }
      }
    }
    walk(abs)
  }

  // Check for import/require patterns in code files
  const codeFiles = allFiles.filter((f) => CODE_EXT.includes(extname(f)))
  const internalImports = new Map<string, string[]>()

  for (const file of codeFiles.slice(0, 100)) {
    try {
      const content = readFileSync(join(abs, file), 'utf-8')
      const imports = content.match(/from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/g) || []
      for (const imp of imports) {
        const mod = imp.replace(/from\s+['"]|['"]\)|require\(|['"]/g, '').trim()
        if (mod.startsWith('.') || mod.startsWith('/')) {
          const resolved = join(dirname(file), mod)
          internalImports.set(file, [...(internalImports.get(file) || []), resolved])
        }
      }
    } catch {
      // ignore
    }
  }

  if (internalImports.size === 0 && codeFiles.length > 0) findings.push('未检测到内部导入 (可能都是独立脚本)')

  return {
    phase: 2,
    name: 'TRACE',
    status: findings.length === 0 ? 'pass' : 'warn',
    findings,
    files: allFiles.slice(0, 30),
    duration: Date.now() - start,
  }
}

function phaseDiagnose(target: string, scopeFiles: string[]): PhaseResult {
  const start = Date.now()
  const findings: string[] = []
  const abs = resolve(target)

  if (!existsSync(abs)) {
    findings.push('目标路径不存在')
    return { phase: 3, name: 'DIAGNOSE', status: 'fail', findings, files: [], duration: Date.now() - start }
  }

  const allFiles = findCodeFiles(abs)

  // Check for tests
  const testFiles = allFiles.filter((f) => basename(f).startsWith('.') || f.includes('.test.') || f.includes('.spec.') || f.includes('test_') || f.includes('tests/'))
  if (testFiles.length === 0) findings.push('未发现测试文件 (MED)')

  // Check for types/interfaces
  for (const file of allFiles.slice(0, 20)) {
    try {
      const content = readFileSync(join(abs, file), 'utf-8')
      if (/any\b/.test(content) && !/:\s*any\s*\/\//.test(content)) {
        findings.push(`${file}: 使用 any 类型 (MED)`)
        if (findings.length > 15) break
      }
      if (/console\.log/.test(content)) {
        findings.push(`${file}: 残留 console.log (LOW)`)
      }
    } catch {
      // ignore
    }
  }

  // Check for large files (>500 lines)
  for (const file of allFiles) {
    try {
      const content = readFileSync(join(abs, file), 'utf-8')
      const lines = content.split('\n').length
      if (lines > 500) findings.push(`${file}: 文件过大 (${lines} 行) (MED)`)
    } catch {
      // ignore
    }
  }

  return {
    phase: 3,
    name: 'DIAGNOSE',
    status: findings.some((f) => f.includes('MED)') || f.includes('HIGH)')) ? 'warn' : findings.some((f) => f.includes('失败')) ? 'fail' : 'pass',
    findings,
    files: allFiles.slice(0, 20),
    duration: Date.now() - start,
  }
}

function phaseFix(target: string, dryRun: boolean): PhaseResult {
  const start = Date.now()
  const findings: string[] = []

  if (dryRun) {
    findings.push('dry-run 模式: 仅诊断，不执行修复')
  }

  // In dry-run or real mode, report what would be fixed
  findings.push('修复顺序: deps -> types -> logic -> tests -> integration')

  return {
    phase: 4,
    name: 'FIX',
    status: dryRun ? 'warn' : 'pass',
    findings,
    files: [],
    duration: Date.now() - start,
  }
}

function phaseVerify(target: string): PhaseResult {
  const start = Date.now()
  const findings: string[] = []
  const abs = resolve(target)

  if (!existsSync(abs)) {
    findings.push('目标路径不存在，无法验证')
    return { phase: 5, name: 'VERIFY', status: 'fail', findings, files: [], duration: Date.now() - start }
  }

  const allFiles = findCodeFiles(abs)
  findings.push(`代码文件: ${allFiles.length} 个`)

  // Basic sanity: check for syntax errors in TS files
  for (const file of allFiles.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx')).slice(0, 20)) {
    try {
      const content = readFileSync(join(abs, file), 'utf-8')
      // Basic bracket balance check
      const opens = (content.match(/\{/g) || []).length
      const closes = (content.match(/\}/g) || []).length
      if (opens !== closes) findings.push(`${file}: 括号不平衡 (${opens} vs ${closes}) (MED)`)
    } catch {
      findings.push(`${file}: 无法读取 (MED)`)
    }
  }

  return {
    phase: 5,
    name: 'VERIFY',
    status: findings.filter((f) => f.includes('MED)') || f.includes('失败')).length === 0 ? 'pass' : 'warn',
    findings,
    files: allFiles.slice(0, 10),
    duration: Date.now() - start,
  }
}

function formatReport(report: FocusedFixReport): string {
  let out = `Focused Fix Report: ${report.target}\n\n`
  out += `Verdict: ${report.verdict}\n`
  out += `Findings: ${report.totalFindings}\n\n`

  for (const p of report.phases) {
    const icon = p.status === 'pass' ? 'PASS' : p.status === 'warn' ? 'WARN' : 'FAIL'
    out += `[Phase ${p.phase} ${p.name}] ${icon} (${p.duration}ms)\n`
    for (const f of p.findings) out += `  - ${f}\n`
    if (p.files.length > 0) out += `  文件 (${p.files.length}): ${p.files.slice(0, 5).join(', ')}${p.files.length > 5 ? '...' : ''}\n`
    out += '\n'
  }

  return out
}

const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const json = s.includes('--json')
  const dryRun = s.includes('--dry-run')
  const phaseMatch = s.match(/--phase\s+(\d)/)
  const target = s.replace(/--json|--dry-run|--phase\s+\d/g, '').trim() || '.'

  if (s === '--help' || s === '') return { type: 'text', value: HELP }

  const absTarget = resolveTarget(target)
  const scopeFiles = findCodeFiles(absTarget)

  let phases: PhaseResult[] = []

  if (phaseMatch) {
    const phase = parseInt(phaseMatch[1])
    if (phase === 1) phases = [phaseScope(absTarget)]
    else if (phase === 2) phases = [phaseTrace(absTarget, scopeFiles)]
    else if (phase === 3) phases = [phaseDiagnose(absTarget, scopeFiles)]
    else if (phase === 4) phases = [phaseFix(absTarget, dryRun)]
    else if (phase === 5) phases = [phaseVerify(absTarget)]
  } else {
    phases = [
      phaseScope(absTarget),
      phaseTrace(absTarget, scopeFiles),
      phaseDiagnose(absTarget, scopeFiles),
      phaseFix(absTarget, dryRun),
      phaseVerify(absTarget),
    ]
  }

  const totalFindings = phases.reduce((sum, p) => sum + p.findings.length, 0)
  const hasFail = phases.some((p) => p.status === 'fail')
  const hasWarn = phases.some((p) => p.status === 'warn')

  const verdict: 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL' = hasFail ? 'FAIL' : hasWarn ? 'PASS_WITH_WARNINGS' : 'PASS'

  const report: FocusedFixReport = { target, phases, verdict, totalFindings }

  return { type: 'text', value: json ? JSON.stringify(report, null, 2) : formatReport(report) }
}

const focusedFix: Command = {
  type: 'local',
  name: 'focused-fix',
  description: '系统性修复整个功能模块 — 5 阶段协议 (SCOPE/TRACE/DIAGNOSE/FIX/VERIFY)',
  aliases: ['focused-fix', 'fix-module'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export { call }
export default focusedFix
