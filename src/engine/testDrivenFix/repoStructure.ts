/**
 * engine/testDrivenFix/repoStructure.ts — 仓库结构提取与代码定位
 *
 * 吸收自 Agentless：
 *   - get_repo_structure：文件级结构（类/函数/行号映射）
 *   - filter_out_test_files / filter_none_python：剔除测试与非目标文件
 *   - transfer_arb_locs_to_locs：把 LLM 返回的 class/function/line 定位
 *     转为具体行区间
 *   - line_wrap_content：给代码片段加行号 + 上下文窗口
 */

import { readFileSync, readdirSync } from 'fs'
import { join, extname, relative, isAbsolute, resolve } from 'path'
import type { RepoStructure, RepoSymbol, CodeLocation } from './types.js'

// ============================================================================
// 符号提取（纯函数）
// ============================================================================

/** 测试文件/目录模式 */
const TEST_DIR_PATTERNS = [
  'test', 'tests', '__tests__', 'spec', 'testing',
  'e2e', 'integration-tests', 'test-files',
]
const TEST_FILE_PATTERNS = [
  /\.test\./, /\.spec\./, /_test\./, /^test_/, /_spec\./,
]

/** 判断文件路径是否为测试文件 */
export function isTestFile(filePath: string): boolean {
  const name = filePath.split(/[/\\]/).pop() ?? ''
  if (TEST_FILE_PATTERNS.some((re) => re.test(name))) return true
  const parts = filePath.split(/[/\\]/)
  return parts.some((p) => TEST_DIR_PATTERNS.includes(p.toLowerCase()))
}

/** 代码文件扩展名白名单 */
const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.rb', '.php', '.swift', '.kt', '.cs',
  '.vue', '.svelte', '.sh', '.yaml', '.yml', '.json', '.toml',
])

/** 判断是否为可索引的代码文件 */
export function isCodeFile(filePath: string): boolean {
  return CODE_EXTS.has(extname(filePath).toLowerCase())
}

/** 判断是否非目标语言（吸收自 filter_none_python，扩展为通用） */
export function isNoneTargetLang(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return !CODE_EXTS.has(ext)
}

// ============================================================================
// 符号行号提取（纯函数）
// ============================================================================

/**
 * 从代码内容中提取函数/类/方法及起止行号。
 * 支持 TS/JS/Python/Go/Rust 等常见语法的大括号/冒号块识别。
 */
export function extractSymbolsWithRanges(
  content: string,
  file: string,
): RepoSymbol[] {
  const symbols: RepoSymbol[] = []
  const lines = content.split('\n')
  const stack: Array<{ kind: string; name: string; startLine: number }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // 函数/类定义识别（按语言宽松匹配）
    const defMatch = matchDefinition(trimmed, line, i + 1)
    if (defMatch) {
      const { kind, name } = defMatch
      stack.push({ kind, name, startLine: i + 1 })
      continue
    }

    // 块结束检测
    if (isBlockEnd(line, trimmed)) {
      const top = stack.pop()
      if (top) {
        symbols.push({
          name: top.name,
          kind: top.kind as RepoSymbol['kind'],
          startLine: top.startLine,
          endLine: i + 1,
          file,
        })
      }
    }
  }

  // 未闭合块兜底（文件结束）
  for (const top of stack) {
    symbols.push({
      name: top.name,
      kind: top.kind as RepoSymbol['kind'],
      startLine: top.startLine,
      endLine: lines.length,
      file,
    })
  }

  return symbols
}

interface DefinitionMatch {
  kind: string
  name: string
}

function matchDefinition(trimmed: string, raw: string, lineNo: number): DefinitionMatch | null {
  // Python: def / class
  const pyDef = trimmed.match(/^def\s+([A-Za-z_][\w]*)\s*\(/)
  if (pyDef) return { kind: 'function', name: pyDef[1] }
  const pyClass = trimmed.match(/^class\s+([A-Za-z_][\w]*)/)
  if (pyClass) return { kind: 'class', name: pyClass[1] }

  // TS/JS: function / class / method
  const tsFunc = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/)
  if (tsFunc) return { kind: 'function', name: tsFunc[1] }
  const tsClass = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/)
  if (tsClass) return { kind: 'class', name: tsClass[1] }

  // Go: func
  const goFunc = trimmed.match(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/)
  if (goFunc) return { kind: 'function', name: goFunc[1] }

  // Rust: fn
  const rustFn = trimmed.match(/^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*\(/)
  if (rustFn) return { kind: 'function', name: rustFn[1] }

  // 方法（缩进 + 括号 + 大括号，类内的属性方法）
  const indent = raw.match(/^[\t ]*/)?.[0] ?? ''
  const methodMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^=]+)?\s*\{/)
  if (methodMatch && indent.length >= 2) {
    return { kind: 'method', name: methodMatch[1] }
  }

  return null
}

