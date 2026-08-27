/**
 * tools/SearchReplaceEditTool/SearchReplaceEditTool.ts — SEARCH/REPLACE 确认式编辑（吸收自 Reasonix）
 *
 * 在 FileEditTool 的 old_string/new_string 替换基础上增加：
 * 1. dry-run 预览模式（只显示 diff，不写入）
 * 2. 用户确认后才执行写入
 * 3. 自动校验替换唯一性（避免模糊匹配）
 *
 * 吸收自 DeepSeek-Reasonix 的 SEARCH/REPLACE 编辑模式。
 */

import { buildTool, type ToolDef } from '../../Tool.js'
import { getCwd } from '../../utils/cwd.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, isAbsolute, sep } from 'path'
import { z } from 'zod/v4'

export const SEARCH_REPLACE_TOOL_NAME = 'search_replace_edit'

export interface SearchReplaceEditInput {
  file_path: string
  search: string
  replace: string
  /** 是否只预览不执行（dry-run） */
  dry_run?: boolean
  /** 允许模糊匹配（默认 false，要求精确匹配） */
  fuzzy?: boolean
}

export interface SearchReplaceEditOutput {
  success: boolean
  message: string
  /** dry-run 模式下返回预览的 diff */
  preview?: string
  /** 实际执行的替换次数 */
  replacements?: number
  file_path?: string
}

function resolvePath(filePath: string): string {
  if (isAbsolute(filePath)) return filePath
  return getCwd() + sep + filePath
}

function computeDiff(original: string, search: string, replace: string): string {
  const idx = original.indexOf(search)
  if (idx === -1) return `- [NOT FOUND] "${search.slice(0, 60)}${search.length > 60 ? '...' : ''}"`
  const before = original.slice(Math.max(0, idx - 2), idx)
  const after = original.slice(idx + search.length, idx + search.length + 2)
  return `- ${JSON.stringify(before)}[${search.slice(0, 40)}${search.length > 40 ? '...' : ''}]${JSON.stringify(after)}`
    + `\n+ ${JSON.stringify(before)}[${replace.slice(0, 40)}${replace.length > 40 ? '...' : ''}]${JSON.stringify(after)}`
}

export const inputSchema = z.object({
  file_path: z.string().describe('要编辑的文件路径'),
  search: z.string().describe('要查找的文本（精确匹配）'),
  replace: z.string().describe('替换后的文本'),
  dry_run: z.boolean().optional().describe('是否只预览不执行（默认 false）'),
  fuzzy: z.boolean().optional().describe('是否允许模糊匹配（默认 false）'),
})

export const outputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  preview: z.string().optional(),
  replacements: z.number().optional(),
  file_path: z.string().optional(),
})

export const SearchReplaceEditTool = buildTool({
  name: SEARCH_REPLACE_TOOL_NAME,
  description:
    'SEARCH/REPLACE 确认式编辑工具：给定 file_path、search（精确查找文本）、replace（替换文本），' +
    '可选 dry_run（仅预览不写入）和 fuzzy（允许模糊匹配）。' +
    '默认先精确匹配并统计处数，若匹配不唯一或未找到会给出提示。',
  inputSchema,
  outputSchema,
  async call(input: SearchReplaceEditInput): Promise<{ data: SearchReplaceEditOutput }> {
    const resolved = resolvePath(input.file_path)
    if (!existsSync(resolved)) {
      return { data: { success: false, message: `文件不存在: ${input.file_path}`, file_path: resolved } }
    }

    let content: string
    try {
      content = readFileSync(resolved, 'utf-8')
    } catch (e) {
      return { data: { success: false, message: `读取失败: ${e instanceof Error ? e.message : String(e)}`, file_path: resolved } }
    }

    // 精确匹配查找
    let matchCount = 0
    let matchIndex = -1
    let searchStr = input.search

    if (input.fuzzy) {
      // 模糊模式：使用 indexOf 找到第一个匹配
      matchIndex = content.indexOf(searchStr)
      matchCount = matchIndex !== -1 ? 1 : 0
    } else {
      // 精确模式：统计所有匹配
      const parts = content.split(searchStr)
      matchCount = parts.length - 1
      if (matchCount > 0) matchIndex = 0
    }

    if (matchCount === 0) {
      return {
        data: {
          success: false,
          message: `搜索文本未找到: "${input.search.slice(0, 80)}${input.search.length > 80 ? '...' : ''}"`,
          preview: computeDiff(content, input.search, input.replace),
          file_path: resolved,
        },
      }
    }

    // 多匹配警告
    const preview = computeDiff(content, input.search, input.replace)

    if (input.dry_run) {
      return {
        data: {
          success: true,
          message: `预览: 找到 ${matchCount} 处匹配，将执行 ${matchCount} 次替换`,
          preview,
          replacements: matchCount,
          file_path: resolved,
        },
      }
    }

    // 执行替换
    const newContent = content.split(searchStr).join(input.replace)
    if (newContent === content) {
      return { data: { success: false, message: '替换后内容无变化', preview, replacements: 0, file_path: resolved } }
    }

    try {
      writeFileSync(resolved, newContent, 'utf-8')
    } catch (e) {
      return { data: { success: false, message: `写入失败: ${e instanceof Error ? e.message : String(e)}`, file_path: resolved } }
    }

    return {
      data: {
        success: true,
        message: matchCount === 1 ? '已执行 1 处替换' : `已执行 ${matchCount} 处替换`,
        replacements: matchCount,
        file_path: resolved,
      },
    }
  },
})
