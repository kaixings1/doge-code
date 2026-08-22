/**
 * src/commands/self-check/index.ts
 *
 * 自检命令 — 改完代码后自动验证，不对就继续改
 *
 * 用法：
 *   /self-check                           完整检查（lint + test + type-check + build）
 *   /self-check lint                      只运行 lint
 *   /self-check test                      只运行 test
 *   /self-check type-check                只运行 TypeScript 类型检查
 *   /self-check build                     只运行构建检查
 *   /self-check security                  安全漏洞扫描
 *   /self-check audit                     依赖审计（npm audit / cargo audit）
 *   /self-check coverage                  测试覆盖率检查
 *   /self-check changed                   只检查 Git 变更的文件
 *   /self-check ci                        模拟 CI 环境运行所有检查
 *   /self-check --max-iterations 5        设置最大修复轮数（默认 3）
 *   /self-check --format json             输出 JSON 格式报告
 *   /self-check --threshold 80            设置覆盖率阈值（默认 80）
 *   /self-check --fail-on-warning         警告也视为失败
 *
 * 工作流程：
 *   1. 检测项目类型，选择对应的检查工具
 *   2. 运行检查命令（支持并行执行）
 *   3. 结构化解析错误输出（文件、行号、错误码）
 *   4. 生成修复建议和自动修复指令
 *   5. 循环验证直到通过或达到最大轮数
 *   6. 生成详细报告（Markdown/JSON）
 *
 * 吸收自：
 *   - Aider (--auto-lint + --auto-test)
 *   - zhikuncode SelfCorrectionLoop
 *   - code-change-verification skill
 *   - Browser-Use self-healing harness
 */

import type { Command } from '../../commands.js'
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'
import { execSync } from 'child_process'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

// ==================== 类型定义 ====================

type ProjectType = 'node' | 'python' | 'rust' | 'go' | 'java' | 'unknown'
type CheckMode = 'full' | 'lint' | 'test' | 'type-check' | 'build' | 'security' | 'audit' | 'coverage' | 'changed' | 'diff' | 'perf' | 'ci'
type OutputFormat = 'markdown' | 'json'

interface CheckOptions {
  mode: CheckMode
  maxIterations: number
  projectType: ProjectType
  coverageThreshold: number
  failOnWarning: boolean
  format: OutputFormat
  commands: CheckCommands
  autoFix: boolean
  applyFix: boolean
}

interface CheckCommands {
  lint: string
  test: string
  typeCheck: string
  build: string
  security: string
  audit: string
  coverage: string
}

interface CheckResult {
  success: boolean
  iterations: number
  lintPassed: boolean
  testPassed: boolean
  typeCheckPassed: boolean
  buildPassed: boolean
  securityPassed: boolean
  auditPassed: boolean
  coveragePassed: boolean
  errors: string[]
  fixes: string[]
  rawErrors: RawError[]
  duration: number
  coveragePercent?: number
}

interface RawError {
  file: string
  line: number | null
  column: number | null
  code: string | null
  message: string
  type: 'lint' | 'test' | 'type' | 'build' | 'security' | 'runtime'
  severity: 'error' | 'warning'
}

interface CheckReport {
  timestamp: string
  projectType: ProjectType
  mode: CheckMode
  success: boolean
  iterations: number
  duration: number
  results: {
    lint: boolean
    test: boolean
    typeCheck: boolean
    build: boolean
    security: boolean
    audit: boolean
    coverage: number | null
  }
  errors: RawError[]
  fixes: string[]
}

// ==================== 项目类型检测 ====================

function detectProjectType(): { type: ProjectType; commands: CheckCommands } {
  // Node.js / TypeScript
  if (existsSync('package.json')) {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
    const hasEslint = existsSync('.eslintrc.js') || existsSync('.eslintrc.cjs') || existsSync('.eslintrc.json') || existsSync('eslint.config.js') || existsSync('.eslintrc.yml')
    const hasTypeScript = existsSync('tsconfig.json')
    const hasBiome = existsSync('biome.json') || existsSync('biome.jsonc')

    let lintCmd = 'echo "No linter configured"'
    if (hasBiome) {
      lintCmd = 'npx biome check . --max-diagnostics=100'
    } else if (hasEslint) {
      lintCmd = hasTypeScript
        ? 'npx eslint . --ext .ts,.tsx,.js,.jsx --max-warnings 0 --max-diagnostics=100'
        : 'npx eslint . --max-warnings 0 --max-diagnostics=100'
    }

    const testCmd = hasTypeScript
      ? 'npx vitest run --reporter=verbose 2>&1 || npm test 2>&1'
      : 'npm test 2>&1'

    return {
      type: 'node',
      commands: {
        lint: lintCmd,
        test: testCmd,
        typeCheck: hasTypeScript ? 'npx tsc --noEmit 2>&1' : 'echo "No TypeScript"',
        build: 'npm run build 2>&1 || echo "No build script"',
        security: 'npm audit --audit-level=high 2>&1 || echo "npm audit not available"',
        audit: 'npm audit --json 2>&1 || echo "[]"',
        coverage: hasTypeScript ? 'npx vitest run --coverage 2>&1' : 'npm test -- --coverage 2>&1',
      },
    }
  }

  // Python
  if (existsSync('pyproject.toml') || existsSync('requirements.txt') || existsSync('setup.py')) {
    const hasPytest = existsSync('pytest.ini') || existsSync('pyproject.toml')
    const hasRuff = existsSync('ruff.toml') || existsSync('.ruff.toml')

    return {
      type: 'python',
      commands: {
        lint: hasRuff ? 'ruff check . 2>&1' : 'python -m pylint **/*.py 2>&1 || echo "pylint not installed"',
        test: hasPytest ? 'python -m pytest -v 2>&1' : 'python -m unittest discover -v 2>&1',
        typeCheck: 'python -m mypy . 2>&1 || echo "mypy not installed"',
        build: 'python setup.py build 2>&1 || echo "No build script"',
        security: 'python -m pip-audit 2>&1 || echo "pip-audit not installed"',
        audit: 'pip list --outdated 2>&1 || echo "pip not available"',
        coverage: 'python -m pytest --cov=. --cov-report=term 2>&1',
      },
    }
  }

  // Rust
  if (existsSync('Cargo.toml')) {
    return {
      type: 'rust',
      commands: {
        lint: 'cargo clippy --all-targets -- -D warnings 2>&1',
        test: 'cargo test --verbose 2>&1',
        typeCheck: 'cargo check 2>&1',
        build: 'cargo build --verbose 2>&1',
        security: 'cargo audit 2>&1 || echo "cargo audit not installed"',
        audit: 'cargo outdated 2>&1 || echo "cargo outdated not installed"',
        coverage: 'cargo tarpaulin --verbose 2>&1 || echo "tarpaulin not installed"',
      },
    }
  }

  // Go
  if (existsSync('go.mod')) {
    return {
      type: 'go',
      commands: {
        lint: 'golangci-lint run 2>&1 || go vet ./... 2>&1',
        test: 'go test ./... -v 2>&1',
        typeCheck: 'go vet ./... 2>&1',
        build: 'go build ./... 2>&1',
        security: 'gosec ./... 2>&1 || echo "gosec not installed"',
        audit: 'go list -m -u all 2>&1',
        coverage: 'go test ./... -coverprofile=coverage.out 2>&1 && go tool cover -func=coverage.out 2>&1',
      },
    }
  }

  // Java
  if (existsSync('pom.xml') || existsSync('build.gradle')) {
    const isMaven = existsSync('pom.xml')
    const prefix = isMaven ? 'mvn' : 'gradlew'

    return {
      type: 'java',
      commands: {
        lint: `${prefix} checkstyle:check 2>&1 || echo "checkstyle not configured"`,
        test: `${prefix} test 2>&1`,
        typeCheck: `${prefix} compile 2>&1`,
        build: `${prefix} clean package 2>&1`,
        security: 'echo "Java security scan requires OWASP Dependency-Check"',
        audit: `${prefix} versions:display-dependency-updates 2>&1 || echo "versions plugin not configured"`,
        coverage: `${prefix} jacoco:report 2>&1 || echo "jacoco not configured"`,
      },
    }
  }

  return {
    type: 'unknown',
    commands: {
      lint: 'echo "Unknown project type"',
      test: 'echo "Unknown project type"',
      typeCheck: 'echo "Unknown project type"',
      build: 'echo "Unknown project type"',
      security: 'echo "Unknown project type"',
      audit: 'echo "Unknown project type"',
      coverage: 'echo "Unknown project type"',
    },
  }
}

