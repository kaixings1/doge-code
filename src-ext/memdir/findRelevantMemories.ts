import { feature } from 'bun:bundle'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { getDefaultSonnetModel } from '../utils/model/model.js'
import { sideQuery } from '../utils/sideQuery.js'
import { jsonParse } from '../utils/slowOperations.js'
import {
  formatMemoryManifest,
  type MemoryHeader,
  scanMemoryFiles,
} from './memoryScan.js'

export type RelevantMemory = {
  path: string
  mtimeMs: number
}

const SELECT_MEMORIES_SYSTEM_PROMPT = `你正在为 Claude Code 处理用户查询时选择有用的记忆。你将收到用户的查询以及可用记忆文件列表，包括文件名和描述。

返回一个文件名列表，这些记忆将对 Claude Code 处理用户查询明显有用（最多 5 个）。仅包含你确信会有帮助的记忆，基于它们的名称和描述。
- 如果不确定某个记忆在处理用户查询时是否有用，请不要将其包含在列表中。要严格筛选。
- 如果列表中没有明显有用的记忆，可以返回空列表。
- 如果提供了最近使用的工具列表，请不要选择那些工具的用法参考或 API 文档的记忆（Claude Code 已经在使用它们）。但仍然应该选择包含警告、陷阱或已知问题的记忆——活跃使用时正是这些最有价值。
`

/**
 * 通过扫描记忆文件头部并请求 Sonnet 选择最相关的记忆，查找与查询相关的记忆文件。
 *
 * 返回最相关记忆的绝对文件路径和修改时间（最多 5 个）。
 * 排除 MEMORY.md（已加载到系统提示词中）。
 * mtime 会一并返回，以便调用者无需再次 stat 即可向主模型展示新鲜度。
 *
 * `alreadySurfaced` 用于过滤掉在 Sonnet 调用之前已经展示过的路径，
 * 这样选择器就能将 5 个名额用于新候选者，而不是重复选择会被调用者丢弃的文件。
 */
export async function findRelevantMemories(
  query: string,
  memoryDir: string,
  signal: AbortSignal,
  recentTools: readonly string[] = [],
  alreadySurfaced: ReadonlySet<string> = new Set(),
): Promise<RelevantMemory[]> {
  const memories = (await scanMemoryFiles(memoryDir, signal)).filter(
    m => !alreadySurfaced.has(m.filePath),
  )
  if (memories.length === 0) {
    return []
  }

  const selectedFilenames = await selectRelevantMemories(
    query,
    memories,
    signal,
    recentTools,
  )
  const byFilename = new Map(memories.map(m => [m.filename, m]))
  const selected = selectedFilenames
    .map(filename => byFilename.get(filename))
    .filter((m): m is MemoryHeader => m !== undefined)

  // 即使选择为空也会触发：选择率需要分母，
  // 并且 -1 的年龄可以区分“运行了但未选中”与“从未运行”。
  if (feature('MEMORY_SHAPE_TELEMETRY')) {
     
    const { logMemoryRecallShape } =
      require('./memoryShapeTelemetry.js') as typeof import('./memoryShapeTelemetry.js')
     
    logMemoryRecallShape(memories, selected)
  }

  return selected.map(m => ({ path: m.filePath, mtimeMs: m.mtimeMs }))
}

async function selectRelevantMemories(
  query: string,
  memories: MemoryHeader[],
  signal: AbortSignal,
  recentTools: readonly string[],
): Promise<string[]> {
  const validFilenames = new Set(memories.map(m => m.filename))

  const manifest = formatMemoryManifest(memories)

  // 当 Claude Code 正在积极使用某个工具时（例如 mcp__X__spawn），
  // 展示该工具的参考文档会成为噪音——对话中已经包含其工作用法。
  // 否则选择器可能会基于关键词重叠产生误判（查询中的“spawn”与记忆描述中的“spawn” → 误报）。
  const toolsSection =
    recentTools.length > 0
      ? `\n\n最近使用的工具：${recentTools.join(', ')}`
      : ''

  try {
    const result = await sideQuery({
      model: getDefaultSonnetModel(),
      system: SELECT_MEMORIES_SYSTEM_PROMPT,
      skipSystemPromptPrefix: true,
      messages: [
        {
          role: 'user',
          content: `查询：${query}\n\n可用记忆：\n${manifest}${toolsSection}`,
        },
      ],
      max_tokens: 256,
      output_format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            selected_memories: { type: 'array', items: { type: 'string' } },
          },
          required: ['selected_memories'],
          additionalProperties: false,
        },
      },
      signal,
      querySource: 'memdir_relevance',
    })

    const textBlock = result.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return []
    }

    const parsed: { selected_memories: string[] } = jsonParse(textBlock.text)
    return parsed.selected_memories.filter(f => validFilenames.has(f))
  } catch (e) {
    if (signal.aborted) {
      return []
    }
    logForDebugging(
      `[memdir] selectRelevantMemories 失败：${errorMessage(e)}`,
      { level: 'warn' },
    )
    return []
  }
}