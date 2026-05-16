/**
 * vendor/color-diff-src 的纯 TypeScript 移植版。
 *
 * Rust 版本使用 syntect+bat 进行语法高亮，使用 similar crate 进行单词差异比较。
 * 此移植版使用 highlight.js（已通过 cli-highlight 成为依赖）和 npm 的 diff 包中的 diffArrays。
 *
 * API 与 vendor/color-diff-src/index.d.ts 完全一致，调用方无需更改。
 *
 * 与原生模块的关键语义差异：
 * - 语法高亮使用 highlight.js。作用域颜色是从 syntect 的输出中测得的，
 *   因此大多数标记匹配，但 hljs 的语法存在差距：
 *   普通标识符和运算符（如 `=` `:`）没有作用域，因此它们以默认前景色
 *   而非白色/粉色渲染。输出结构（行号、标记、背景、单词差异）相同。
 * - BAT_THEME 环境变量支持是存根：highlight.js 没有 bat 主题集，因此
 *   getSyntaxTheme 始终为给定的 Claude 主题返回默认值。
 */

import { diffArrays } from 'diff'
import type * as hljsNamespace from 'highlight.js'
import { basename, extname } from 'path'

// 懒加载：延迟加载 highlight.js 直到首次渲染。完整包在 require 时注册
// 190+ 种语言语法（~50MB，macOS 上 100-200ms，Windows 上数倍于此）。
// 使用顶层导入时，任何访问此模块的调用者——包括通过 StructuredDiff.tsx →
// colorDiff.ts 的 test/preload.ts——都会在模块求值时付出此代价，
// 并在进程的其余部分持有堆内存。在 Windows CI 上，这会将同一分片中的
// 后续测试推入 GC 暂停区域并导致 beforeEach/afterEach 钩子超时
//（officialRegistry.test.ts，PR #24150）。
// 与 NAPI 包装器用于 dlopen 的懒加载模式相同。
type HLJSApi = typeof hljsNamespace
let cachedHljs: HLJSApi | null = null
function hljs(): HLJSApi {
  if (cachedHljs) return cachedHljs
   
  const mod = require('highlight.js')
  // highlight.js 使用 `export =`（CJS）。在 bun/ESM 下，互操作将其包装在
  // .default 中；在 node CJS 下，模块本身就是 API。在运行时检查。
  cachedHljs = 'default' in mod && mod.default ? mod.default : mod
  return cachedHljs!
}

import { stringWidth } from '../../ink/stringWidth.js'
import { logError } from '../../utils/log.js'

// ---------------------------------------------------------------------------
// 公共 API 类型（与 vendor/color-diff-src/index.d.ts 一致）
// ---------------------------------------------------------------------------

export type Hunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export type SyntaxTheme = {
  theme: string
  source: string | null
}

export type NativeModule = {
  ColorDiff: typeof ColorDiff
  ColorFile: typeof ColorFile
  getSyntaxTheme: (themeName: string) => SyntaxTheme
}

// ---------------------------------------------------------------------------
// 颜色 / ANSI 转义辅助函数
// ---------------------------------------------------------------------------

type Color = { r: number; g: number; b: number; a: number }
type Style = { foreground: Color; background: Color }
type Block = [Style, string]
type ColorMode = 'truecolor' | 'color256' | 'ansi'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const UNDIM = '\x1b[22m'

function rgb(r: number, g: number, b: number): Color {
  return { r, g, b, a: 255 }
}

function ansiIdx(index: number): Color {
  return { r: index, g: 0, b: 0, a: 0 }
}

// 哨兵值：a=1 表示"终端默认"（与 bat 约定一致）
const DEFAULT_BG: Color = { r: 0, g: 0, b: 0, a: 1 }

function detectColorMode(theme: string): ColorMode {
  if (theme.includes('ansi')) return 'ansi'
  const ct = process.env.COLORTERM ?? ''
  return ct === 'truecolor' || ct === '24bit' ? 'truecolor' : 'color256'
}