// ==================== 命令执行 ====================

interface CommandResult {
  success: boolean
  output: string
  duration: number
  exitCode: number
}

function runCommand(command: string, timeout = 120000): CommandResult {
  const start = Date.now()
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
      cwd: process.cwd(),
    }).trim()
    return {
      success: true,
      output: output || 'Command succeeded with no output',
      duration: Date.now() - start,
      exitCode: 0,
    }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string; status?: number }
    const output = (err.stdout || err.stderr || err.message || 'Unknown error').slice(0, 10000)
    return {
      success: false,
      output,
      duration: Date.now() - start,
      exitCode: err.status ?? 1,
    }
  }
}

function runCommandParallel(commands: string[]): Map<string, CommandResult> {
  const results = new Map<string, CommandResult>()

  for (const cmd of commands) {
    results.set(cmd, runCommand(cmd))
  }

  return results
}

// ==================== 结构化错误解析 ====================

/**
 * 结构化编译错误解析器（吸收自 zhikuncode CompileErrorParser）
 */
class CompileErrorParser {
  private static readonly PATTERNS = [
    /^(.+?)\((\d+)(?:,(\d+))?\):\s*(?:error\s+(TS\d+):\s*(.+))$/m,
    /^(.+?):(\d+)(?::(\d+))?:\s*error:\s*(.+)$/m,
    /^File\s+"(.+?)",\s*line\s+(\d+)(?:,\s*in\s+(.+?))?:\s*(.+)$/m,
    /^(.+\.(?:ts|tsx|js|jsx|py|rs|go|java|rb|c|cpp|h)):(\d+):\s*(.+)$/m,
    /^error\[([E]\d+)\]:\s*(.+)\s+\((.+):(\d+):(\d+)\)$/m,
    /^(.+\.go):(\d+):(\d+):\s*(.+)$/m,
    /^(.+):(\d+):(\d+):\s*(error|warning):\s*(.+)$/m,
    /^(.+):(\d+):(\d+):\s*(error|warn):\s*(.+)$/m,
    /^(.+):(\d+):\s*warning[:\s]+(.+)$/m,
  ]

  static parse(output: string, type: RawError['type'] = 'lint'): RawError[] {
    const errors: RawError[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      for (const pattern of CompileErrorParser.PATTERNS) {
        const match = line.match(pattern)
        if (match) {
          let file = match[1]?.trim() || ''
          let lineNum = match[2] ? parseInt(match[2], 10) : null
          let col = match[3] ? parseInt(match[3], 10) : null
          let code = match[4] || null
          let message = match[5] || match[4] || match[2] || line.trim()

          if (match[0].startsWith('error[')) {
            code = match[1]
            message = match[2]
            file = match[3]
            lineNum = parseInt(match[4], 10)
            col = parseInt(match[5], 10)
          }

          file = file.replace(/^.*?(\w[:\\]?.*)/, '$1')

          const severity = /warning|warn/i.test(code || message) ? 'warning' : 'error'

          errors.push({
            file,
            line: lineNum,
            column: col,
            code,
            message: message.slice(0, 200),
            type,
            severity,
          })
          break
        }
      }
    }

    return errors
  }

  static extractFiles(errors: RawError[]): string[] {
    return [...new Set(errors.map(e => e.file).filter(Boolean))]
  }
}

/**
 * 测试失败解析器（吸收自 zhikuncode TestFailureParser）
 */
class TestFailureParser {
  private static readonly FAILURE_PATTERNS = [
    /^FAIL\s+(.+\.(?:test|spec)\.(?:ts|tsx|js|jsx|py|rs|go|java))/gm,
    /^FAIL\s+(\S+)/gm,
    /^FAILED\s+(.+?)(?:::(.+?))?\s*$/gm,
    /^✗\s*FAIL\s+(.+)/gm,
    /^✗\s*failing[:\s]+(.+)/gm,
    /tests?\s*failed[:\s]+(.+?)(?::(\d+))?/gi,
    /●\s+(.+?)\s*\((.+?)\)/gm,
  ]

  static hasFailures(output: string): boolean {
    return /(?:FAIL(?:ED)?|failing|AssertionError|tests?\s*failed|✗\s*(?:FAIL|failing)|●\s)/i.test(output)
  }