/** 判断某行是否结束一个块（大括号闭合 / 缩进块结束） */
function isBlockEnd(line: string, trimmed: string): boolean {
  // Python 缩进块：仅当本行非空、缩进小于栈顶时（栈管理在外部处理）
  // 这里简化：大括号闭合
  const closeBrace = trimmed.includes('}')
  // 单行大括号块不算结束（如 if (x) { return }）
  if (closeBrace && !line.trim().startsWith('}')) {
    // 可能是 { ... } 单行，需要区分
  }
  return closeBrace && (line.trim().startsWith('}') || line.trim() === '}')
}

// ============================================================================
// 仓库结构构建
// ============================================================================

/**
 * 扫描项目目录构建仓库结构。
 * @param rootDir 项目根目录
 * @param excludeDirs 排除的目录
 */
export function buildRepoStructure(
  rootDir: string,
  excludeDirs: string[] = ['node_modules', 'dist', 'build', '.git', '.next', '.doge'],
): RepoStructure {
  const structure: RepoStructure = { symbols: {}, testFiles: [] }
  scanDir(rootDir, rootDir, structure, excludeDirs)
  return structure
}

function scanDir(
  rootDir: string,
  current: string,
  structure: RepoStructure,
  excludeDirs: string[],
): void {
  const entries = readDirSafe(current)
  for (const entry of entries) {
    const full = join(current, entry.name)
    const rel = relative(rootDir, full).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      if (excludeDirs.includes(entry.name) || entry.name.startsWith('.')) continue
      if (isTestFile(rel)) continue
      scanDir(rootDir, full, structure, excludeDirs)
    } else if (entry.isFile()) {
      if (!isCodeFile(rel)) continue
      if (isTestFile(rel)) {
        structure.testFiles.push(rel)
        continue
      }
      const content = readFileSafe(full)
      if (!content) continue
      const symbols = extractSymbolsWithRanges(content, rel)
      if (symbols.length > 0 || content.trim()) {
        structure.symbols[rel] = symbols
      }
    }
  }
}

function readDirSafe(dir: string): Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return ''
  }
}

// ============================================================================
// 定位转换（吸收自 Agentless transfer_arb_locs_to_locs）
// ============================================================================

/**
 * 把 LLM 返回的定位（class/function/line）转为文件中的行区间。
 *
 * @param locs 定位列表（如 ["class: MyClass", "function: foo", "line: 42"]）
 * @param structure 仓库结构
 * @param contextWindow 上下文窗口大小（行数）
 */
