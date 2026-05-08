import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getFsImplementation } from '../../utils/fsOperations.js'

/**
 * 获取 Magic Docs 更新提示模板
 */
function getUpdatePromptTemplate(): string {
  return `重要提示：此消息和这些指令并非用户实际对话的一部分。请勿在文档内容中包含任何对“文档更新”、“magic docs”或这些更新说明的引用。

基于上述用户对话（排除此文档更新指令消息），更新 Magic Doc 文件以纳入任何值得保留的新知识、见解或信息。

文件 {{docPath}} 已为你读取。其当前内容如下：
<current_doc_content>
{{docContents}}
</current_doc_content>

文档标题：{{docTitle}}
{{customInstructions}}

你的唯一任务是：如果有大量新信息需要添加，则使用 Edit 工具更新文档文件，然后停止。你可以进行多次编辑（根据需要更新多个部分）——在一条消息中并行发起所有 Edit 工具调用。如果没有实质性内容需要添加，只需简要说明原因，不要调用任何工具。

编辑的关键规则：
- 原样保留 Magic Doc 标头：# MAGIC DOC: {{docTitle}}
- 如果标头后紧跟着斜体行，也原样保留
- 保持文档反映代码库的最新状态——这不是更新日志或历史记录
- 就地更新信息以反映当前状态——不要追加历史注释或跟踪随时间的变化
- 移除或替换过时信息，而不是添加“此前…”或“已更新为…”之类的注释
- 清理或删除不再相关或与文档目的不符的章节
- 修正明显错误：拼写错误、语法错误、格式错误、错误信息或令人困惑的陈述
- 保持文档组织良好：使用清晰的标题、合理的章节顺序、一致的格式和正确的嵌套

文档理念 - 仔细阅读：
- 简明扼要。仅保留高价值信息。不使用冗余词汇或不必要的阐述。
- 文档用于概述、架构和入口点——而非详细的代码走读
- 不要重复阅读源代码就能明显看出的信息
- 不要记录每个函数、参数或行号引用
- 聚焦于：事物存在的原因、组件如何连接、从哪里开始阅读代码、使用了哪些模式
- 跳过：详细的实现步骤、详尽的 API 文档、流水账式的叙述

应该记录的内容：
- 高层架构和系统设计
- 非显而易见的模式、约定或陷阱
- 关键入口点和代码阅读起点
- 重要的设计决策及其理由
- 关键的依赖项或集成点
- 相关文件、文档或代码的引用（像维基一样）——帮助读者导航到相关上下文

不应记录的内容：
- 阅读代码本身就能明显看出的任何内容
- 详尽的文件、函数或参数列表
- 逐步的实现细节
- 底层的代码机制
- 已在 CLAUDE.md 或其他项目文档中存在的信息

使用 Edit 工具，file_path: {{docPath}}

记住：仅当有大量新信息时才更新。Magic Doc 标头（# MAGIC DOC: {{docTitle}}）必须保持不变。`
}

/**
 * 如果存在自定义 Magic Docs 提示文件，则加载之
 * 自定义提示可放在 ~/.claude/magic-docs/prompt.md
 * 使用 {{变量名}} 语法进行变量替换（例如 {{docContents}}、{{docPath}}、{{docTitle}}）
 */
async function loadMagicDocsPrompt(): Promise<string> {
  const fs = getFsImplementation()
  const promptPath = join(getClaudeConfigHomeDir(), 'magic-docs', 'prompt.md')

  try {
    return await fs.readFile(promptPath, { encoding: 'utf-8' })
  } catch {
    // 若自定义提示不存在或加载失败，静默回退到默认提示
    return getUpdatePromptTemplate()
  }
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
 * 构建 Magic Docs 更新提示，并进行变量替换
 */
export async function buildMagicDocsUpdatePrompt(
  docContents: string,
  docPath: string,
  docTitle: string,
  instructions?: string,
): Promise<string> {
  const promptTemplate = await loadMagicDocsPrompt()

  // 如果提供了自定义指令，则构建相应部分
  const customInstructions = instructions
    ? `

文档特定的更新指令：
文档作者提供了关于如何更新此文件的具体指令。请特别注意这些指令并认真遵循：

"${instructions}"

这些指令优先于下方的通用规则。确保你的更新符合这些具体指南。`
    : ''

  // 替换提示中的变量
  const variables = {
    docContents,
    docPath,
    docTitle,
    customInstructions,
  }

  return substituteVariables(promptTemplate, variables)
}