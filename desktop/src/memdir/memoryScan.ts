/**
 * 记忆目录扫描原语。从 findRelevantMemories.ts 中拆分出来，
 * 以便 extractMemories 可以导入扫描函数而无需引入 sideQuery 和
 * API 客户端链（这曾通过 memdir.ts 形成循环 — #25372）。
 */

import { readdir } from 'fs/promises'
import { basename, join } from 'path'
import { parseFrontmatter } from '../utils/frontmatterParser.js'
import { readFileInRange } from '../utils/readFileInRange.js'
import { type MemoryType, parseMemoryType } from './memoryTypes.js'

export type MemoryHeader = {
  filename: string
  filePath: string
  mtimeMs: number
  description: string | null
  type: MemoryType | undefined
}

const MAX_MEMORY_FILES = 200
const FRONTMATTER_MAX_LINES = 30

/**
 * 扫描记忆目录中的 .md 文件，读取它们的前置元数据，并返回
 * 按最新优先排序的头部列表（上限为 MAX_MEMORY_FILES）。
 * 由 findRelevantMemories（查询时召回）和 extractMemories（预注入
 * 列表，使提取代理无需花费一轮在 `ls` 上）共享。
 *
 * 单遍扫描：readFileInRange 内部进行 stat 并返回 mtimeMs，因此我们
 * 采用"先读后排序"而非"先 stat 再排序再读"。对于常见情况（N ≤ 200），
 * 与分开的 stat 轮次相比，这减少了一半的系统调用；对于大 N，我们
 * 会多读几个小文件，但仍避免了在最终的 200 个文件上进行双重 stat。
 */
export async function scanMemoryFiles(
  memoryDir: string,
  signal: AbortSignal,
): Promise<MemoryHeader[]> {
  try {
    const entries = await readdir(memoryDir, { recursive: true })
    const mdFiles = entries.filter(
      f => f.endsWith('.md') && basename(f) !== 'MEMORY.md',
    )

    const headerResults = await Promise.allSettled(
      mdFiles.map(async (relativePath): Promise<MemoryHeader> => {
        const filePath = join(memoryDir, relativePath)
        const { content, mtimeMs } = await readFileInRange(
          filePath,
          0,
          FRONTMATTER_MAX_LINES,
          undefined,
          signal,
        )
        const { frontmatter } = parseFrontmatter(content, filePath)
        return {
          filename: relativePath,
          filePath,
          mtimeMs,
          description: frontmatter.description || null,
          type: parseMemoryType(frontmatter.type),
        }
      }),
    )

    return headerResults
      .filter(
        (r): r is PromiseFulfilledResult<MemoryHeader> =>
          r.status === 'fulfilled',
      )
      .map(r => r.value)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, MAX_MEMORY_FILES)
  } catch {
    return []
  }
}

/**
 * 将记忆头部格式化为文本清单：每行一个文件，格式为
 * [type] filename (timestamp): description。由召回选择器提示词
 * 和提取代理提示词共同使用。
 */
export function formatMemoryManifest(memories: MemoryHeader[]): string {
  return memories
    .map(m => {
      const tag = m.type ? `[${m.type}] ` : ''
      const ts = new Date(m.mtimeMs).toISOString()
      return m.description
        ? `- ${tag}${m.filename} (${ts}): ${m.description}`
        : `- ${tag}${m.filename} (${ts})`
    })
    .join('\n')
}
