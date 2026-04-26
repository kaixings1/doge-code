import { readFile } from 'fs/promises'
import { join } from 'path'
import { roughTokenCountEstimation } from '../../services/tokenEstimation.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getErrnoCode, toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'

const MAX_SECTION_LENGTH = 2000
const MAX_TOTAL_SESSION_MEMORY_TOKENS = 12000

export const DEFAULT_SESSION_MEMORY_TEMPLATE = `
# 会话标题
_简短而独特的 5-10 个词的描述性标题。信息密度高，无赘述_

# 当前状态
_当前正在处理什么？尚未完成的待办任务。下一步骤。_

# 任务说明
_用户要求构建什么？任何设计决策或其他解释性背景_

# 文件与函数
_重要文件有哪些？简述其内容及为何相关？_

# 工作流
_通常按什么顺序运行哪些 bash 命令？如何解读其输出（若不明显）？_

# 错误与纠正
_遇到的错误及如何修复。用户纠正了什么？哪些方法失败且不应再尝试？_

# 代码库与系统文档
_重要系统组件有哪些？它们如何工作/协同？_

# 经验教训
_哪些做法效果良好？哪些不佳？应避免什么？不要与其他部分重复_

# 关键成果
_若用户要求了特定输出（如问题答案、表格或其他文档），在此处重复确切结果_

# 工作日志
_逐步记录尝试和完成的工作。每一步非常简略的摘要_
`

function getDefaultUpdatePrompt(): string {
  return `重要提示：此消息和这些指令并非用户实际对话的一部分。请勿在笔记内容中包含任何对“记笔记”、“会话笔记提取”或这些更新指令的引用。

基于上述用户对话（排除此记笔记指令消息、系统提示、claude.md 条目或任何过往会话摘要），更新会话笔记文件。

文件 {{notesPath}} 已为你读取。其当前内容如下：
<current_notes_content>
{{currentNotes}}
</current_notes_content>

你的唯一任务是使用 Edit 工具更新笔记文件，然后停止。你可以进行多次编辑（按需更新每个部分）——在一条消息中并行发起所有 Edit 工具调用。不要调用任何其他工具。

编辑的关键规则：
- 文件必须保持其精确结构，所有部分、标题和斜体描述均保持不变
-- 绝不要修改、删除或添加章节标题（以 '#' 开头的行，如 # 任务说明）
-- 绝不要修改或删除斜体 _章节描述_ 行（这些是紧随每个标题后的斜体行，以下划线开头和结尾）
-- 斜体 _章节描述_ 是必须原样保留的模板指令——它们指示各章节应放置的内容类型
-- 仅更新每个现有章节内、斜体 _章节描述_ 行下方的实际内容
-- 不要在现有结构之外添加任何新章节、摘要或信息
- 请勿在笔记的任何地方提及此记笔记流程或指令
- 若没有实质性的新见解，可以跳过更新某章节。不要添加诸如“暂无信息”之类的填充内容，适当时留空/不编辑即可
- 为每个章节编写详细、信息密度高的内容——包含具体细节，如文件路径、函数名、错误消息、确切命令、技术细节等
- 对于“关键成果”，包含用户要求的完整、确切输出（例如完整表格、完整答案等）
- 不要包含上下文中 CLAUDE.md 文件已有的信息
- 保持每个章节在约 ${MAX_SECTION_LENGTH} 令牌/词数以内——若某章节接近此限制，通过循环替换掉次要细节以浓缩，同时保留最关键信息
- 专注于可操作的、具体的信息，有助于理解或复现对话中讨论的工作
- 重要提示：务必更新“当前状态”以反映最近的工作——这对于压缩后的连续性至关重要

使用 Edit 工具，file_path: {{notesPath}}

结构保留提醒：
每个章节有两个必须原样保留的部分（如当前文件中所示）：
1. 章节标题（以 # 开头的行）
2. 斜体描述行（紧随标题后的 _斜体文本_——此为模板指令）

你只更新位于这两个保留行之后的内容。以下划线开头和结尾的斜体描述行是模板结构的一部分，而非要编辑或删除的内容。

牢记：并行使用 Edit 工具后停止。编辑后不要继续。仅从实际用户对话中提取见解，绝不从此记笔记指令中提取。不要删除或更改章节标题或斜体 _章节描述_。`
}

/**
 * 若存在自定义会话记忆模板文件，则加载之
 */
export async function loadSessionMemoryTemplate(): Promise<string> {
  const templatePath = join(
    getClaudeConfigHomeDir(),
    'session-memory',
    'config',
    'template.md',
  )

  try {
    return await readFile(templatePath, { encoding: 'utf-8' })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') {
      return DEFAULT_SESSION_MEMORY_TEMPLATE
    }
    logError(toError(e))
    return DEFAULT_SESSION_MEMORY_TEMPLATE
  }
}

/**
 * 若存在自定义会话记忆提示文件，则加载之
 * 自定义提示可放在 ~/.claude/session-memory/prompt.md
 * 使用 {{变量名}} 语法进行变量替换（如 {{currentNotes}}、{{notesPath}}）
 */
export async function loadSessionMemoryPrompt(): Promise<string> {
  const promptPath = join(
    getClaudeConfigHomeDir(),
    'session-memory',
    'config',
    'prompt.md',
  )

  try {
    return await readFile(promptPath, { encoding: 'utf-8' })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') {
      return getDefaultUpdatePrompt()
    }
    logError(toError(e))
    return getDefaultUpdatePrompt()
  }
}

/**
 * 解析会话记忆文件并分析各章节大小
 */