// 移植自 ansi_colours::ansi256_from_rgb — 将 RGB 近似到 xterm-256 调色板
//（6x6x6 立方体 + 24 级灰度）。通过比较立方体与灰度渐变候选值，
// 选择感知上最接近的索引，与 Rust crate 相同。
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255]
function ansi256FromRgb(r: number, g: number, b: number): number {
  const q = (c: number) =>
    c < 48 ? 0 : c < 115 ? 1 : c < 155 ? 2 : c < 195 ? 3 : c < 235 ? 4 : 5
  const qr = q(r)
  const qg = q(g)
  const qb = q(b)
  const cubeIdx = 16 + 36 * qr + 6 * qg + qb
  // 灰度渐变候选（232-255，级别 8..238 步长 10）。超出渐变范围时，
  // 立方体角是唯一选项——ansi_colours 将 248,248,242 映射到 231（立方体白色），
  // 而非 255（渐变顶部）。
  const grey = Math.round((r + g + b) / 3)
  if (grey < 5) return 16
  if (grey > 244 && qr === qg && qg === qb) return cubeIdx
  const greyLevel = Math.max(0, Math.min(23, Math.round((grey - 8) / 10)))
  const greyIdx = 232 + greyLevel
  const greyRgb = 8 + greyLevel * 10
  const cr = CUBE_LEVELS[qr]!
  const cg = CUBE_LEVELS[qg]!
  const cb = CUBE_LEVELS[qb]!
  const dCube = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
  const dGrey = (r - greyRgb) ** 2 + (g - greyRgb) ** 2 + (b - greyRgb) ** 2
  return dGrey < dCube ? greyIdx : cubeIdx
}

function colorToEscape(c: Color, fg: boolean, mode: ColorMode): string {
  // alpha=0：调色板索引编码在 .r 中（bat 的 ansi 主题约定）
  if (c.a === 0) {
    const idx = c.r
    if (idx < 8) return `\x1b[${(fg ? 30 : 40) + idx}m`
    if (idx < 16) return `\x1b[${(fg ? 90 : 100) + (idx - 8)}m`
    return `\x1b[${fg ? 38 : 48};5;${idx}m`
  }
  // alpha=1：终端默认颜色
  if (c.a === 1) return fg ? '\x1b[39m' : '\x1b[49m'

  const codeType = fg ? 38 : 48
  if (mode === 'truecolor') {
    return `\x1b[${codeType};2;${c.r};${c.g};${c.b}m`
  }
  return `\x1b[${codeType};5;${ansi256FromRgb(c.r, c.g, c.b)}m`
}

function asTerminalEscaped(
  blocks: readonly Block[],
  mode: ColorMode,
  skipBackground: boolean,
  dim: boolean,
): string {
  let out = dim ? RESET + DIM : RESET
  for (const [style, text] of blocks) {
    out += colorToEscape(style.foreground, true, mode)
    if (!skipBackground) {
      out += colorToEscape(style.background, false, mode)
    }
    out += text
  }
  return out + RESET
}

// ---------------------------------------------------------------------------
// 主题
// ---------------------------------------------------------------------------

type Marker = '+' | '-' | ' '

type Theme = {
  addLine: Color
  addWord: Color
  addDecoration: Color
  deleteLine: Color
  deleteWord: Color
  deleteDecoration: Color
  foreground: Color
  background: Color
  scopes: Record<string, Color>
}

function defaultSyntaxThemeName(themeName: string): string {
  if (themeName.includes('ansi')) return 'ansi'
  if (themeName.includes('dark')) return 'Monokai Extended'
  return 'GitHub'
}

// highlight.js 作用域 → syntect Monokai Extended 前景色（从 Rust 模块的
// 输出中测得，因此颜色与原始版本完全一致）
const MONOKAI_SCOPES: Record<string, Color> = {
  keyword: rgb(249, 38, 114),
  _storage: rgb(102, 217, 239),
  built_in: rgb(166, 226, 46),
  type: rgb(166, 226, 46),
  literal: rgb(190, 132, 255),
  number: rgb(190, 132, 255),
  string: rgb(230, 219, 116),
  title: rgb(166, 226, 46),
  'title.function': rgb(166, 226, 46),
  'title.class': rgb(166, 226, 46),
  'title.class.inherited': rgb(166, 226, 46),
  params: rgb(253, 151, 31),
  comment: rgb(117, 113, 94),
  meta: rgb(117, 113, 94),
  attr: rgb(166, 226, 46),
  attribute: rgb(166, 226, 46),
  variable: rgb(255, 255, 255),
  'variable.language': rgb(255, 255, 255),
  property: rgb(255, 255, 255),
  operator: rgb(249, 38, 114),
  punctuation: rgb(248, 248, 242),
  symbol: rgb(190, 132, 255),
  regexp: rgb(230, 219, 116),
  subst: rgb(248, 248, 242),
}

