/**
 * engine/testDrivenFix/patchParser.ts — edit_file 命令解析与补丁应用
 *
 * 吸收自 Agentless (agentless/util/postprocess_data.py)：
 *   - split_edit_multifile_commands：按文件分组 edit_file 命令
 *   - parse_edit_commands：按行号倒序应用（避免行号偏移）
 *   - parse_diff_edit_commands：SEARCH/REPLACE diff 应用
 *
 * LLM 生成格式（与 Agentless 一致）：
 *   edit_file(filename, start, end, content)
 *   - start/end 为 1-based 行号（含）
 *   - content 为要替换的完整文本（保持缩进）
 */

import type { EditCommand, PatchResult } from './types.js'

// ============================================================================
// 代码块提取
// ============================================================================

/** 提取 ```python 代码块内容 */
export function extractPythonBlocks(text: string): string[] {
  const pattern = /```python\n(.*?)\n```/gs
  const matches: string[] = []
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text)) !== null) {
    matches.push(m[1])
  }
  return matches
}

/** 提取任意 ``` 代码块内容 */
export function extractCodeBlocks(text: string): string[] {
  const pattern = /```\n(.*?)\n```/gs
  const matches: string[] = []
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text)) !== null) {
    matches.push(m[1])
  }
  if (matches.length === 0 && text.includes('```')) {
    return [text.split('```', 2)[1]?.trim() ?? '']
  }
  return matches
}

// ============================================================================
// edit_file 命令解析
// ============================================================================

interface RawSubcommand {
  /** edit_file( 之后的原始文本，含 file 前缀时 file 在前 */
  raw: string
  file?: string
  start: number
  end: number
  content: string
}

/**
 * 从 LLM 输出中提取并解析 edit_file 命令。
 *
 * 支持三种格式：
 *   edit_file(start, end, content)                       — 单文件
 *   edit_file('file.py', start, end, content)            — 带文件名
 *   edit_file("file.py", start, end, content)            — 带文件名（双引号）
 */
export function parseEditCommands(rawOutput: string): EditCommand[] {
  const blocks = extractPythonBlocks(rawOutput)
  if (blocks.length === 0) {
    // 兜底：直接在整个输出中查找 edit_file(
    const direct = extractEditFileCalls(rawOutput)
    return direct
  }

  const commands: EditCommand[] = []
  for (const block of blocks) {
    commands.push(...extractEditFileCalls(block))
  }
  return commands
}

function extractEditFileCalls(text: string): EditCommand[] {
  const result: EditCommand[] = []
  // 匹配 edit_file( 调用，支持嵌套引号的内容
  const segments = text.split('edit_file(')
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    // 找到匹配的右括号（考虑字符串内的括号）
    const endIdx = findMatchingParen(seg)
    if (endIdx === -1) continue
    const args = seg.slice(0, endIdx)

    const parsed = parseEditFileArgs(args)
    if (parsed) result.push(parsed)
  }
  return result
}

/**
 * 找到从字符串开头起的匹配右括号索引（跳过引号内内容）。
 * 注意：输入是 edit_file( 之后的部分，开括号已被 split 掉，depth 从 1 起。
 */
function findMatchingParen(s: string): number {
  let depth = 1
  let quote: string | null = null
  let escape = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quote) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
    } else if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** 解析 edit_file 参数：兼容 (file, start, end, content) 与 (start, end, content) */
function parseEditFileArgs(args: string): EditCommand | null {
  // 分割参数（尊重引号）
  const parts = splitArgs(args)
  if (parts.length === 3) {
    // (start, end, content)
    const start = parseInt(parts[0].trim(), 10)
    const end = parseInt(parts[1].trim(), 10)
    if (Number.isNaN(start) || Number.isNaN(end)) return null
    return { file: '', start, end, content: unquote(parts[2].trim()) }
  }
  if (parts.length === 4) {
    // (file, start, end, content)
    const file = unquote(parts[0].trim())
    const start = parseInt(parts[1].trim(), 10)
    const end = parseInt(parts[2].trim(), 10)
    if (!file || Number.isNaN(start) || Number.isNaN(end)) return null
    return { file, start, end, content: unquote(parts[3].trim()) }
  }
  return null
}

