import { feature } from 'bun:bundle'
import type { PartialCompactDirection } from '../../types/message.js'

// 死码消除：主动模式的按需导入
 
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS')
    ? (require('../../proactive/index.js') as typeof import('../../proactive/index.js'))
    : null
 

// 激进的无工具前置声明。缓存共享的分叉路径继承父级的完整工具集（缓存键匹配所必需），
// 而在 Sonnet 4.6+ 自适应思考模型上，模型有时会试图调用工具，尽管尾部的指令较弱。
// 在 maxTurns: 1 的情况下，被拒绝的工具调用意味着没有文本输出 → 回退到流式备用方案
// （4.6 上发生率为 2.79%，而 4.5 上为 0.01%）。将此声明放在最前面并明确说明拒绝后果，
// 可以防止浪费回合。
const NO_TOOLS_PREAMBLE = `关键：仅用纯文本回应。不要调用任何工具。

- 不要使用 Read、Bash、Grep、Glob、Edit、Write 或任何其他工具。
- 你所需的所有上下文都已包含在上述对话中。
- 工具调用将被拒绝，并将浪费你唯一的回合——你将无法完成任务。
- 你的整个回应必须是纯文本：一个 <analysis> 块，后跟一个 <summary> 块。

`

// 两个变体：BASE 范围限定为“整个对话”，PARTIAL 范围限定为“最近的几条消息”。
// <analysis> 块是一个草稿便笺，formatCompactSummary() 在将摘要放入上下文前会将其剥离。
const DETAILED_ANALYSIS_INSTRUCTION_BASE = `在提供最终摘要之前，请将你的分析过程包裹在 <analysis> 标签中，以整理思路并确保覆盖所有必要要点。在分析过程中：

1. 按时间顺序分析对话中的每条消息和每个部分。对每一部分，详细识别：
   - 用户的明确请求和意图
   - 你处理用户请求的方法
   - 关键决策、技术概念和代码模式
   - 具体细节，例如：
     - 文件名
     - 完整代码片段
     - 函数签名
     - 文件编辑
   - 你遇到的错误以及如何修复它们
   - 特别关注你收到的具体用户反馈，尤其是当用户告诉你以不同方式处理某件事时。
2. 再次检查技术准确性和完整性，彻底处理每个必需元素。`

const DETAILED_ANALYSIS_INSTRUCTION_PARTIAL = `在提供最终摘要之前，请将你的分析过程包裹在 <analysis> 标签中，以整理思路并确保覆盖所有必要要点。在分析过程中：

1. 按时间顺序分析最近的几条消息。对每一部分，详细识别：
   - 用户的明确请求和意图
   - 你处理用户请求的方法
   - 关键决策、技术概念和代码模式
   - 具体细节，例如：
     - 文件名
     - 完整代码片段
     - 函数签名
     - 文件编辑
   - 你遇到的错误以及如何修复它们
   - 特别关注你收到的具体用户反馈，尤其是当用户告诉你以不同方式处理某件事时。
2. 再次检查技术准确性和完整性，彻底处理每个必需元素。`

const BASE_COMPACT_PROMPT = `你的任务是创建迄今为止对话的详细摘要，密切关注用户的明确请求和你之前的操作。
此摘要应详尽捕捉技术细节、代码模式和架构决策，这些对于在不丢失上下文的情况下继续开发工作至关重要。

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

你的摘要应包含以下部分：

1. 主要请求和意图：详细捕捉用户的所有明确请求和意图
2. 关键技术概念：列出所有讨论过的重要技术概念、技术和框架。
3. 文件和代码部分：列举检查、修改或创建的特定文件和代码部分。特别关注最近的消息，并在适用时包含完整代码片段，同时概述为什么此次文件读取或编辑很重要。
4. 错误和修复：列出你遇到的所有错误，以及你是如何修复它们的。特别关注你收到的具体用户反馈，尤其是当用户告诉你以不同方式处理某件事时。
5. 问题解决：记录已解决的问题以及任何正在进行的故障排除工作。
6. 所有用户消息：列出所有非工具结果的用户消息。这些消息对于理解用户的反馈和意图变化至关重要。
7. 待处理任务：列出你已被明确要求处理的任何待处理任务。
8. 当前工作：详细描述在此摘要请求之前正在处理的确切内容，特别关注来自用户和助手的最近消息。在适用时包含文件名和代码片段。
9. 可选的下一步：列出与最近工作相关的你将采取的下一步操作。重要提示：确保此步骤与你最近用户的明确请求以及在此摘要请求之前你正在执行的任务直接一致。如果你的上一个任务已结束，则仅当下一步明确符合用户请求时才列出。未经用户确认，不要开始处理与主线无关的请求或早已完成的旧请求。
                       如果有下一步，请包含最近对话中的直接引用，准确显示你正在执行的任务以及你停在哪里。这应是逐字引用，以确保任务理解不发生偏移。

以下是你输出结构的示例：

<example>
<analysis>
[你的思考过程，确保所有要点均被全面准确地覆盖]
</analysis>

<summary>
1. 主要请求和意图：
   [详细描述]

2. 关键技术概念：
   - [概念 1]
   - [概念 2]
   - [...]

3. 文件和代码部分：
   - [文件名 1]
      - [概述为什么此文件重要]
      - [概述对此文件所做的更改（如果有）]
      - [重要代码片段]
   - [文件名 2]
      - [重要代码片段]
   - [...]

4. 错误和修复：
    - [错误 1 的详细描述]：
      - [你是如何修复该错误的]
      - [关于此错误的用户反馈（如果有）]
    - [...]

5. 问题解决：
   [已解决问题和正在进行的故障排除的描述]

6. 所有用户消息：
    - [详细的非工具使用用户消息]
    - [...]

7. 待处理任务：
   - [任务 1]
   - [任务 2]
   - [...]

8. 当前工作：
   [当前工作的精确描述]

9. 可选的下一步：
   [可选的下一步操作]

</summary>
</example>

请根据迄今为止的对话提供你的摘要，遵循此结构并确保回应精确且详尽。

包含的上下文中可能提供了额外的摘要指令。如果是这样，请记得在创建上述摘要时遵循这些指令。指令示例包括：
<example>
## 压缩指令
在总结对话时，重点关注 TypeScript 代码更改，并记住你犯过的错误以及修复方法。
</example>

<example>
# 摘要指令
当你使用压缩功能时——请重点关注测试输出和代码更改。包含逐字读取的文件内容。
</example>
`