// highlight.js 作用域 → syntect GitHub-light 前景色（从 Rust 测得）
const GITHUB_SCOPES: Record<string, Color> = {
  keyword: rgb(167, 29, 93),
  _storage: rgb(167, 29, 93),
  built_in: rgb(0, 134, 179),
  type: rgb(0, 134, 179),
  literal: rgb(0, 134, 179),
  number: rgb(0, 134, 179),
  string: rgb(24, 54, 145),
  title: rgb(121, 93, 163),
  'title.function': rgb(121, 93, 163),
  'title.class': rgb(0, 0, 0),
  'title.class.inherited': rgb(0, 0, 0),
  params: rgb(0, 134, 179),
  comment: rgb(150, 152, 150),
  meta: rgb(150, 152, 150),
  attr: rgb(0, 134, 179),
  attribute: rgb(0, 134, 179),
  variable: rgb(0, 134, 179),
  'variable.language': rgb(0, 134, 179),
  property: rgb(0, 134, 179),
  operator: rgb(167, 29, 93),
  punctuation: rgb(51, 51, 51),
  symbol: rgb(0, 134, 179),
  regexp: rgb(24, 54, 145),
  subst: rgb(51, 51, 51),
}

// syntect 将这些关键字归类为 storage.type 而非 keyword.control。
// highlight.js 将它们全部归入 "keyword"；我们重新拆分，使 const/function/等
// 获得青色 storage 颜色而非粉色。
const STORAGE_KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'class',
  'type',
  'interface',
  'enum',
  'namespace',
  'module',
  'def',
  'fn',
  'func',
  'struct',
  'trait',
  'impl',
])

const ANSI_SCOPES: Record<string, Color> = {
  keyword: ansiIdx(13),
  _storage: ansiIdx(14),
  built_in: ansiIdx(14),
  type: ansiIdx(14),
  literal: ansiIdx(12),
  number: ansiIdx(12),
  string: ansiIdx(10),
  title: ansiIdx(11),
  'title.function': ansiIdx(11),
  'title.class': ansiIdx(11),
  comment: ansiIdx(8),
  meta: ansiIdx(8),
}

function buildTheme(themeName: string, mode: ColorMode): Theme {
  const isDark = themeName.includes('dark')
  const isAnsi = themeName.includes('ansi')
  const isDaltonized = themeName.includes('daltonized')
  const tc = mode === 'truecolor'

  if (isAnsi) {
    return {
      addLine: DEFAULT_BG,
      addWord: DEFAULT_BG,
      addDecoration: ansiIdx(10),
      deleteLine: DEFAULT_BG,
      deleteWord: DEFAULT_BG,
      deleteDecoration: ansiIdx(9),
      foreground: ansiIdx(7),
      background: DEFAULT_BG,
      scopes: ANSI_SCOPES,
    }
  }

  if (isDark) {
    const fg = rgb(248, 248, 242)
    const deleteLine = rgb(61, 1, 0)
    const deleteWord = rgb(92, 2, 0)
    const deleteDecoration = rgb(220, 90, 90)
    if (isDaltonized) {
      return {
        addLine: tc ? rgb(0, 27, 41) : ansiIdx(17),
        addWord: tc ? rgb(0, 48, 71) : ansiIdx(24),
        addDecoration: rgb(81, 160, 200),
        deleteLine,
        deleteWord,
        deleteDecoration,
        foreground: fg,
        background: DEFAULT_BG,
        scopes: MONOKAI_SCOPES,
      }
    }
    return {
      addLine: tc ? rgb(2, 40, 0) : ansiIdx(22),
      addWord: tc ? rgb(4, 71, 0) : ansiIdx(28),
      addDecoration: rgb(80, 200, 80),
      deleteLine,
      deleteWord,
      deleteDecoration,
      foreground: fg,
      background: DEFAULT_BG,
      scopes: MONOKAI_SCOPES,
    }
  }

  // 浅色
  const fg = rgb(51, 51, 51)
  const deleteLine = rgb(255, 220, 220)
  const deleteWord = rgb(255, 199, 199)
  const deleteDecoration = rgb(207, 34, 46)
  if (isDaltonized) {
    return {
      addLine: rgb(219, 237, 255),
      addWord: rgb(179, 217, 255),
      addDecoration: rgb(36, 87, 138),
      deleteLine,
      deleteWord,
      deleteDecoration,
      foreground: fg,
      background: DEFAULT_BG,
      scopes: GITHUB_SCOPES,
    }
  }
  return {
    addLine: rgb(220, 255, 220),
    addWord: rgb(178, 255, 178),
    addDecoration: rgb(36, 138, 61),
    deleteLine,
    deleteWord,
    deleteDecoration,
    foreground: fg,
    background: DEFAULT_BG,
    scopes: GITHUB_SCOPES,
  }
}