export function transferLocsToIntervals(
  locs: string[],
  structure: RepoStructure,
  contextWindow = 10,
): Map<string, Array<[number, number]>> {
  const result = new Map<string, Array<[number, number]>>()
  let currentFile: string | null = null
  let currentClass: string | null = null

  for (const loc of locs) {
    const trimmed = loc.trim()
    if (!trimmed) continue

    // 文件路径行（以 / 开头或以代码扩展名结尾）
    if (trimmed.includes('/') || /\.(ts|js|py|go|rs|java|c|cpp|rb|php)\b/.test(trimmed)) {
      currentFile = trimmed.replace(/^[#*>\s]+/, '')
      currentClass = null
      continue
    }

    if (!currentFile) continue
    const fileSymbols = structure.symbols[currentFile] ?? []

    if (trimmed.startsWith('class: ')) {
      const clsName = trimmed.slice(7).trim().split('.')[0]
      const cls = fileSymbols.find((s) => s.kind === 'class' && s.name === clsName)
      if (cls) {
        addInterval(result, currentFile, cls.startLine, cls.endLine)
        currentClass = clsName
      }
    } else if (trimmed.startsWith('function: ')) {
      const funcName = trimmed.slice(10).trim()
      const fn = findFunction(fileSymbols, funcName, currentClass)
      if (fn) addInterval(result, currentFile, fn.startLine, fn.endLine)
    } else if (trimmed.startsWith('line: ')) {
      const lineStr = trimmed.slice(6).trim().split(/\s+/)[0]
      const line = parseInt(lineStr, 10)
      if (!Number.isNaN(line)) {
        addInterval(result, currentFile, line, line)
      }
    }
  }

  // 应用上下文窗口（文件行数按符号区间估算，不读文件避免 I/O）
  for (const [file, intervals] of result) {
    const fileSymbols = structure.symbols[file] ?? []
    const maxLine = fileSymbols.length > 0
      ? Math.max(...fileSymbols.map((s) => s.endLine))
      : intervals.reduce((mx, [s, e]) => Math.max(mx, e), 0)
    const expanded: Array<[number, number]> = intervals.map(([s, e]) => [
      Math.max(1, s - contextWindow),
      Math.min(Math.max(e + contextWindow, s), Math.max(maxLine, 1)),
    ])
    result.set(file, mergeIntervals(expanded))
  }

  return result
}

function findFunction(
  symbols: RepoSymbol[],
  name: string,
  currentClass: string | null,
): RepoSymbol | null {
  // 完全匹配
  const exact = symbols.find((s) => s.name === name && s.kind === 'function')
  if (exact) return exact
  // 方法：Class.method 或当前类内
  if (name.includes('.')) {
    const [cls, method] = name.split('.')
    const c = symbols.find((s) => s.kind === 'class' && s.name === cls)
    if (c && method) {
      const m = symbols.find((s) => s.name === method && s.kind === 'method' &&
        s.startLine > c.startLine && s.endLine < c.endLine)
      if (m) return m
    }
  }
  // 类内方法
  if (currentClass) {
    const c = symbols.find((s) => s.kind === 'class' && s.name === currentClass)
    if (c) {
      const m = symbols.find((s) => s.name === name && s.kind === 'method' &&
        s.startLine > c.startLine && s.endLine < c.endLine)
      if (m) return m
    }
  }
  // 任意方法
  return symbols.find((s) => s.name === name) ?? null
}

function addInterval(
  map: Map<string, Array<[number, number]>>,
  file: string,
  start: number,
  end: number,
): void {
  const list = map.get(file) ?? []
  list.push([start, end])
  map.set(file, list)
}

/** 合并重叠区间 */
export function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const cur = sorted[i]
    if (cur[0] <= last[1]) {
      merged[merged.length - 1] = [last[0], Math.max(last[1], cur[1])]
    } else {
      merged.push(cur)
    }
  }
  return merged
}

// ============================================================================
// 代码片段带行号（吸收自 Agentless line_wrap_content）
// ============================================================================

/**
 * 给代码片段加行号并应用上下文区间。
 * 区间外以 ... 省略。
 */
export function wrapContentWithLines(
  content: string,
  intervals?: Array<[number, number]>,
): string {
  const lines = content.split('\n')
  const result: string[] = []
  const useIntervals = intervals && intervals.length > 0 ? intervals : [[1, lines.length]]

  for (let idx = 0; idx < useIntervals.length; idx++) {
    const [minLine, maxLine] = useIntervals[idx]
    if (minLine > 1) result.push('...')
    for (let i = minLine - 1; i < Math.min(maxLine, lines.length); i++) {
      if (i < 0) continue
      result.push(`${i + 1}|${lines[i]}`)
    }
    if (idx < useIntervals.length - 1 || maxLine < lines.length) {
      result.push('...')
    }
  }

  return result.join('\n')
}

/** 读取项目文件内容（相对项目根） */
export function readProjectFile(projectRoot: string, relPath: string): string {
  const full = isAbsolute(relPath) ? relPath : join(projectRoot, relPath)
  return readFileSafe(full)
}

/** 读取多个项目文件 */
export function readProjectFiles(
  projectRoot: string,
  files: string[],
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const f of files) {
    const content = readProjectFile(projectRoot, f)
    if (content) result[f] = content
  }
  return result
}

/** 获取文件总行数（相对项目根） */
export function getFileLineCount(projectRoot: string, relPath: string): number {
  const content = readProjectFile(projectRoot, relPath)
  return content ? content.split('\n').length : 0
}

// 重新导出 CodeLocation 类型（命令层可能用到）
export type { CodeLocation }