const PARTIAL_COMPACT_PROMPT = `你的任务是创建对话中近期部分的详细摘要——即那些跟在先前保留上下文之后的消息。先前的消息将保持完整，无需总结。将你的摘要重点放在近期消息中讨论、学习和完成的内容上。

${DETAILED_ANALYSIS_INSTRUCTION_PARTIAL}

你的摘要应包含以下部分：

1. 主要请求和意图：从近期消息中捕捉用户的明确请求和意图
2. 关键技术概念：列出近期讨论的重要技术概念、技术和框架。
3. 文件和代码部分：列举近期检查、修改或创建的特定文件和代码部分。在适用时包含完整代码片段，并概述为什么此次文件读取或编辑很重要。
4. 错误和修复：列出遇到的错误以及修复方法。
5. 问题解决：记录已解决的问题以及任何正在进行的故障排除工作。
6. 所有用户消息：列出近期部分中所有非工具结果的用户消息。
7. 待处理任务：概述近期消息中的任何待处理任务。
8. 当前工作：精确描述在此摘要请求之前正在处理的工作。
9. 可选的下一步：列出与最近工作相关的下一步操作。包含最近对话中的直接引用。

以下是你输出结构的示例：

<example>
<analysis>
[你的思考过程，确保所有要点均被全面准确地覆盖]
</analysis>

<summary>
1. 主要请求和意图：
   [详细描述]

2. 关键技术概念：
   - [概念 1]
   - [概念 2]

3. 文件和代码部分：
   - [文件名 1]
      - [概述为什么此文件重要]
      - [重要代码片段]

4. 错误和修复：
    - [错误描述]：
      - [你是如何修复它的]

5. 问题解决：
   [描述]

6. 所有用户消息：
    - [详细的非工具使用用户消息]

7. 待处理任务：
   - [任务 1]

8. 当前工作：
   [当前工作的精确描述]

9. 可选的下一步：
   [可选的下一步操作]

</summary>
</example>

请仅基于近期消息（在保留的先前上下文之后）提供你的摘要，遵循此结构并确保回应精确且详尽。
`

// 'up_to'：模型仅看到摘要前缀（缓存命中）。摘要将位于保留的近期消息之前，因此需要“继续工作的上下文”部分。
const PARTIAL_COMPACT_UP_TO_PROMPT = `你的任务是创建此对话的详细摘要。此摘要将放置在持续会话的开头；在此摘要之后会有建立在此上下文之上的更新消息（你在此处看不到它们）。请进行全面总结，以便只阅读你的摘要和后续更新消息的人能够完全理解发生的事情并继续工作。

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

你的摘要应包含以下部分：

1. 主要请求和意图：详细捕捉用户的明确请求和意图
2. 关键技术概念：列出讨论过的重要技术概念、技术和框架。
3. 文件和代码部分：列举检查、修改或创建的特定文件和代码部分。在适用时包含完整代码片段，并概述为什么此次文件读取或编辑很重要。
4. 错误和修复：列出遇到的错误以及修复方法。
5. 问题解决：记录已解决的问题以及任何正在进行的故障排除工作。
6. 所有用户消息：列出所有非工具结果的用户消息。
7. 待处理任务：概述任何待处理任务。
8. 已完成工作：描述在此部分结束时完成了什么。
9. 继续工作的上下文：总结理解并继续后续消息工作所需的任何上下文、决策或状态。

以下是你输出结构的示例：

<example>
<analysis>
[你的思考过程，确保所有要点均被全面准确地覆盖]
</analysis>

<summary>
1. 主要请求和意图：
   [详细描述]

2. 关键技术概念：
   - [概念 1]
   - [概念 2]

3. 文件和代码部分：
   - [文件名 1]
      - [概述为什么此文件重要]
      - [重要代码片段]

4. 错误和修复：
    - [错误描述]：
      - [你是如何修复它的]

5. 问题解决：
   [描述]

6. 所有用户消息：
    - [详细的非工具使用用户消息]

7. 待处理任务：
   - [任务 1]

8. 已完成工作：
   [已完成工作的描述]

9. 继续工作的上下文：
   [理解并继续工作所需的关键上下文、决策或状态]

</summary>
</example>

请遵循此结构提供你的摘要，确保回应精确且详尽。
`