function defaultStyle(theme: Theme): Style {
  return { foreground: theme.foreground, background: theme.background }
}

function lineBackground(marker: Marker, theme: Theme): Color {
  switch (marker) {
    case '+':
      return theme.addLine
    case '-':
      return theme.deleteLine
    case ' ':
      return theme.background
  }
}

function wordBackground(marker: Marker, theme: Theme): Color {
  switch (marker) {
    case '+':
      return theme.addWord
    case '-':
      return theme.deleteWord
    case ' ':
      return theme.background
  }
}

function decorationColor(marker: Marker, theme: Theme): Color {
  switch (marker) {
    case '+':
      return theme.addDecoration
    case '-':
      return theme.deleteDecoration
    case ' ':
      return theme.foreground
  }
}

// ---------------------------------------------------------------------------
// 通过 highlight.js 进行语法高亮
// ---------------------------------------------------------------------------

// hljs 10.x 使用 `kind`；11.x 使用 `scope`。同时处理两者。
type HljsNode = {
  scope?: string
  kind?: string
  children: (HljsNode | string)[]
}

// 基于文件名和扩展名的语言检测（近似 bat 的 SyntaxMapping + syntect 的 find_syntax_by_extension）
const FILENAME_LANGS: Record<string, string> = {
  Dockerfile: 'dockerfile',
  Makefile: 'makefile',
  Rakefile: 'ruby',
  Gemfile: 'ruby',
  CMakeLists: 'cmake',
}

function detectLanguage(
  filePath: string,
  firstLine: string | null,
): string | null {
  const base = basename(filePath)
  const ext = extname(filePath).slice(1)

  // 基于文件名查找（处理 Dockerfile、Makefile、CMakeLists.txt 等）
  const stem = base.split('.')[0] ?? ''
  const byName = FILENAME_LANGS[base] ?? FILENAME_LANGS[stem]
  if (byName && hljs().getLanguage(byName)) return byName
  if (ext) {
    const lang = hljs().getLanguage(ext)
    if (lang) return ext
  }
  // Shebang / 首行检测（去除 UTF-8 BOM）
  if (firstLine) {
    const line = firstLine.startsWith('\ufeff') ? firstLine.slice(1) : firstLine
    if (line.startsWith('#!')) {
      if (line.includes('bash') || line.includes('/sh')) return 'bash'
      if (line.includes('python')) return 'python'
      if (line.includes('node')) return 'javascript'
      if (line.includes('ruby')) return 'ruby'
      if (line.includes('perl')) return 'perl'
    }
    if (line.startsWith('<?php')) return 'php'
    if (line.startsWith('<?xml')) return 'xml'
  }
  return null
}

function scopeColor(
  scope: string | undefined,
  text: string,
  theme: Theme,
): Color {
  if (!scope) return theme.foreground
  if (scope === 'keyword' && STORAGE_KEYWORDS.has(text.trim())) {
    return theme.scopes['_storage'] ?? theme.foreground
  }
  return (
    theme.scopes[scope] ??
    theme.scopes[scope.split('.')[0]!] ??
    theme.foreground
  )
}

