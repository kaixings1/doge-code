/**
 * 后台记忆提取代理的提示模板。
 *
 * 提取代理作为主对话的完美分叉运行——相同的系统提示、相同的消息前缀。
 * 主代理的系统提示始终包含完整的保存指令；当主代理自己写入记忆时，
 * extractMemories.ts 会跳过该轮（hasMemoryWritesSince）。此提示仅在主代理
 * 没有写入时触发，因此这里的保存标准与系统提示无冲突地重叠。
 */

import { feature } from 'bun:bundle'
import {
  MEMORY_FRONTMATTER_EXAMPLE,
  TYPES_SECTION_COMBINED,
  TYPES_SECTION_INDIVIDUAL,
  WHAT_NOT_TO_SAVE_SECTION,
} from '../../memdir/memoryTypes.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../../tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../../tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../../tools/FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../../tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../../tools/GrepTool/prompt.js'

/**
 * 两种提取提示变体共享的开场白。
 */
function opener(newMessageCount: number, existingMemories: string): string {
  const manifest =
    existingMemories.length > 0
      ? `\n\n## 存在记忆文件\n\n${existingMemories}\n\n写入前检查这个列表 — update an existing file rather than creating a duplicate.`
      : ''
  return [
    `你现在担任记忆提取子代理。分析上面最近的 ~${newMessageCount} 条消息，并使用它们来更新你的持久记忆系统。`,
    '',
    `可用工具：${FILE_READ_TOOL_NAME}、${GREP_TOOL_NAME}、${GLOB_TOOL_NAME}、只读 ${BASH_TOOL_NAME}（ls/find/cat/stat/wc/head/tail 等），以及仅限内存目录内的 ${FILE_EDIT_TOOL_NAME}/${FILE_WRITE_TOOL_NAME}。不允许使用 ${BASH_TOOL_NAME} rm。所有其他工具——MCP、Agent、可写 ${BASH_TOOL_NAME} 等——都将被拒绝。`,
    '',
    `你有有限的轮次预算。${FILE_EDIT_TOOL_NAME} 需要先对同一文件调用 ${FILE_READ_TOOL_NAME}，因此高效的策略是：第 1 轮——并行调用所有可能需要更新文件的 ${FILE_READ_TOOL_NAME}；第 2 轮——并行调用所有 ${FILE_WRITE_TOOL_NAME}/${FILE_EDIT_TOOL_NAME}。不要在多轮之间交错读取和写入。`,
    '',
    `你只能使用最近 ~${newMessageCount} 条消息中的内容来更新你的持久记忆。不要浪费任何轮次尝试进一步调查或验证该内容——不要 grep 源文件、不要读取代码来确认模式是否存在、不要执行 git 命令。` +
      manifest,
  ].join('\n')
}

/**
 * 为仅自动记忆（无团队记忆）构建提取提示。
 * 四种分类法，无范围指导（单个目录）。
 */
export function buildExtractAutoOnlyPrompt(
  newMessageCount: number,
  existingMemories: string,
  skipIndex = false,
): string {
  const howToSave = skipIndex
    ? [
        '## 如何保存记忆',
        '',
        '将每条记忆写入单独的文件（例如 `user_role.md`、`feedback_testing.md`），使用以下 frontmatter 格式:',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '- 按主题语义组织记忆，而非按时间顺序',
        '- 更新或删除发现错误或过时的记忆',
        '- 不要写入重复的记忆。在写入新记忆之前，先检查是否有可更新的现有记忆。',
      ]
    : [
        '## 如何保存记忆',
        '',
        '保存记忆分两步进行:',
        '',
        '**第一步** — 将记忆写入单独的文件（例如 `user_role.md`、`feedback_testing.md`），使用以下 frontmatter 格式:',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '- 按主题语义组织记忆，而非按时间顺序',
        '- 更新或删除发现错误或过时的记忆',
        '- 不要写入重复的记忆。在写入新记忆之前，先检查是否有可更新的现有记忆。',
        '**第二步** — 在 `MEMORY.md` 中添加指向该文件的指针。`MEMORY.md` 是一个索引，不是记忆——每条应该是一行，约 150 字符以内: `- [标题](file.md) — 一行简介`。它没有 frontmatter。切勿将记忆内容直接写入 `MEMORY.md`。',
        '',
        '- `MEMORY.md` 始终会加载到你的系统提示中——200 行之后的内容将被截断，因此请保持索引简洁',
        '- 按主题语义组织记忆，而非按时间顺序',
        '- 更新或删除发现错误或过时的记忆',
        '- 不要写入重复的记忆。在写入新记忆之前，先检查是否有可更新的现有记忆。',
      ]

  return [
    opener(newMessageCount, existingMemories),
    '',
    '如果用户明确要求你记住某些内容，请立即将其保存为最合适的类型。如果用户要求你忘记某些内容，请查找并删除相关条目。',
    '',
    ...TYPES_SECTION_INDIVIDUAL,
    ...WHAT_NOT_TO_SAVE_SECTION,
    '',
    ...howToSave,
  ].join('\n')
}

/**
 * 为自动 + 团队组合记忆构建提取提示。
 * 四种分类法，每种类型都有 <scope> 指导（目录选择
 * 已嵌入到每个类型块中，不需要单独的路由部分）。
 */
export function buildExtractCombinedPrompt(
  newMessageCount: number,
  existingMemories: string,
  skipIndex = false,
): string {
  if (!feature('TEAMMEM')) {
    return buildExtractAutoOnlyPrompt(
      newMessageCount,
      existingMemories,
      skipIndex,
    )
  }

  const howToSave = skipIndex
    ? [
        '## 如何保存记忆',
        '',
        '将每条记忆写入所选目录（私人或团队，根据类型的范围指引）中的单独文件，使用以下 frontmatter 格式:',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '- 按主题语义组织记忆，而非按时间顺序',
        '- 更新或删除发现错误或过时的记忆',
        '- 不要写入重复的记忆。在写入新记忆之前，先检查是否有可更新的现有记忆。',
      ]
    : [
        '## 如何保存记忆',
        '',
        '保存记忆分两步进行:',
        '',
        '**第一步** — 将记忆写入所选目录（私人或团队，根据类型的范围指引）中的单独文件，使用以下 frontmatter 格式:',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '**第二步** — 在同一目录的 `MEMORY.md` 中添加指向该文件的指针。每个目录（私人和团队）都有自己的 `MEMORY.md` 索引 — 每行一个条目，约 150 字符以内: `- [标题](file.md) — 一行简介`。它们没有 frontmatter。切勿将记忆内容直接写入 `MEMORY.md`。',
        '',
        '- 两个 `MEMORY.md` 索引都会加载到你的系统提示中 — 200 行之后的内容将被截断，因此请保持简洁',
        '- 按主题语义组织记忆，而非按时间顺序',
        '- 更新或删除发现错误或过时的记忆',
        '- 不要写入重复的记忆。在写入新记忆之前，先检查是否有可更新的现有记忆。',
      ]

  return [
    opener(newMessageCount, existingMemories),
    '',
    '如果用户明确要求你记住某些内容，请立即将其保存为最合适的类型。如果用户要求你忘记某些内容，请查找并删除相关条目。',
    '',
    ...TYPES_SECTION_COMBINED,
    ...WHAT_NOT_TO_SAVE_SECTION,
    '- 你必须避免在共享团队记忆中保存敏感数据。例如，绝不要保存 API 密钥或用户凭证。',
    '',
    ...howToSave,
  ].join('\n')
}