/** 按顶层逗号分割参数（忽略引号内逗号） */
function splitArgs(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let escape = false
  let current = ''
  for (const ch of s) {
    if (quote) {
      current += ch
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      current += ch
    } else if (ch === '(') {
      depth++
      current += ch
    } else if (ch === ')') {
      depth--
      current += ch
    } else if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current)
  return parts
}

/** 去除字符串包裹（支持 'x' "x" '''x''' 与转义） */
function unquote(s: string): string {
  if (s.length >= 6 && (s.startsWith("'''") && s.endsWith("'''"))) {
    return s.slice(3, -3)
  }
  if (s.length >= 6 && s.startsWith('"""') && s.endsWith('"""')) {
    return s.slice(3, -3)
  }
  if (s.length >= 2 && (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\'/g, "'")
  }
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"')
  }
  return s
}

// ============================================================================
// 补丁应用
// ============================================================================

/**
 * 应用 edit_file 命令到文件内容。
 * 按行号倒序应用（从文件末尾开始），保证行号不偏移。
 *
 * @param commands 命令列表（同一文件）
 * @param content  原文件内容
 */
export function applyEditCommands(commands: EditCommand[], content: string): string {
  // 去重（保留首次出现）
  const seen = new Set<string>()
  const unique = commands.filter((c) => {
    const key = `${c.start}-${c.end}-${c.content}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 按 start 倒序排序（先改后面的行）
  const sorted = [...unique].sort((a, b) => b.start - a.start)

  let lines = content.split('\n')
  for (const cmd of sorted) {
    const start = Math.max(1, cmd.start)
    const end = Math.max(start, cmd.end)
    if (start > lines.length) continue

    // 替换 lines[start-1 .. end-1]（含）为 content
    const newLines = cmd.content.split('\n')

    // 空 content → 删除行；无 newline 结束的空行处理
    let replacement = newLines
    if (cmd.content === '') {
      // 删除 start..end 行
      replacement = []
    }

    // 缩进修正：单行替换且无缩进时，继承上一行缩进
    if (
      start === end &&
      replacement.length === 1 &&
      (replacement[0]?.trim().length ?? 0) > 0 &&
      replacement[0]?.charAt(0) !== ' ' &&
      replacement[0]?.charAt(0) !== '\t' &&
      start > 1 &&
      start - 1 <= lines.length
    ) {
      const prevLine = lines[start - 2] ?? ''
      const indent = prevLine.match(/^[\t ]*/)?.[0] ?? ''
      replacement[0] = indent + replacement[0]
    }

    const head = lines.slice(0, start - 1)
    const tail = lines.slice(end)
    // 保持行尾风格：如果原文件以 \n 结尾且 content 不以 \n 结尾，补上
    lines = [...head, ...replacement, ...tail]
  }

  return lines.join('\n')
}

/**
 * 应用多文件的 edit_file 命令，返回 PatchResult。
 */
export function applyPatch(
  commands: EditCommand[],
  fileContents: Record<string, string>,
): PatchResult {
  // 按文件分组
  const byFile = new Map<string, EditCommand[]>()
  for (const cmd of commands) {
    const key = cmd.file || '__root__'
    const list = byFile.get(key) ?? []
    list.push(cmd)
    byFile.set(key, list)
  }

  const result: PatchResult = {
    editedFiles: [],
    contents: [],
    appliedCount: 0,
    failedCommands: [],
  }

  for (const [file, cmds] of byFile) {
    const resolved = file === '__root__' ? '' : file
    let content: string | undefined
    if (resolved) {
      content = fileContents[resolved]
    } else if (Object.keys(fileContents).length === 1) {
      content = Object.values(fileContents)[0]
    }
    if (content === undefined) {
      for (const c of cmds) {
        result.failedCommands.push({ command: c, reason: `文件不存在: ${resolved}` })
      }
      continue
    }

    try {
      const newContent = applyEditCommands(cmds, content)
      result.appliedCount += cmds.length
      result.editedFiles.push(resolved)
      result.contents.push({ file: resolved, old: content, new: newContent })
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      for (const c of cmds) {
        result.failedCommands.push({ command: c, reason })
      }
    }
  }

  return result
}

// ============================================================================
// SEARCH/REPLACE diff 应用（吸收自 Agentless parse_diff_edit_commands）
// ============================================================================

/**
 * 应用 SEARCH/REPLACE diff 格式：
 *   ### file.py
 *   <<<<<<< SEARCH
 *   original lines
 *   =======
 *   replace lines
 *   >>>>>>> REPLACE
 *
 * 支持 ... 通配（原 Agentless 的 parse_for_threedots）
 */
export function applyDiffFormat(rawOutput: string, fileContents: Record<string, string>): PatchResult {
  // 分割各文件的 SEARCH/REPLACE 块
  const result: PatchResult = {
    editedFiles: [],
    contents: [],
    appliedCount: 0,
    failedCommands: [],
  }

  // 按文件提取
  const fileBlocks = extractDiffBlocks(rawOutput)
  for (const [file, blocks] of fileBlocks) {
    const content = fileContents[file]
    if (content === undefined) {
      for (const b of blocks) {
        result.failedCommands.push({
          command: { file, start: 1, end: 1, content: b.replace },
          reason: `文件不存在: ${file}`,
        })
      }
      continue
    }

    let newContent = content
    let applied = 0
    for (const b of blocks) {
      const orig = b.search
      const repl = b.replace
      let { search: o, replace: r } = normalizeThreeDots(orig, repl)

      if (o.includes('...')) {
        // 简化：... 表示多行任意内容 → 用正则匹配
        const pattern = escapeForRegex(o).replace(/\n\.\.\.\n/g, '[\\s\\S]*?')
        const re = new RegExp(pattern)
        if (re.test(newContent)) {
          newContent = newContent.replace(re, r)
          applied++
        }
      } else if (newContent.includes(o)) {
        newContent = newContent.replace(o, r)
        applied++
      }
    }

    if (applied > 0) {
      result.appliedCount += applied
      result.editedFiles.push(file)
      result.contents.push({ file, old: content, new: newContent })
    }
  }

  return result
}

interface DiffBlock {
  file: string
  search: string
  replace: string
}

/** 从 raw 输出中提取 SEARCH/REPLACE 块，按文件分组 */
function extractDiffBlocks(raw: string): Map<string, DiffBlock[]> {
  const result = new Map<string, DiffBlock[]>()
  // 匹配: 文件头 + SEARCH...======...REPLACE
  const blockRe = /###?\s+([^\n]+)\n<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(raw)) !== null) {
    const file = m[1].trim()
    const search = m[2]
    const replace = m[3]
    const list = result.get(file) ?? []
    list.push({ file, search, replace })
    result.set(file, list)
  }
  return result
}

/** 处理 ... 通配符（吸收自 Agentless parse_for_threedots） */
function normalizeThreeDots(
  original: string,
  replace: string,
): { search: string; replace: string } {
  let o = original
  let r = replace

  // replace 以 "...\n" 开头 → 去掉（... 仅示意省略）
  if (r.startsWith('...\n')) r = r.slice(4)

  // original 以 "...\n" 开头 → 去掉（仅保留后续内容）
  if (o.startsWith('...\n')) o = o.slice(4)

  return { search: o, replace: r }
}

/** 转义正则特殊字符（保留换行为 \n） */
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