function flattenHljs(
  node: HljsNode | string,
  theme: Theme,
  parentScope: string | undefined,
  out: Block[],
): void {
  if (typeof node === 'string') {
    const fg = scopeColor(parentScope, node, theme)
    out.push([{ foreground: fg, background: theme.background }, node])
    return
  }
  // 防御性检查：跳过 undefined/null 子节点，防止该词出现在 diff 输出中
  const scope = node.scope ?? node.kind ?? parentScope
  for (const child of node.children) {
    if (child === undefined || child === null) continue
    flattenHljs(child, theme, scope, out)
  }
}

// result.emitter 属于公共 HighlightResult 类型，但 rootNode 是
// TokenTreeEmitter 的内部实现。类型守卫一次性验证形状，使我们
// 通过 logError 大声失败，而非静默的 try/catch 吞掉——先前的
// `as unknown as` 转换隐藏了版本不匹配（_emitter 与 emitter、
// scope 与 kind）在静默的灰色回退之后。
function hasRootNode(emitter: unknown): emitter is { rootNode: HljsNode } {
  return (
    typeof emitter === 'object' &&
    emitter !== null &&
    'rootNode' in emitter &&
    typeof emitter.rootNode === 'object' &&
    emitter.rootNode !== null &&
    'children' in emitter.rootNode
  )
}

let loggedEmitterShapeError = false

function highlightLine(
  state: { lang: string | null; stack: unknown },
  line: string,
  theme: Theme,
): Block[] {
  // syntect-parity：追加末尾 \n 以使行注释正确终止，随后再去除
  const code = line + '\n'
  if (!state.lang) {
    return [[defaultStyle(theme), code]]
  }
  let result
  try {
    result = hljs().highlight(code, {
      language: state.lang,
      ignoreIllegals: true,
    })
  } catch {
    // hljs 在未知语言上会抛出异常，即使设置了 ignoreIllegals
    return [[defaultStyle(theme), code]]
  }
  if (!hasRootNode(result.emitter)) {
    if (!loggedEmitterShapeError) {
      loggedEmitterShapeError = true
      logError(
        new Error(
          `color-diff: hljs emitter shape mismatch (keys: ${Object.keys(result.emitter).join(',')}). Syntax highlighting disabled.`,
        ),
      )
    }
    return [[defaultStyle(theme), code]]
  }
  const blocks: Block[] = []
  flattenHljs(result.emitter.rootNode, theme, undefined, blocks)
  return blocks
}

// ---------------------------------------------------------------------------
// 单词差异比较
// ---------------------------------------------------------------------------

type Range = { start: number; end: number }

const CHANGE_THRESHOLD = 0.4

// 分词为单词序列、空白序列和单个标点字符——
// 匹配 Rust 的 tokenize()，后者镜像了 diffWordsWithSpace 的分割方式。
function tokenize(text: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (/[\p{L}\p{N}_]/u.test(ch)) {
      let j = i + 1
      while (j < text.length && /[\p{L}\p{N}_]/u.test(text[j]!)) j++
      tokens.push(text.slice(i, j))
      i = j
    } else if (/\s/.test(ch)) {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j]!)) j++
      tokens.push(text.slice(i, j))
      i = j
    } else {
      // 前进一个码点（处理代理对）
      const cp = text.codePointAt(i)!
      const len = cp > 0xffff ? 2 : 1
      tokens.push(text.slice(i, i + len))
      i += len
    }
  }
  return tokens
}

function findAdjacentPairs(markers: Marker[]): [number, number][] {
  const pairs: [number, number][] = []
  let i = 0
  while (i < markers.length) {
    if (markers[i] === '-') {
      const delStart = i
      let delEnd = i
      while (delEnd < markers.length && markers[delEnd] === '-') delEnd++
      let addEnd = delEnd
      while (addEnd < markers.length && markers[addEnd] === '+') addEnd++
      const delCount = delEnd - delStart
      const addCount = addEnd - delEnd
      if (delCount > 0 && addCount > 0) {
        const n = Math.min(delCount, addCount)
        for (let k = 0; k < n; k++) {
          pairs.push([delStart + k, delEnd + k])
        }
        i = addEnd
      } else {
        i = delEnd
      }
    } else {
      i++
    }
  }
  return pairs
}