function analyzeSectionSizes(content: string): Record<string, number> {
  const sections: Record<string, number> = {}
  const lines = content.split('\n')
  let currentSection = ''
  let currentContent: string[] = []

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentSection && currentContent.length > 0) {
        const sectionContent = currentContent.join('\n').trim()
        sections[currentSection] = roughTokenCountEstimation(sectionContent)
      }
      currentSection = line
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }

  if (currentSection && currentContent.length > 0) {
    const sectionContent = currentContent.join('\n').trim()
    sections[currentSection] = roughTokenCountEstimation(sectionContent)
  }

  return sections
}

/**
 * 为过长的章节生成提醒
 */
function generateSectionReminders(
  sectionSizes: Record<string, number>,
  totalTokens: number,
): string {
  const overBudget = totalTokens > MAX_TOTAL_SESSION_MEMORY_TOKENS
  const oversizedSections = Object.entries(sectionSizes)
    .filter(([_, tokens]) => tokens > MAX_SECTION_LENGTH)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([section, tokens]) =>
        `- "${section}" 约 ${tokens} 令牌（限制：${MAX_SECTION_LENGTH}）`,
    )

  if (oversizedSections.length === 0 && !overBudget) {
    return ''
  }

  const parts: string[] = []

  if (overBudget) {
    parts.push(
      `\n\n关键：会话记忆文件当前约 ${totalTokens} 令牌，超过了最大限制 ${MAX_TOTAL_SESSION_MEMORY_TOKENS} 令牌。你必须压缩文件以适应此预算。大幅缩短超限章节，移除次要细节，合并相关条目，总结较早的记录。优先保持“当前状态”和“错误与纠正”的准确和详细。`,
    )
  }

  if (oversizedSections.length > 0) {
    parts.push(
      `\n\n${overBudget ? '需要压缩的超限章节' : '重要提示：以下章节超过每章节限制，必须压缩'}:\n${oversizedSections.join('\n')}`,
    )
  }

  return parts.join('')
}

/**
 * 使用 {{变量}} 语法替换提示模板中的变量
 */
function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  // 单次替换避免两个问题：(1) $ 反向引用损坏（替换函数将 $ 视为字面量），以及 (2) 当用户内容碰巧包含与后续变量匹配的 {{varName}} 时发生双重替换。
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]!
      : match,
  )
}

/**
 * 检查会话记忆内容是否基本为空（与模板相同）。
 * 用于检测是否尚未提取实际内容，此时应回退到旧版压缩行为。
 */
export async function isSessionMemoryEmpty(content: string): Promise<boolean> {
  const template = await loadSessionMemoryTemplate()
  // 比较修剪后的内容，判断是否仅为模板
  return content.trim() === template.trim()
}

export async function buildSessionMemoryUpdatePrompt(
  currentNotes: string,
  notesPath: string,
): Promise<string> {
  const promptTemplate = await loadSessionMemoryPrompt()

  // 分析章节大小并在需要时生成提醒
  const sectionSizes = analyzeSectionSizes(currentNotes)
  const totalTokens = roughTokenCountEstimation(currentNotes)
  const sectionReminders = generateSectionReminders(sectionSizes, totalTokens)

  // 替换提示中的变量
  const variables = {
    currentNotes,
    notesPath,
  }

  const basePrompt = substituteVariables(promptTemplate, variables)

  // 添加章节大小提醒和/或总预算警告
  return basePrompt + sectionReminders
}

/**
 * 截断超过每章节令牌限制的会话记忆章节。
 * 在将会话记忆插入压缩消息时使用，防止过大的会话记忆消耗压缩后的全部令牌预算。
 *
 * 返回截断后的内容以及是否发生了截断。
 */
export function truncateSessionMemoryForCompact(content: string): {
  truncatedContent: string
  wasTruncated: boolean
} {
  const lines = content.split('\n')
  const maxCharsPerSection = MAX_SECTION_LENGTH * 4 // roughTokenCountEstimation 使用 length/4
  const outputLines: string[] = []
  let currentSectionLines: string[] = []
  let currentSectionHeader = ''
  let wasTruncated = false

  for (const line of lines) {
    if (line.startsWith('# ')) {
      const result = flushSessionSection(
        currentSectionHeader,
        currentSectionLines,
        maxCharsPerSection,
      )
      outputLines.push(...result.lines)
      wasTruncated = wasTruncated || result.wasTruncated
      currentSectionHeader = line
      currentSectionLines = []
    } else {
      currentSectionLines.push(line)
    }
  }

  // 冲刷最后一个章节
  const result = flushSessionSection(
    currentSectionHeader,
    currentSectionLines,
    maxCharsPerSection,
  )
  outputLines.push(...result.lines)
  wasTruncated = wasTruncated || result.wasTruncated

  return {
    truncatedContent: outputLines.join('\n'),
    wasTruncated,
  }
}

function flushSessionSection(
  sectionHeader: string,
  sectionLines: string[],
  maxCharsPerSection: number,
): { lines: string[]; wasTruncated: boolean } {
  if (!sectionHeader) {
    return { lines: sectionLines, wasTruncated: false }
  }

  const sectionContent = sectionLines.join('\n')
  if (sectionContent.length <= maxCharsPerSection) {
    return { lines: [sectionHeader, ...sectionLines], wasTruncated: false }
  }

  // 在接近限制的行边界处截断
  let charCount = 0
  const keptLines: string[] = [sectionHeader]
  for (const line of sectionLines) {
    if (charCount + line.length + 1 > maxCharsPerSection) {
      break
    }
    keptLines.push(line)
    charCount += line.length + 1
  }
  keptLines.push('\n[... 章节因长度被截断 ...]')
  return { lines: keptLines, wasTruncated: true }
}