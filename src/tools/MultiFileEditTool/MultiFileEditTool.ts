import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { logForDebugging } from '../../utils/debug.js'
import { expandPath } from '../../utils/path.js'

const inputSchema = z.strictObject({
  operations: z.array(z.strictObject({
    file_path: z.string().describe('要修改的文件的绝对路径'),
    old_string: z.string().describe('要被替换的原始文本'),
    new_string: z.string().describe('替换后的新文本'),
  })).min(1).max(20).describe('要执行的文件编辑操作列表（1-20个）'),
})

type InputSchema = typeof inputSchema

const outputSchema = z.object({
  results: z.array(z.object({
    file_path: z.string(),
    success: z.boolean(),
    error: z.string().nullable(),
  })),
  summary: z.string().describe('编辑结果摘要'),
})

/**
 * MultiFileEditTool - 允许在一次工具调用中编辑多个文件。
 * 类似 Cursor Composer，将多个文件的修改打包为一次原子操作。
 * 优势：减少 API 往返、上下文更清晰、支持跨文件协调修改。
 */
export const MultiFileEditTool: ToolDef<InputSchema, typeof outputSchema> = buildTool({
  name: 'MultiFileEdit',
  description: '在一次调用中编辑多个文件（支持同时修改2-20个文件）。' +
    '适用于需要跨多个文件协调修改的场景，' +
    '例如重命名函数同时更新所有引用、修改接口定义及其所有实现等。' +
    '每个操作使用精确的 old_string 到 new_string 替换。',
  inputSchema,
  outputSchema,
  async *call(args, toolUseContext) {
    const { operations } = args
    const results: Array<{ file_path: string; success: boolean; error: string | null }> = []

    for (const op of operations) {
      try {
        const fullPath = expandPath(op.file_path)
        const { readFileSyncWithMetadata, writeTextContent } = await import('../../utils/file.js')

        const meta = readFileSyncWithMetadata(fullPath)
        if (!meta) {
          results.push({ file_path: op.file_path, success: false, error: '文件不存在' })
          continue
        }

        const content = meta.content
        const oldIdx = content.indexOf(op.old_string)
        if (oldIdx === -1) {
          results.push({ file_path: op.file_path, success: false, error: '未找到匹配的 old_string' })
          continue
        }

        const newContent = content.slice(0, oldIdx) + op.new_string + content.slice(oldIdx + op.old_string.length)
        const enc = meta.encoding ?? 'utf8'
        writeTextContent(fullPath, newContent, enc, 'LF')

        results.push({ file_path: op.file_path, success: true, error: null })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ file_path: op.file_path, success: false, error: msg })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length
    const summary = failCount === 0
      ? `成功编辑 ${successCount} 个文件`
      : `编辑完成：${successCount} 个成功，${failCount} 个失败`

    logForDebugging('MultiFileEdit: ' + summary)

    yield {
      type: 'resource',
      value: {
        results,
        summary,
      },
    }
  },
})