function wordDiffStrings(oldStr: string, newStr: string): [Range[], Range[]] {
  const oldTokens = tokenize(oldStr)
  const newTokens = tokenize(newStr)
  const ops = diffArrays(oldTokens, newTokens)

  const totalLen = oldStr.length + newStr.length
  let changedLen = 0
  const oldRanges: Range[] = []
  const newRanges: Range[] = []
  let oldOff = 0
  let newOff = 0

  for (const op of ops) {
    const len = op.value.reduce((s, t) => s + t.length, 0)
    if (op.removed) {
      changedLen += len
      oldRanges.push({ start: oldOff, end: oldOff + len })
      oldOff += len
    } else if (op.added) {
      changedLen += len
      newRanges.push({ start: newOff, end: newOff + len })
      newOff += len
    } else {
      oldOff += len
      newOff += len
    }
  }

  if (totalLen > 0 && changedLen / totalLen > CHANGE_THRESHOLD) {
    return [[], []]
  }
  return [oldRanges, newRanges]
}

// ---------------------------------------------------------------------------
// 高亮（逐行转换流水线）
// ---------------------------------------------------------------------------

type Highlight = {
  marker: Marker | null
  lineNumber: number
  lines: Block[][]
}

function removeNewlines(h: Highlight): void {
  h.lines = h.lines.map(line =>
    line.flatMap(([style, text]) =>
      text
        .split('\n')
        .filter(p => p.length > 0)
        .map((p): Block => [style, p])
    ).filter(block => block[1] !== undefined && block[1] !== '')
  )
}

function charWidth(ch: string): number {
  return stringWidth(ch)
}

function wrapText(h: Highlight, width: number, theme: Theme): void {
  const newLines: Block[][] = []
  for (const line of h.lines) {
    const queue: Block[] = line.slice()
    let cur: Block[] = []
    let curW = 0
    while (queue.length > 0) {
      const [style, text] = queue.shift()!
      const tw = stringWidth(text)
      if (curW + tw <= width) {
        cur.push([style, text])
        curW += tw
      } else {
        const remaining = width - curW
        let bytePos = 0
        let accW = 0
        // 按码点迭代
        for (const ch of text) {
          const cw = charWidth(ch)
          if (accW + cw > remaining) break
          accW += cw
          bytePos += ch.length
        }
        if (bytePos === 0) {
          if (curW === 0) {
            // 新行且第一个字符仍然放不下——强制推进一个码点
            // 以保证向前推进（会溢出，但防止无限循环）
            const firstCp = text.codePointAt(0)!
            bytePos = firstCp > 0xffff ? 2 : 1
          } else {
            // 行已有内容且下一个字符放不下——结束当前行，
            // 将整个块重新排队到新行
            newLines.push(cur)
            queue.unshift([style, text])
            cur = []
            curW = 0
            continue
          }
        }
        cur.push([style, text.slice(0, bytePos)])
        newLines.push(cur)
        queue.unshift([style, text.slice(bytePos)])
        cur = []
        curW = 0
      }
    }
    newLines.push(cur)
  }
  h.lines = newLines

  // 填充已更改的行，使背景延伸到边缘
  if (h.marker && h.marker !== ' ') {
    const bg = lineBackground(h.marker, theme)
    const padStyle: Style = { foreground: theme.foreground, background: bg }
    for (const line of h.lines) {
      const curW = line.reduce((s, [, t]) => s + stringWidth(t), 0)
      if (curW < width) {
        line.push([padStyle, ' '.repeat(width - curW)])
      }
    }
  }
}

function addLineNumber(
  h: Highlight,
  theme: Theme,
  maxDigits: number,
  fullDim: boolean,
): void {
  const style: Style = {
    foreground: h.marker ? decorationColor(h.marker, theme) : theme.foreground,
    background: h.marker ? lineBackground(h.marker, theme) : theme.background,
  }
  const shouldDim = h.marker === null || h.marker === ' '
  for (let i = 0; i < h.lines.length; i++) {
    // 防御性检查：如果条目未正确初始化，lineNumber 可能为 undefined
    const lineNum = h.lineNumber ?? 0
    const prefix =
      i === 0
        ? ` ${String(lineNum).padStart(maxDigits)} `
        : ' '.repeat(maxDigits + 2)
    const wrapped = shouldDim && !fullDim ? `${DIM}${prefix}${UNDIM}` : prefix
    h.lines[i]!.unshift([style, wrapped])
  }
}