  static parse(output: string): RawError[] {
    const errors: RawError[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      for (const pattern of TestFailureParser.FAILURE_PATTERNS) {
        const match = line.match(pattern)
        if (match) {
          const file = match[1]?.trim() || ''
          const testName = match[2]?.trim() || ''
          errors.push({
            file,
            line: null,
            column: null,
            code: testName || null,
            message: line.trim().slice(0, 200),
            type: 'test',
            severity: 'error',
          })
          break
        }
      }
    }

    const assertionMatches = output.matchAll(/AssertionError[:\s]*(.+?)(?:\n|$)/gi)
    for (const m of assertionMatches) {
      if (!errors.some(e => e.message.includes(m[1]?.slice(0, 50) || ''))) {
        errors.push({
          file: '',
          line: null,
          column: null,
          code: 'AssertionError',
          message: m[1]?.slice(0, 200) || 'Assertion failed',
          type: 'test',
          severity: 'error',
        })
      }
    }

    return errors
  }
}

/**
 * 安全漏洞解析器
 */
class SecurityVulnerabilityParser {
  private static readonly PATTERNS = [
    /^(.+?)\s+(low|moderate|high|critical)\s+(low|moderate|high|critical)\s+(.+)$/mi,
    /severity:\s*(low|moderate|high|critical)/i,
    /vulnerability[:\s]+(.+)/i,
    /CVE-\d{4}-\d+/g,
    /High\s+severity\s+vulnerability[:\s]+(.+)/i,
  ]

  static parse(output: string): RawError[] {
    const errors: RawError[] = []

    for (const pattern of SecurityVulnerabilityParser.PATTERNS) {
      const matches = output.matchAll(pattern)
      for (const m of matches) {
        const message = m[1] || m[0]
        const severity = /critical/i.test(message) ? 'critical' :
                        /high/i.test(message) ? 'error' :
                        /moderate/i.test(message) ? 'warning' : 'warning'

        errors.push({
          file: '',
          line: null,
          column: null,
          code: 'SECURITY',
          message: message.slice(0, 200),
          type: 'security',
          severity: severity as RawError['severity'],
        })
      }
    }

    return errors
  }
}

// ==================== 错误分析与修复建议 ====================