const NO_TOOLS_TRAILER =
  '\n\n提醒：不要调用任何工具。仅用纯文本回应——' +
  '一个 <analysis> 块，后跟一个 <summary> 块。' +
  '工具调用将被拒绝，你将无法完成任务。'

export function getPartialCompactPrompt(
  customInstructions?: string,
  direction: PartialCompactDirection = 'from',
): string {
  const template =
    direction === 'up_to'
      ? PARTIAL_COMPACT_UP_TO_PROMPT
      : PARTIAL_COMPACT_PROMPT
  let prompt = NO_TOOLS_PREAMBLE + template

  if (customInstructions && customInstructions.trim() !== '') {
    prompt += `\n\n附加指令：\n${customInstructions}`
  }

  prompt += NO_TOOLS_TRAILER

  return prompt
}

export function getCompactPrompt(customInstructions?: string): string {
  let prompt = NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT

  if (customInstructions && customInstructions.trim() !== '') {
    prompt += `\n\n附加指令：\n${customInstructions}`
  }

  prompt += NO_TOOLS_TRAILER

  return prompt
}

/**
 * 通过剥离 <analysis> 草稿便笺并用可读的章节标题替换 <summary> XML 标签来格式化压缩摘要。
 * @param summary 原始摘要字符串，可能包含 <analysis> 和 <summary> XML 标签
 * @returns 格式化后的摘要，已剥离分析部分，摘要标签替换为标题
 */
export function formatCompactSummary(summary: string): string {
  let formattedSummary = summary

  // 剥离分析部分——它是一个草稿便笺，可以提高摘要质量，但一旦摘要写完就没有信息价值。
  formattedSummary = formattedSummary.replace(
    /<analysis>[\s\S]*?<\/analysis>/,
    '',
  )

  // 提取并格式化摘要部分
  const summaryMatch = formattedSummary.match(/<summary>([\s\S]*?)<\/summary>/)
  if (summaryMatch) {
    const content = summaryMatch[1] || ''
    formattedSummary = formattedSummary.replace(
      /<summary>[\s\S]*?<\/summary>/,
      `摘要：\n${content.trim()}`,
    )
  }

  // 清理各部分之间多余的空格
  formattedSummary = formattedSummary.replace(/\n\n+/g, '\n\n')

  return formattedSummary.trim()
}

export function getCompactUserSummaryMessage(
  summary: string,
  suppressFollowUpQuestions?: boolean,
  transcriptPath?: string,
  recentMessagesPreserved?: boolean,
): string {
  const formattedSummary = formatCompactSummary(summary)

  let baseSummary = `本次会话是从之前因上下文不足而中断的对话延续而来。下面的摘要涵盖了对话的前半部分。

${formattedSummary}`

  if (transcriptPath) {
    baseSummary += `\n\n如果你需要压缩前的具体细节（如确切的代码片段、错误信息或你生成的内容），请阅读完整转录文件：${transcriptPath}`
  }

  if (recentMessagesPreserved) {
    baseSummary += `\n\n近期的消息已逐字保留。`
  }

  if (suppressFollowUpQuestions) {
    let continuation = `${baseSummary}
继续对话，从上次中断的地方开始，无需再向用户提出任何问题。直接恢复——不要确认摘要，不要复述之前发生了什么，不要用“我将继续”或类似表述作为开头。就像从未中断过一样接续上一个任务。`

    if (
      (feature('PROACTIVE') || feature('KAIROS')) &&
      proactiveModule?.isProactiveActive()
    ) {
      continuation += `

你正在自主/主动模式下运行。这不是首次唤醒——在压缩之前你就已经在自主工作。继续你的工作循环：根据上面的摘要，从上次停下的地方继续。不要问候用户或询问要做什么。`
    }

    return continuation
  }

  return baseSummary
}