function addMarker(h: Highlight, theme: Theme): void {
  // 防御性检查：marker 应始终为 '+' | '-' | ' '
  // 防止 undefined 值导致该词出现在 diff 输出中
  if (!h.marker || h.marker === undefined) return
  const style: Style = {
    foreground: decorationColor(h.marker, theme),
    background: lineBackground(h.marker, theme),
  }
  for (const line of h.lines) {
    line.unshift([style, h.marker as string])
  }
}

function dimContent(h: Highlight): void {
  for (const line of h.lines) {
    if (line.length > 0) {
      line[0]![1] = DIM + line[0]![1]
      const last = line.length - 1
      line[last]![1] = line[last]![1] + UNDIM
    }
  }
}

function applyBackground(h: Highlight, theme: Theme, ranges: Range[]): void {
  if (!h.marker) return
  const lineBg = lineBackground(h.marker, theme)
  const wordBg = wordBackground(h.marker, theme)

  let rangeIdx = 0
  let byteOff = 0
  for (let li = 0; li < h.lines.length; li++) {
    const newLine: Block[] = []
    for (const [style, text] of h.lines[li]!) {
      const textStart = byteOff
      const textEnd = byteOff + text.length

      while (rangeIdx < ranges.length && ranges[rangeIdx]!.end <= textStart) {
        rangeIdx++
      }
      if (rangeIdx >= ranges.length) {
        newLine.push([{ ...style, background: lineBg }, text])
        byteOff = textEnd
        continue
      }

      let remaining = text
      let pos = textStart
      while (remaining.length > 0 && rangeIdx < ranges.length) {
        const r = ranges[rangeIdx]!
        const inRange = pos >= r.start && pos < r.end
        let next: number
        if (inRange) {
          next = Math.min(r.end, textEnd)
        } else if (r.start > pos && r.start < textEnd) {
          next = r.start
        } else {
          next = textEnd
        }
        const segLen = next - pos
        const seg = remaining.slice(0, segLen)
        newLine.push([{ ...style, background: inRange ? wordBg : lineBg }, seg])
        remaining = remaining.slice(segLen)
        pos = next
        if (pos >= r.end) rangeIdx++
      }
      if (remaining.length > 0) {
        newLine.push([{ ...style, background: lineBg }, remaining])
      }
      byteOff = textEnd
    }
    h.lines[li] = newLine
  }
}