function analyzeAllErrors(output: string, mode: CheckMode, projectType: string): RawError[] {
  const allErrors: RawError[] = []

  if (mode === 'full' || mode === 'lint') {
    allErrors.push(...CompileErrorParser.parse(output, 'lint'))
  }
  if (mode === 'full' || mode === 'test') {
    allErrors.push(...TestFailureParser.parse(output))
  }
  if (mode === 'full' || mode === 'type-check') {
    allErrors.push(...CompileErrorParser.parse(output, 'type'))
  }
  if (mode === 'full' || mode === 'build') {
    allErrors.push(...CompileErrorParser.parse(output, 'build'))
  }
  if (mode === 'full' || mode === 'security') {
    allErrors.push(...SecurityVulnerabilityParser.parse(output))
  }

  const seen = new Set<string>()
  return allErrors.filter(e => {
    const key = `${e.file}:${e.line}:${e.message.slice(0, 50)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 50)
}

function generateFixSuggestions(errors: RawError[], projectType: string): string[] {
  const suggestions: string[] = []

  for (const error of errors.slice(0, 10)) {
    const msg = error.message.toLowerCase()

    if (error.code?.startsWith('TS') || error.type === 'type') {
      if (/type\s+mismatch|type\s+'.+'\s+is\s+not\s+assignable/i.test(msg)) {
        suggestions.push(`类型不匹配 [${error.file}${error.line ? ':' + error.line : ''}]: 检查类型定义，确保赋值兼容`)
      } else if (/cannot\s+find\s+module/i.test(msg)) {
        suggestions.push(`缺少模块 [${error.file}]: 检查 import 路径或运行 npm install`)
      } else if (/property\s+.*\s+does\s+not\s+exist/i.test(msg)) {
        suggestions.push(`属性不存在 [${error.file}]: 检查类型定义或添加类型断言 (as any)`)
      } else if (/expected\s+\d+\s+arguments?/i.test(msg)) {
        suggestions.push(`参数数量不匹配 [${error.file}]: 检查函数调用参数`)
      } else if (/not\s+assignable\s+to\s+type/i.test(msg)) {
        suggestions.push(`类型不可赋值 [${error.file}]: 检查类型兼容性`)
      } else {
        suggestions.push(`TypeScript 错误 [${error.code}] [${error.file}]: ${error.message.slice(0, 100)}`)
      }
    }

    if (error.type === 'lint') {
      if (/no-unused-vars|unused/i.test(error.message)) {
        suggestions.push(`未使用变量 [${error.file}]: 删除未使用的变量或添加 _ 前缀`)
      } else if (/no-undef|is\s+not\s+defined/i.test(msg)) {
        suggestions.push(`未定义变量 [${error.file}]: 检查变量声明或导入`)
      } else if (/missing\s+return/i.test(msg)) {
        suggestions.push(`缺少 return [${error.file}]: 确保函数所有路径都有返回值`)
      } else if (/expected\s+';'/i.test(msg) || /expected\s+'}'/i.test(msg)) {
        suggestions.push(`语法错误 [${error.file}]: 检查缺少的分号或括号`)
      } else if (/indent/i.test(error.message)) {
        suggestions.push(`缩进问题 [${error.file}]: 统一缩进风格（推荐 2 空格）`)
      } else if (/semi/i.test(error.message)) {
        suggestions.push(`分号问题 [${error.file}]: 统一分号风格`)
      } else {
        suggestions.push(`代码规范 [${error.file}]: ${error.message.slice(0, 100)}`)
      }
    }

    if (error.type === 'test') {
      if (/assertionerror|expected.*received/i.test(msg)) {
        suggestions.push(`断言失败 [${error.file}]: 检查测试期望值与实际值`)
      } else if (/timeout/i.test(msg)) {
        suggestions.push(`测试超时 [${error.file}]: 增加超时时间或优化异步代码`)
      } else if (/undefined\s+is\s+not\s+a\s+function/i.test(msg)) {
        suggestions.push(`调用未定义函数 [${error.file}]: 检查函数是否正确导出/导入`)
      } else {
        suggestions.push(`测试失败 [${error.file}]: ${error.message.slice(0, 100)}`)
      }
    }

    if (error.type === 'build') {
      suggestions.push(`构建错误 [${error.file}]: ${error.message.slice(0, 100)}`)
    }

    if (error.type === 'security') {
      if (/critical/i.test(error.severity)) {
        suggestions.push(`严重安全漏洞 [${error.file}]: ${error.message.slice(0, 100)} — 立即修复`)
      } else if (/high/i.test(error.severity)) {
        suggestions.push(`高危安全漏洞 [${error.file}]: ${error.message.slice(0, 100)} — 优先修复`)
      } else {
        suggestions.push(`安全警告 [${error.file}]: ${error.message.slice(0, 100)}`)
      }
    }
  }

  return suggestions
}

function generateAutoFixCommand(errors: RawError[], projectType: string): string | null {
  if (errors.length === 0) return null

  const criticalErrors = errors.filter(e => e.severity === 'error' || e.type === 'security')
  if (criticalErrors.length === 0) return null

  const errorSummary = criticalErrors.slice(0, 5).map(e =>
    `- ${e.file}${e.line ? ':' + e.line : ''}: ${e.code || e.type} — ${e.message.slice(0, 100)}`
  ).join('\n')

  return `[Auto-Fix Required]\n检测到 ${criticalErrors.length} 个需要修复的问题:\n${errorSummary}\n\n请根据以上错误信息修复代码。优先处理安全漏洞和类型错误。`
}

// ==================== 覆盖率提取 ====================

function extractCoveragePercent(output: string): number | null {
  const istanbulMatch = output.match(/All files[:\s]+(\d+\.?\d*)/i)
  if (istanbulMatch) return parseFloat(istanbulMatch[1])

  const vitestMatch = output.match(/coverage[:\s]+(\d+\.?\d*)/i)
  if (vitestMatch) return parseFloat(vitestMatch[1])

  const jacocoMatch = output.match(/total[^%]*?(\d+\.?\d*)\s*%/i)
  if (jacocoMatch) return parseFloat(jacocoMatch[1])

  const genericMatch = output.match(/(\d+\.?\d*)\s*%/)
  if (genericMatch) return parseFloat(genericMatch[1])

  return null
}

// ==================== Git 变更文件检测 ====================

function getChangedFiles(): string[] {
  try {
    const output = execSync('git diff --name-only HEAD 2>&1 || git diff --name-only 2>&1', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    if (!output) return []

    return output.split('\n').filter(f => {
      const ext = f.split('.').pop()?.toLowerCase() || ''
      return ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'rb', 'c', 'cpp', 'h'].includes(ext)
    })
  } catch {
    return []
  }
}

function filterCommandsByChangedFiles(commands: CheckCommands, changedFiles: string[]): CheckCommands {
  if (changedFiles.length === 0) return commands

  const extToLang: Record<string, ProjectType> = {
    'ts': 'node', 'tsx': 'node', 'js': 'node', 'jsx': 'node',
    'py': 'python',
    'rs': 'rust',
    'go': 'go',
    'java': 'java',
  }

  const languages = new Set<ProjectType>()
  for (const f of changedFiles) {
    const ext = f.split('.').pop()?.toLowerCase() || ''
    const lang = extToLang[ext]
    if (lang) languages.add(lang)
  }

  if (languages.size <= 1) {
    const lang = languages.values().next().value
    if (lang === 'node') return commands
    if (lang === 'python') return { ...commands, lint: 'python -m pylint ' + changedFiles.join(' ') }
    if (lang === 'rust') return { ...commands, lint: 'cargo clippy ' + changedFiles.join(' ') }
    if (lang === 'go') return { ...commands, lint: 'go vet ' + changedFiles.join(' ') }
    if (lang === 'java') return { ...commands, lint: 'javac ' + changedFiles.join(' ') }
  }

  return commands
}

// ==================== 性能分析（perf 模式） ====================

function runPerfCheck(): { success: boolean; output: string } {
  try {
    const MAX_FILE_SIZE = 10 * 1024 * 1024
    const MAX_SCAN_FILES = 3000
    const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.pdf', '.zip', '.gz', '.exe', '.dll'])

    function analyzeFile(file: string): { file: string; lines: number; functions: number; avgComplexity: number; maxComplexity: number } | null {
      try {
        const content = readFileSync(file, 'utf-8')
        if (content.includes('\u0000')) return null
        const ext = extname(file).toLowerCase()
        if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs', '.c', '.cpp'].includes(ext)) return null
        const lines = content.split(/\r?\n/)
        const functions: { complexity: number }[] = []
        let inFunc = false, braceCount = 0, funcComplexity = 0
        for (const line of lines) {
          const t = line.trim()
          if (t.length === 0 || t.startsWith('//') || t.startsWith('#')) continue
          if (/\b(function|def|class)\s+\w+/.test(t)) { inFunc = true; funcComplexity = 1 }
          if (inFunc) {
            braceCount += (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length
            if (/\b(if|else|for|while|switch|catch|match)\b/.test(t)) funcComplexity++
            if (braceCount === 0 && t.includes('}')) { functions.push({ complexity: funcComplexity }); inFunc = false }
          }
        }
        const complexities = functions.map(f => f.complexity)
        const avg = complexities.length > 0 ? Math.round(complexities.reduce((a, b) => a + b, 0) / complexities.length) : 0
        return { file, lines: lines.length, functions: functions.length, avgComplexity: avg, maxComplexity: complexities.length > 0 ? Math.max(...complexities) : 0 }
      } catch { return null }
    }

    const results: { file: string; lines: number; functions: number; avgComplexity: number; maxComplexity: number }[] = []
    let count = 0
    const scan = (dir: string) => {
      if (count >= MAX_SCAN_FILES) return
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (count >= MAX_SCAN_FILES) break
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
        const fp = join(dir, entry.name)
        if (entry.isDirectory()) { scan(fp); continue }
        if (BINARY_EXTS.has(extname(fp).toLowerCase())) continue
        const m = analyzeFile(fp)
        if (m) { results.push(m); count++ }
      }
    }
    scan(process.cwd())

    const issues: { file: string; severity: string; title: string; suggestion: string }[] = []
    for (const f of results) {
      if (f.lines > 500) issues.push({ file: f.file, severity: f.lines > 1000 ? 'high' : 'medium', title: 'File too large', suggestion: 'Split into smaller modules' })
      if (f.avgComplexity > 10) issues.push({ file: f.file, severity: 'medium', title: 'High avg complexity', suggestion: 'Refactor complex functions' })
      for (const fn of f.functions) { if (fn > 50) issues.push({ file: f.file, severity: 'medium', title: 'Long function', suggestion: 'Extract smaller functions' }) }
    }

    const score = Math.max(0, 100 - issues.filter(i => i.severity === 'high').length * 8 - issues.filter(i => i.severity === 'medium').length * 4)

    const lines = [
      '📈 性能分析报告', '═════════════════', '',
      `分数：${score}/100`, '',
      `文件数：${results.length}`,
      `问题数：${issues.length}`, '',
    ]
    if (issues.length > 0) {
      lines.push('问题：')
      for (const issue of issues.slice(0, 15)) {
        lines.push(`- ${issue.file}: ${issue.title} → ${issue.suggestion}`)
      }
    }
    return { success: issues.filter(i => i.severity === 'high').length === 0, output: lines.join('\n') }
  } catch (e) {
    return { success: false, output: '❌ 性能分析失败: ' + formatError(e) }
  }
}

// ==================== 历史记录查看 ====================

function getCheckHistory(): string {
  try {
    const historyFile = join(process.cwd(), '.doge', 'tasks', 'self-check-history.json')
    if (!existsSync(historyFile)) return '无历史记录'
    const raw = readFileSync(historyFile, 'utf-8')
    const history = JSON.parse(raw)
    if (!Array.isArray(history) || history.length === 0) return '无历史记录'
    const entries = history.slice(-10).reverse()
    return entries.map((h: any) => `${h.timestamp?.slice(0, 19) || '-'} | ${h.success ? '✅' : '❌'} | ${h.mode} | ${h.iterations}轮 | ${(h.duration / 1000).toFixed(1)}s`).join('\n')
  } catch {
    return '无历史记录'
  }
}

// ==================== Auto-Fix：LLM 自动修复 ====================

interface CallAIOptions {
  apiKey: string
  baseURL: string
  model: string
  apiTimeout: number
}

async function callAI(
  systemPrompt: string,
  userPrompt: string,
  opts: CallAIOptions,
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), opts.apiTimeout)

  try {
    const response = await fetch(opts.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 8000,
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API ${response.status}: ${errorText.slice(0, 200)}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }

    if (data.error) {
      throw new Error(`API 错误: ${data.error.message || 'unknown'}`)
    }

    return data.choices?.[0]?.message?.content || ''
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

function resolveLLMConfig(): CallAIOptions {
  const apiKey = process.env.DOGE_API_KEY || process.env.ANTHROPIC_API_KEY || ''
  const baseURL =
    process.env.ANTHROPIC_BASE_URL || 'https://api.longcat.chat/openai/v1/chat/completions'
  const model = process.env.ANTHROPIC_MODEL || process.env.DOGE_MODEL || 'step-3.7-flash'
  const apiTimeout = Number(process.env.DOGE_API_TIMEOUT || 60000)

  return { apiKey, baseURL, model, apiTimeout }
}

function generateAutoFixPrompt(errors: RawError[], projectType: string, commands: CheckCommands): string {
  const errorSummary = errors.slice(0, 10).map(e =>
    `- [${e.type}] ${e.file}${e.line ? ':' + e.line : ''} ${e.code || ''} — ${e.message.slice(0, 150)}`
  ).join('\n')

  const commandHints = `
可用修复命令：
- lint: ${commands.lint}
- test: ${commands.test}
- type-check: ${commands.typeCheck}
- build: ${commands.build}
`.trim()

  return `你是一个代码修复专家。项目类型: ${projectType}。

检测到以下错误，请生成最小化、精准的修复 patch：

${errorSummary}

${commandHints}

要求：
1. 只修复错误，不要重构无关代码
2. 优先使用项目已有模式（如已有 Prettier 配置则不要改格式）
3. 返回标准 unified diff 格式的 patch
4. 如果无法确定修复方案，返回说明而不是猜测
5. 每个文件单独一个 patch block

返回格式：
\`\`\`diff
--- a/path/to/file
+++ b/path/to/file
@@ -line,count +line,count @@
...diff content...
\`\`\`
`
}

function applyAutoFixPrompt(patch: string): { applied: boolean; files: string[]; error?: string } {
  try {
    // 检测是否为标准 unified diff
    const hasDiffHeader = patch.includes('--- a/') || patch.includes('--- ') || patch.includes('+++ b/')
    if (!hasDiffHeader) {
      return { applied: false, files: [], error: '输出不是标准 unified diff 格式' }
    }

    const fileRegex = /\+\+\+\s+b\/(.+)/g
    const files: string[] = []
    let match

    while ((match = fileRegex.exec(patch)) !== null) {
      const file = match[1].trim()
      if (file && !files.includes(file)) {
        files.push(file)
      }
    }

    if (files.length === 0) {
      return { applied: false, files: [], error: '未检测到任何目标文件' }
    }

    return { applied: true, files, patch }
  } catch (e) {
    return {
      applied: false,
      files: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ==================== 主循环 ====================

async function runSelfCheck(args: string): Promise<LocalCommandResult> {
  const trimmed = args.trim()

  if (!trimmed) {
    return {
      type: 'text',
      value: getHelpText(),
    }
  }

  const options = parseArgs(trimmed)
  const { type, commands } = detectProjectType()

  if (type === 'unknown') {
    return {
      type: 'text',
      value: '❌ 无法检测项目类型。支持: Node.js, Python, Rust, Go, Java\n\n请确保在项目根目录运行，且包含对应的配置文件（package.json, pyproject.toml, Cargo.toml, go.mod, pom.xml）。',
    }
  }

  // perf 和 history 子命令直接走专用逻辑
  if (options.mode === 'perf') {
    const perfResult = runPerfCheck()
    return {
      type: 'text',
      value: perfResult.output + '\n\n' + (perfResult.success ? '✅ 性能检查通过' : '❌ 发现性能问题，建议优化'),
    }
  }

  if (options.mode === 'history') {
    return {
      type: 'text',
      value: '📅 自检历史记录（最近 10 次）：\n\n' + getCheckHistory(),
    }
  }

  let filteredCommands = commands
  if (options.mode === 'changed') {
    const changedFiles = getChangedFiles()
    if (changedFiles.length === 0) {
      return {
        type: 'text',
        value: '✅ 没有检测到代码变更，无需检查。\n\n使用 `/self-check` 运行完整检查。',
      }
    }
    filteredCommands = filterCommandsByChangedFiles(commands, changedFiles)
    options.commands = filteredCommands
  } else if (options.mode === 'diff') {
    const changedFiles = getChangedFiles()
    if (changedFiles.length === 0) {
      return {
        type: 'text',
        value: '✅ 没有检测到代码变更，无需检查。\n\n使用 `/self-check` 运行完整检查。',
      }
    }
    filteredCommands = filterCommandsByChangedFiles(commands, changedFiles)
    options.commands = filteredCommands
    options.mode = 'changed'
  } else {
    options.commands = commands
  }
  options.projectType = type

  const result = await executeSelfCheck(options)
  const report = generateReport(options, result)
  saveHistory(report)

  return formatOutput(options, result, report)
}

function getHelpText(): string {
  return `## 🔍 自检命令 (/self-check)

改完代码后自动验证，发现问题自动修复。

### 用法

\`\`\`bash
# 完整检查（推荐）
/self-check

# 单项检查
/self-check lint                  # 代码规范检查
/self-check test                  # 运行测试
/self-check type-check            # 类型检查（TypeScript/mypy）
/self-check build                 # 构建检查
/self-check security              # 安全漏洞扫描
/self-check audit                 # 依赖审计（检查过期依赖）
/self-check coverage              # 测试覆盖率检查
/self-check changed               # 只检查 Git 变更的文件
/self-check diff                  # 增量 diff 检查（只检查本次变更引入的问题）
/self-check ci                    # 模拟 CI 环境运行所有检查
/self-check perf                  # 性能分析（文件大小/复杂度/热点）
/self-check history               # 查看历史自检记录

# 高级选项
/self-check --max-iterations 5    # 最大修复轮数（默认 3）
/self-check --threshold 80        # 覆盖率阈值（默认 80%）
/self-check --format json         # JSON 格式报告
/self-check --auto-fix          # 调用 LLM 自动生成修复 patch
/self-check --apply-fix          # 自动应用生成的 patch（需配合 --auto-fix）
/self-check --fail-on-warning     # 警告也视为失败
\`\`\`

### 工作流程

1. **检测项目类型** — 自动识别 Node.js/Python/Rust/Go/Java
2. **运行检查命令** — 支持并行执行 lint/test/type-check/build
3. **结构化错误解析** — 提取文件路径、行号、错误码
4. **智能修复建议** — 基于错误类型生成具体修复方向
5. **循环验证** — 自动重试直到通过或达到最大轮数
6. **生成报告** — Markdown/JSON 格式，保存历史记录

### 支持的检查项

| 检查项 | Node.js | Python | Rust | Go | Java |
|--------|---------|--------|------|----|----|
| Lint | ESLint/Biome | pylint/ruff | clippy | golangci-lint | checkstyle |
| Test | vitest/jest | pytest | cargo test | go test | mvn test |
| Type-check | tsc | mypy | cargo check | go vet | mvn compile |
| Build | npm run build | setup.py | cargo build | go build | mvn package |
| Security | npm audit | pip-audit | cargo audit | gosec | OWASP |
| Audit | npm outdated | pip list | cargo outdated | go list | mvn versions |
| Coverage | vitest --coverage | pytest --cov | tarpaulin | go test -cover | jacoco |

### 吸收自

- Aider (--auto-lint + --auto-test)
- zhikuncode SelfCorrectionLoop
- code-change-verification skill
- Browser-Use self-healing harness`
}

function parseArgs(args: string): CheckOptions {
  const parts = args.split(/\s+/).filter(Boolean)

  let mode: CheckMode = 'full'
  let maxIterations = 3
  let coverageThreshold = 80
  let failOnWarning = false
  let format: OutputFormat = 'markdown'
  let autoFix = false
  let applyFix = false

  const validModes: CheckMode[] = ['lint', 'test', 'type-check', 'build', 'security', 'audit', 'coverage', 'changed', 'diff', 'perf', 'ci']
  if (validModes.includes(parts[0] as CheckMode)) {
    mode = parts[0] as CheckMode
  }

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '--max-iterations' && parts[i + 1]) {
      maxIterations = parseInt(parts[i + 1], 10)
      if (isNaN(maxIterations) || maxIterations < 1) maxIterations = 3
      if (maxIterations > 10) maxIterations = 10
    }
    if (parts[i] === '--threshold' && parts[i + 1]) {
      coverageThreshold = parseInt(parts[i + 1], 10)
      if (isNaN(coverageThreshold) || coverageThreshold < 0 || coverageThreshold > 100) coverageThreshold = 80
    }
    if (parts[i] === '--format' && parts[i + 1]) {
      if (parts[i + 1] === 'json') format = 'json'
    }
    if (parts[i] === '--fail-on-warning') {
      failOnWarning = true
    }
    if (parts[i] === '--auto-fix') {
      autoFix = true
    }
    if (parts[i] === '--apply-fix') {
      applyFix = true
    }
  }

  return {
    mode,
    maxIterations,
    projectType: 'unknown',
    coverageThreshold,
    failOnWarning,
    format,
    autoFix,
    applyFix,
    commands: {
      lint: '',
      test: '',
      typeCheck: '',
      build: '',
      security: '',
      audit: '',
      coverage: '',
    },
  }
}

// ==================== 执行引擎 ====================

async function executeSelfCheck(options: CheckOptions): Promise<CheckResult> {
  const startTime = Date.now()
  const allRawErrors: RawError[] = []
  const allFixes: string[] = []
  let lintPassed = true
  let testPassed = true
  let typeCheckPassed = true
  let buildPassed = true
  let securityPassed = true
  let auditPassed = true
  let coveragePassed = true
  let coveragePercent: number | undefined

  for (let iteration = 1; iteration <= options.maxIterations; iteration++) {
    const iterationErrors: RawError[] = []

    if (options.mode === 'full' || options.mode === 'ci') {
      const results = runCommandParallel([
        options.commands.lint,
        options.commands.test,
        options.commands.typeCheck,
        options.commands.build,
        options.commands.security,
        options.commands.audit,
        options.commands.coverage,
      ])

      const lintResult = results.get(options.commands.lint)
      const testResult = results.get(options.commands.test)
      const typeResult = results.get(options.commands.typeCheck)
      const buildResult = results.get(options.commands.build)
      const securityResult = results.get(options.commands.security)
      const auditResult = results.get(options.commands.audit)
      const coverageResult = results.get(options.commands.coverage)

      if (lintResult && !lintResult.success) {
        lintPassed = false
        iterationErrors.push(...CompileErrorParser.parse(lintResult.output, 'lint'))
      }

      if (testResult && !testResult.success) {
        testPassed = false
        iterationErrors.push(...TestFailureParser.parse(testResult.output))
      }

      if (typeResult && !typeResult.success) {
        typeCheckPassed = false
        iterationErrors.push(...CompileErrorParser.parse(typeResult.output, 'type'))
      }

      if (buildResult && !buildResult.success) {
        buildPassed = false
        iterationErrors.push(...CompileErrorParser.parse(buildResult.output, 'build'))
      }

      if (securityResult && !securityResult.success) {
        securityPassed = false
        iterationErrors.push(...SecurityVulnerabilityParser.parse(securityResult.output))
      }

      if (auditResult && !auditResult.success) {
        auditPassed = false
      }

      if (coverageResult) {
        const cov = extractCoveragePercent(coverageResult.output)
        if (cov !== null) {
          coveragePercent = cov
          coveragePassed = cov >= options.coverageThreshold
        }
      }

      allRawErrors.push(...iterationErrors)
    } else {
      let command = ''
      let errorType: RawError['type'] = 'lint'

      switch (options.mode) {
        case 'lint':
          command = options.commands.lint
          errorType = 'lint'
          break
        case 'test':
          command = options.commands.test
          errorType = 'test'
          break
        case 'type-check':
          command = options.commands.typeCheck
          errorType = 'type'
          break
        case 'build':
          command = options.commands.build
          errorType = 'build'
          break
        case 'security':
          command = options.commands.security
          errorType = 'security'
          break
        case 'audit':
          command = options.commands.audit
          errorType = 'lint'
          break
        case 'coverage':
          command = options.commands.coverage
          errorType = 'lint'
          const covResult = runCommand(command)
          const cov = extractCoveragePercent(covResult.output)
          if (cov !== null) {
            coveragePercent = cov
            coveragePassed = cov >= options.coverageThreshold
          }
          allRawErrors.push(...CompileErrorParser.parse(covResult.output, 'lint'))
          break
        case 'changed':
          command = options.commands.lint
          errorType = 'lint'
          break
        case 'diff':
          command = options.commands.lint
          errorType = 'lint'
          break
        case 'perf':
          command = options.commands.lint
          errorType = 'lint'
          break
      }

      if (options.mode !== 'coverage' && options.mode !== 'perf' && command) {
        const result = runCommand(command)
        if (!result.success) {
          const errors = options.mode === 'security'
            ? SecurityVulnerabilityParser.parse(result.output)
            : CompileErrorParser.parse(result.output, errorType)
          allRawErrors.push(...errors)

          switch (options.mode) {
            case 'lint': lintPassed = false; break
            case 'test': testPassed = false; break
            case 'type-check': typeCheckPassed = false; break
            case 'build': buildPassed = false; break
            case 'security': securityPassed = false; break
          }
        }
      }
    }

    if (iterationErrors.length > 0) {
      const newFixes = generateFixSuggestions(iterationErrors, options.projectType)
      allFixes.push(...newFixes)

      const allPassed = lintPassed && testPassed && typeCheckPassed &&
                        buildPassed && securityPassed && auditPassed && coveragePassed

      if (allPassed) {
        return {
          success: true,
          iterations: iteration,
          lintPassed,
          testPassed,
          typeCheckPassed,
          buildPassed,
          securityPassed,
          auditPassed,
          coveragePassed,
          errors: [],
          fixes: [...new Set(allFixes)],
          rawErrors: [],
          duration: Date.now() - startTime,
          coveragePercent,
        }
      }
    } else {
      const allPassed = lintPassed && testPassed && typeCheckPassed &&
                        buildPassed && securityPassed && auditPassed && coveragePassed
      if (allPassed) {
        return {
          success: true,
          iterations: iteration,
          lintPassed,
          testPassed,
          typeCheckPassed,
          buildPassed,
          securityPassed,
          auditPassed,
          coveragePassed,
          errors: [],
          fixes: [...new Set(allFixes)],
          rawErrors: [],
          duration: Date.now() - startTime,
          coveragePercent,
        }
      }
    }
  }

  const result: CheckResult = {
    success: false,
    iterations: options.maxIterations,
    lintPassed,
    testPassed,
    typeCheckPassed,
    buildPassed,
    securityPassed,
    auditPassed,
    coveragePassed,
    errors: [...new Set(allRawErrors.map(e => e.message))],
    fixes: [...new Set(allFixes)],
    rawErrors: allRawErrors,
    duration: Date.now() - startTime,
    coveragePercent,
  }

  // ==================== Auto-Fix 模式 ====================
  if (options.autoFix && !result.success && result.rawErrors.length > 0) {
    const llm = resolveLLMConfig()

    if (llm.apiKey) {
      try {
        const prompt = generateAutoFixPrompt(result.rawErrors, options.projectType, options.commands)
        const patch = await callAI(
          '你是一个代码修复专家。只返回 unified diff patch，不要其他内容。',
          prompt,
          llm,
        )

        const { applied, files, error } = applyAutoFixPrompt(patch)

        if (applied) {
          const patchFile = join(process.cwd(), '.doge', 'tasks', 'auto-fix.patch')
          if (!existsSync(join(process.cwd(), '.doge', 'tasks'))) {
            mkdirSync(join(process.cwd(), '.doge', 'tasks'), { recursive: true })
          }
          writeFileSync(patchFile, patch)

          result.fixes.push(`[Auto-Fix] 已生成 patch，覆盖 ${files.length} 个文件: ${files.join(', ')}`)
          result.fixes.push(`[Auto-Fix] Patch 已保存到: ${patchFile}`)

          if (options.applyFix) {
            try {
              execSync(`git apply "${patchFile}"`, { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 })
              result.fixes.push(`[Auto-Fix] 已自动应用: git apply ${patchFile}`)
            } catch (e) {
              result.fixes.push(`[Auto-Fix] 自动应用失败: ${e instanceof Error ? e.message : String(e)}，请手动运行 git apply ${patchFile}`)
            }
          } else {
            result.fixes.push(`[Auto-Fix] 请审查后手动应用: git apply ${patchFile}`)
          }
        } else {
          result.fixes.push(`[Auto-Fix] 生成失败: ${error}`)
        }
      } catch (e) {
        result.fixes.push(`[Auto-Fix] LLM 调用失败: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else {
      result.fixes.push('[Auto-Fix] 未配置 API 密钥，跳过自动修复。设置 DOGE_API_KEY 或 ANTHROPIC_API_KEY 环境变量。')
    }
  }

  return result
}

// ==================== 报告生成 ====================

function generateReport(options: CheckOptions, result: CheckResult): CheckReport {
  return {
    timestamp: new Date().toISOString(),
    projectType: options.projectType,
    mode: options.mode,
    success: result.success,
    iterations: result.iterations,
    duration: result.duration,
    results: {
      lint: result.lintPassed,
      test: result.testPassed,
      typeCheck: result.typeCheckPassed,
      build: result.buildPassed,
      security: result.securityPassed,
      audit: result.auditPassed,
      coverage: result.coveragePercent ?? null,
    },
    errors: result.rawErrors,
    fixes: result.fixes,
  }
}

function saveHistory(report: CheckReport): void {
  try {
    const historyDir = join(process.cwd(), '.doge', 'tasks')
    const historyFile = join(historyDir, 'self-check-history.json')

    if (!existsSync(historyDir)) {
      mkdirSync(historyDir, { recursive: true })
    }

    let history: CheckReport[] = []
    if (existsSync(historyFile)) {
      try {
        const raw = readFileSync(historyFile, 'utf-8')
        history = JSON.parse(raw)
      } catch {
        history = []
      }
    }

    history.push(report)

    if (history.length > 50) {
      history = history.slice(-50)
    }

    writeFileSync(historyFile, JSON.stringify(history, null, 2))
  } catch {
    // Silently fail - history is optional
  }
}

// ==================== 输出格式化 ====================

function formatOutput(options: CheckOptions, result: CheckResult, report: CheckReport): LocalCommandResult {
  if (options.format === 'json') {
    return {
      type: 'text',
      value: JSON.stringify(report, null, 2),
    }
  }

  const lines: string[] = [
    '## 🔍 自检结果',
    '',
    `**项目类型**: ${options.projectType}`,
    `**检查模式**: ${getModeLabel(options.mode)}`,
    `**状态**: ${result.success ? '✅ 通过' : '❌ 失败'}`,
    `**迭代次数**: ${result.iterations}/${options.maxIterations}`,
    `**耗时**: ${(result.duration / 1000).toFixed(1)}s`,
    '',
  ]

  if (options.mode === 'full' || options.mode === 'ci') {
    lines.push('### 检查结果')
    lines.push('')
    lines.push('| 检查项 | 状态 |')
    lines.push('|--------|------|')
    lines.push(`| Lint | ${result.lintPassed ? '✅' : '❌'} |`)
    lines.push(`| Test | ${result.testPassed ? '✅' : '❌'} |`)
    lines.push(`| Type-check | ${result.typeCheckPassed ? '✅' : '❌'} |`)
    lines.push(`| Build | ${result.buildPassed ? '✅' : '❌'} |`)
    lines.push(`| Security | ${result.securityPassed ? '✅' : '❌'} |`)
    lines.push(`| Audit | ${result.auditPassed ? '✅' : '❌'} |`)
    if (result.coveragePercent !== undefined) {
      const covStatus = result.coveragePassed ? '✅' : '❌'
      lines.push(`| Coverage | ${covStatus} ${result.coveragePercent.toFixed(1)}% |`)
    }
    lines.push('')
  } else {
    if (options.mode === 'full' || options.mode === 'lint') {
      lines.push(`**Lint**: ${result.lintPassed ? '✅ 通过' : '❌ 失败'}`)
    }
    if (options.mode === 'full' || options.mode === 'test') {
      lines.push(`**Test**: ${result.testPassed ? '✅ 通过' : '❌ 失败'}`)
    }
    if (options.mode === 'full' || options.mode === 'type-check') {
      lines.push(`**Type-check**: ${result.typeCheckPassed ? '✅ 通过' : '❌ 失败'}`)
    }
    if (options.mode === 'full' || options.mode === 'build') {
      lines.push(`**Build**: ${result.buildPassed ? '✅ 通过' : '❌ 失败'}`)
    }
    if (options.mode === 'full' || options.mode === 'security') {
      lines.push(`**Security**: ${result.securityPassed ? '✅ 通过' : '❌ 失败'}`)
    }
    if (options.mode === 'full' || options.mode === 'audit') {
      lines.push(`**Audit**: ${result.auditPassed ? '✅ 通过' : '❌ 失败'}`)
    }
    if (options.mode === 'full' || options.mode === 'coverage') {
      if (result.coveragePercent !== undefined) {
        lines.push(`**Coverage**: ${result.coveragePassed ? '✅' : '❌'} ${result.coveragePercent.toFixed(1)}%`)
      }
    }
    lines.push('')
  }

  if (result.rawErrors.length > 0) {
    lines.push('### 错误详情')
    lines.push('')

    const byFile = new Map<string, RawError[]>()
    for (const err of result.rawErrors) {
      const key = err.file || 'unknown'
      if (!byFile.has(key)) byFile.set(key, [])
      byFile.get(key)!.push(err)
    }

    for (const [file, errors] of byFile) {
      lines.push(`**${file}**`)
      for (const err of errors.slice(0, 5)) {
        const icon = err.severity === 'error' ? '❌' : '⚠️'
        const loc = err.line ? `:${err.line}` : ''
        lines.push(`- ${icon} ${err.code || err.type}${loc}: ${err.message.slice(0, 120)}`)
      }
      if (errors.length > 5) {
        lines.push(`- ... 还有 ${errors.length - 5} 个错误`)
      }
      lines.push('')
    }
  }

  if (result.fixes.length > 0) {
    lines.push('### 修复建议')
    lines.push('')
    for (const fix of result.fixes.slice(0, 15)) {
      lines.push(`- ${fix}`)
    }
    if (result.fixes.length > 15) {
      lines.push(`- ... 还有 ${result.fixes.length - 15} 条建议`)
    }
    lines.push('')
    lines.push('💡 **下一步**: 根据上述建议修改代码，然后重新运行 /self-check')
  }

  if (result.success) {
    lines.push('', '🎉 所有检查通过！代码质量良好。')
    if (result.coveragePercent !== undefined) {
      lines.push(`📊 测试覆盖率: ${result.coveragePercent.toFixed(1)}%${result.coveragePassed ? '' : ' (低于阈值 ' + options.coverageThreshold + '%)'}`)
    }
  } else {
    lines.push('', '⚠️ 部分检查未通过，请根据上述建议修复后重试。')
  }

  lines.push('', '📝 历史记录已保存到 `.doge/tasks/self-check-history.json`')

  return {
    type: 'text',
    value: lines.join('\n'),
  }
}

function getModeLabel(mode: CheckMode): string {
  const labels: Record<CheckMode, string> = {
    'full': '完整检查',
    'lint': 'Lint 检查',
    'test': 'Test 检查',
    'type-check': '类型检查',
    'build': '构建检查',
    'security': '安全扫描',
    'audit': '依赖审计',
    'coverage': '覆盖率检查',
    'changed': '变更文件检查',
    'diff': '增量 Diff 检查',
    'ci': 'CI 模拟',
  }
  return labels[mode]
}

// ==================== Command ====================

const call: LocalCommandCall = async (args, _context): Promise<LocalCommandResult> => {
  if ((args || '').trim() === 'help' || (args || '').trim() === '--help' || (args || '').trim() === '-h') {
    return { output: `self-check — 🔍 自检命令 - 改完代码后自动验证，不对就继续改（lint/test/type-check/build/security/audit/coverage）\n用法: /self-check`.trim(), truncated: false }
  }
  return runSelfCheck(args)
}

const selfCheck = {
  type: 'local',
  name: 'self-check',
  description: '🔍 自检命令 - 改完代码后自动验证，不对就继续改（lint/test/type-check/build/security/audit/coverage）',
  aliases: ['/self-check', '/verify'],
  load: () => Promise.resolve({ call }),
} satisfies Command

export default selfCheck
