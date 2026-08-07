/**
 * glossary.ts — 项目术语表加载器
 *
 * 扫描 `.doge/glossary/*.md` 文件，解析术语定义并返回结构化映射。
 * 术语表用于在 system prompt 中注入项目特定术语，帮助 AI 理解领域词汇。
 *
 * 格式规范（每个 .md 文件）：
 * - `# 术语名` — 术语标题（heading level 1）
 * - 正文内容 — 术语定义（第一个空行之前的内容）
 * - 支持多个术语定义
 * - 忽略非 heading 1 的标题
 */

import { memoize } from '../vendor/lodash.js'
import { logError } from './log.js'
import { getCwd } from './cwd.js'
import { isEnvTruthy } from './envUtils.js'

const GLOSSARY_DIR = '.doge/glossary'

export interface GlossaryEntry {
  term: string
  definition: string
}

/**
 * 从 markdown 内容中解析术语表条目
 */
function parseGlossaryEntries(content: string): GlossaryEntry[] {
  const entries: GlossaryEntry[] = []
  const lines = content.split('\n')
  let currentTerm: string | null = null
  let currentDefinition: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^#\s+(.+)$/)
    if (headingMatch) {
      // 保存上一个条目
      if (currentTerm) {
        const def = currentDefinition.join('\n').trim()
        if (def) {
          entries.push({ term: currentTerm, definition: def })
        }
      }
      currentTerm = headingMatch[1].trim()
      currentDefinition = []
    } else if (currentTerm) {
      currentDefinition.push(line)
    }
  }

  // 保存最后一个条目
  if (currentTerm) {
    const def = currentDefinition.join('\n').trim()
    if (def) {
      entries.push({ term: currentTerm, definition: def })
    }
  }

  return entries
}

/**
 * 扫描 glossary 目录，加载所有 .md 文件
 */
async function loadGlossaryFiles(): Promise<GlossaryEntry[]> {
  const fs = await import('fs')
  const path = await import('path')

  const glossaryPath = path.resolve(getCwd(), GLOSSARY_DIR)

  try {
    const entries = await fs.promises.readdir(glossaryPath)
    const mdFiles = entries.filter((f) => f.endsWith('.md'))

    const allEntries: GlossaryEntry[] = []
    for (const file of mdFiles) {
      const filePath = path.join(glossaryPath, file)
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8')
        const parsed = parseGlossaryEntries(content)
        allEntries.push(...parsed)
      } catch (err) {
        logError(err as Error)
      }
    }

    return allEntries
  } catch {
    // 目录不存在或无读取权限，返回空
    return []
  }
}

/**
 * 将术语表条目转换为 `{[term: string]: string}` 映射
 */
function entriesToMap(entries: GlossaryEntry[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entry of entries) {
    map[entry.term] = entry.definition
  }
  return map
}

/**
 * 返回项目术语表映射（memoized）
 *
 * 每个会话期间只读取一次，避免重复 I/O。
 */
export const getGlossary = memoize(async (): Promise<Record<string, string>> => {
  if (process.env.NODE_ENV === 'test') {
    return {}
  }

  const entries = await loadGlossaryFiles()
  return entriesToMap(entries)
})

/**
 * 检查项目是否有术语表文件
 */
export async function hasGlossary(): Promise<boolean> {
  const fs = await import('fs')
  const path = await import('path')

  const glossaryPath = path.resolve(getCwd(), GLOSSARY_DIR)

  try {
    const entries = await fs.promises.readdir(glossaryPath)
    return entries.some((f) => f.endsWith('.md'))
  } catch {
    return false
  }
}

/**
 * 格式化术语表为可读文本（用于 debug 或 UI 展示）
 */
export function formatGlossary(map: Record<string, string>): string {
  const lines: string[] = []
  for (const [term, definition] of Object.entries(map)) {
    lines.push(`# ${term}\n${definition}`)
  }
  return lines.join('\n\n')
}