function intoLines(
  h: Highlight,
  dim: boolean,
  skipBg: boolean,
  mode: ColorMode,
): string[] {
  return h.lines.map(line => asTerminalEscaped(line, mode, skipBg, dim))
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

function maxLineNumber(hunk: Hunk): number {
  const oldEnd = Math.max(0, hunk.oldStart + hunk.oldLines - 1)
  const newEnd = Math.max(0, hunk.newStart + hunk.newLines - 1)
  return Math.max(oldEnd, newEnd)
}

function parseMarker(s: string): Marker {
  return s === '+' || s === '-' ? s : ' '
}

export class ColorDiff {
  private hunk: Hunk
  private filePath: string
  private firstLine: string | null
  private prefixContent: string | null

  constructor(
    hunk: Hunk,
    firstLine: string | null,
    filePath: string,
    prefixContent?: string | null,
  ) {
    this.hunk = hunk
    this.filePath = filePath
    this.firstLine = firstLine
    this.prefixContent = prefixContent ?? null
  }

  render(themeName: string, width: number, dim: boolean): string[] | null {
    const mode = detectColorMode(themeName)
    const theme = buildTheme(themeName, mode)
    const lang = detectLanguage(this.filePath, this.firstLine)
    const hlState = { lang, stack: null }

    // 用前缀行预热高亮器（highlight.js 每次调用无状态，
    // 因此目前这是空操作——为 API 兼容性保留）
    void this.prefixContent

    const maxDigits = String(maxLineNumber(this.hunk)).length
    let oldLine = this.hunk.oldStart
    let newLine = this.hunk.newStart
    const effectiveWidth = Math.max(1, width - maxDigits - 2 - 1)

    // 第一遍：分配标记 + 行号
    type Entry = { lineNumber: number; marker: Marker; code: string }
    const entries: Entry[] = this.hunk.lines.map(rawLine => {
      const marker = parseMarker(rawLine.slice(0, 1))
      const code = rawLine.slice(1)
      let lineNumber: number
      switch (marker) {
        case '+':
          lineNumber = newLine++
          break
        case '-':
          lineNumber = oldLine++
          break
        case ' ':
          lineNumber = newLine
          oldLine++
          newLine++
          break
      }
      return { lineNumber, marker, code }
    })

    // 单词差异范围（dim 时跳过——太嘈杂）
    const ranges: Range[][] = entries.map(() => [])
    if (!dim) {
      const markers = entries.map(e => e.marker)
      for (const [delIdx, addIdx] of findAdjacentPairs(markers)) {
        const [delR, addR] = wordDiffStrings(
          entries[delIdx]!.code,
          entries[addIdx]!.code,
        )
        ranges[delIdx] = delR
        ranges[addIdx] = addR
      }
    }

    // 第二遍：高亮 + 转换流水线
    const out: string[] = []
    for (let i = 0; i < entries.length; i++) {
      const { lineNumber, marker, code } = entries[i]!
      const tokens: Block[] =
        marker === '-'
          ? [[defaultStyle(theme), code]]
          : highlightLine(hlState, code, theme)

      const h: Highlight = { marker, lineNumber, lines: [tokens] }
      removeNewlines(h)
      applyBackground(h, theme, ranges[i]!)
      wrapText(h, effectiveWidth, theme)
      if (mode === 'ansi' && marker === '-') {
        dimContent(h)
      }
      addMarker(h, theme)
      addLineNumber(h, theme, maxDigits, dim)
      out.push(...intoLines(h, dim, false, mode))
    }
    return out
  }
}

export class ColorFile {
  private code: string
  private filePath: string

  constructor(code: string, filePath: string) {
    this.code = code
    this.filePath = filePath
  }

  render(themeName: string, width: number, dim: boolean): string[] | null {
    const mode = detectColorMode(themeName)
    const theme = buildTheme(themeName, mode)
    // Rust 的 .lines() 会丢弃末尾 \n 带来的空白行
    const lang = detectLanguage(this.filePath, firstLine)
    const hlState = { lang, stack: null }

    const maxDigits = String(lines.length).length
    const effectiveWidth = Math.max(1, width - maxDigits - 2)

    const out: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const tokens = highlightLine(hlState, lines[i]!, theme)
      const h: Highlight = { marker: null, lineNumber: i + 1, lines: [tokens] }
      removeNewlines(h)
      wrapText(h, effectiveWidth, theme)
      addLineNumber(h, theme, maxDigits, dim)
      out.push(...intoLines(h, dim, true, mode))
    }
    return out
  }
}

export function getSyntaxTheme(themeName: string): SyntaxTheme {
  // highlight.js 没有 bat 主题集，因此环境变量无法选择替代的
  // syntect 主题。我们仍然在设置时报告环境变量，用于诊断。
  const envTheme =
    process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT ?? process.env.BAT_THEME
  void envTheme
  return { theme: defaultSyntaxThemeName(themeName), source: null }
}

// 懒加载器，与 vendor/color-diff-src/index.ts API 匹配
let cachedModule: NativeModule | null = null

export function getNativeModule(): NativeModule | null {
  if (cachedModule) return cachedModule
  cachedModule = { ColorDiff, ColorFile, getSyntaxTheme }
  return cachedModule
}

export type { ColorDiff as ColorDiffClass, ColorFile as ColorFileClass }

// 为测试导出
export const __test = {
  tokenize,
  findAdjacentPairs,
  wordDiffStrings,
  ansi256FromRgb,
  colorToEscape,
  detectColorMode,
  detectLanguage,
}
