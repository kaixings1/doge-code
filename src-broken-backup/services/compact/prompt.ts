import { feature } from 'bun:bundle'
import type { PartialCompactDirection } from '../../../types/message.js'

// 死代码消除：主动模式的条件导。
/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS')
    ? (require('../../proactive/index.js') as typeof import('../../proactive/index.js'))
    : null
/* eslint-enable @typescript-eslint/no-require-imports */

// 激进的无工具前导说明。缓存共享分支会继承父进程的完整工具集（缓存键匹配所需），
// ）Sonnet 4.6+ 的自适应思维模型中，尽管尾部指令较弱，模型有时仍会尝试工具调用。
// ）maxTurns: 1 时，被拒绝的工具调用意味着没有文本输出 ）会回退到流式后备方。
//（在 4.6 上为 2.79%，在 4.5 上为 0.01%）。将此说明放在最前面并明确拒绝的后果。
// 可以防止浪费轮次。
const NO_TOOLS_PREAMBLE = `关键提示：仅以文本形式响应。不要调用任何工具。

- 不要使用 Read、Bash、Grep、Glob、Edit、Write 或任何其他工具。
- 你已经在上述对话中获得了所需的所有上下文。
- 工具调用将被拒绝，并且会浪费你唯一的轮）—）你将无法完成任务。
- 你的整个响应必须是纯文本：一）<analysis> 块后跟一）<summary> 块。

`

// 两个变体：BASE 的作用域是“整个对话”，PARTIAL 的作用域是“最近的消息”。
// <analysis> 块是一个草稿区域，formatCompactSummary() 会在摘要进入上下文之前将其移除。
const DETAILED_ANALYSIS_INSTRUCTION_BASE = `在提供最终摘要之前，请将你的分析）<analysis> 标签包裹起来，以整理思路并确保覆盖所有必要要点。在你的分析过程中：

1. 按时间顺序分析对话的每个消息和部分。对于每个部分，全面识别。
   - 用户的显式请求和意图
   - 你处理用户请求的方法
   - 关键决策、技术概念和代码模式
   - 具体细节，例如：
     - 文件。
     - 完整的代码片。
     - 函数签名
     - 文件编辑
   - 你遇到的错误以及如何修复它们
   - 特别关注你收到的具体用户反馈，尤其是用户告诉你用不同方式做事的时候。
2. 再次检查技术准确性和完整性，全面处理每个必需的元素。`

const DETAILED_ANALYSIS_INSTRUCTION_PARTIAL = `在提供最终摘要之前，请将你的分析）<analysis> 标签包裹起来，以整理思路并确保覆盖所有必要要点。在你的分析过程中：

1. 按时间顺序分析最近的消息。对于每个部分，全面识别。
   - 用户的显式请求和意图
   - 你处理用户请求的方法
   - 关键决策、技术概念和代码模式
   - 具体细节，例如：
     - 文件。
     - 完整的代码片。
     - 函数签名
     - 文件编辑
   - 你遇到的错误以及如何修复它们
   - 特别关注你收到的具体用户反馈，尤其是用户告诉你用不同方式做事的时候。
2. 再次检查技术准确性和完整性，全面处理每个必需的元素。`

const BASE_COMPACT_PROMPT = `你的任务是创建至今为止对话的详细摘要，密切关注用户的显式请求和你之前的操作。
此摘要应 thoroughly 捕获技术细节、代码模式和架构决策，这些对于继续开发工作而不丢失上下文至关重要。

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

你的摘要应包含以下部分：

1. 主要请求和意图：详细捕获用户的所有显式请求和意图
2. 关键技术概念：列出讨论的所有重要技术概念、技术和框架。
3. 文件和代码部分：枚举检查、修改或创建的特定文件和代码部分。特别注意最近的消息，并在适用时包含完整代码片段，并摘要说明为什么此文件读取或编辑很重要。
4. 错误和修复：列出你遇到的所有错误，以及如何修复它们。特别注意收到的具体用户反馈，尤其是用户告诉你用不同方式做事时。
5. 问题解决：记录已解决的问题和正在进行的故障排除工作。
6. 所有用户消息：列出所有不是工具结果的用户消息。这些对于理解用户的反馈和变化意图至关重要。
7. 待处理任务： outline 你被明确要求处理的任何待处理任务。
8. 当前工作：详细描述在此摘要请求之前立即工作的内容，特别注意来自用户和助手的最近消息。在适用时包含文件名和代码片段。
9. 可选的下一步：列出你将采取的与最近工作相关的下一步。重要：确保此步骤与用户最近明确要求和你在此摘要请求之前立即处理的任务直接一致。如果你的最后一个任务已结束，则仅在下一步与用户明确要求直接一致时列出。不要在未经用户确认的情况下开始处理无关的请求或已完成的旧请求。
                       如果有下一步，请直接引用最近对话中的内容，准确显示你在哪里停止以及任务进展情况。这应该是逐字引用，以确保任务解释不会出现偏差。

以下是你的输出应如何结构的示例：

<example>
<analysis>
[你的思考过程，确保 thoroughly 覆盖所有要点]
</analysis>

<summary>
1. 主要请求和意图：
   [详细描述]

2. 关键技术概念：
   - [概念 1]
   - [概念 2]
   - [...]

3. 文件和代码部分：
   - [文件）1]
      - [此文件重要性的摘要]
      - [对此文件所做的更改摘要（如有）]
      - [重要代码片段]
   - [文件）2]
      - [重要代码片段]
   - [...]

4. 错误和修复：
    - [错误 1 的详细描述]。
      - [你如何修复错误]
      - [用户关于错误的反馈（如有）]
    - [...]

5. 问题解决。
   [已解决问题和正在进行的故障排除的描述]

6. 所有用户消息：
    - [详细的非工具使用用户消息]
    - [...]

7. 待处理任务：
   - [任务 1]
   - [任务 2]
   - [...]

8. 当前工作。
   [当前工作的精确描述]

9. 可选的下一步：
   [可选的下一步]

</summary>
</example>

请根据至今为止的对话提供你的摘要，遵循此结构并确保精确和 thorough。

可能还有包含在上下文中的额外摘要指令。如果有，请记住在创建上述摘要时遵循这些指令。指令示例：
<example>
## 精简指令
在摘要对话时，重点关）TypeScript 代码更改，并记住你犯的错误以及如何修复它们。
</example>

<example>
# 摘要指令
使用精简模式时——请重点关注测试输出和代码更改。逐字包含文件读取内容。
</example>

**你必须始终用中文回复）*`

const PARTIAL_COMPACT_PROMPT = `你的任务是创建对话最近部分的详细摘要——跟随在之前保留上下文之后的消息。之前的消息保持完整，不需要摘要。将摘要集中在最近消息中讨论、学习和完成的内容上。

${DETAILED_ANALYSIS_INSTRUCTION_PARTIAL}

你的摘要应包含以下部分：

1. 主要请求和意图：捕获最近消息中用户的显式请求和意图
2. 关键技术概念：列出最近讨论的重要技术概念、技术和框架。
3. 文件和代码部分：枚举检查、修改或创建的特定文件和代码部分。在适用时包含完整代码片段，并摘要说明为什么此文件读取或编辑很重要。
4. 错误和修复：列出遇到的错误以及如何修复。
5. 问题解决：记录已解决的问题和正在进行的故障排除工作。
6. 所有用户消息：列出最近部分中所有不是工具结果的用户消息。
7. 待处理任务： outline 最近消息中的任何待处理任务。
8. 当前工作：准确描述在此摘要请求之前立即工作的内容。
9. 可选的下一步：列出与最近工作相关的下一步。包含最近对话中的直接引用。

以下是你的输出应如何结构的示例：

<example>
<analysis>
[你的思考过程，确保 thoroughly 覆盖所有要点]
</analysis>

<summary>
1. 主要请求和意图：
   [详细描述]

2. 关键技术概念：
   - [概念 1]
   - [概念 2]

3. 文件和代码部分：
   - [文件）1]
      - [此文件重要性的摘要]
      - [重要代码片段]

4. 错误和修复：
    - [错误描述]。
      - [你如何修复]

5. 问题解决。
   [描述]

6. 所有用户消息：
    - [详细的非工具使用用户消息]

7. 待处理任务：
   - [任务 1]

8. 当前工作。
   [当前工作的精确描述]

9. 可选的下一步：
   [可选的下一步]

</summary>
</example>

请仅根据最近的消息（在保留的早期上下文之后）提供你的摘要，遵循此结构并确保精确）thorough。

**你必须始终用中文回复）*`

// 'up_to'：模型只看到摘要后的前缀（缓存命中）。摘要将放在保留的最近消息之前，
// 因此有了“继续工作的上下文”部分。
const PARTIAL_COMPACT_UP_TO_PROMPT = `你的任务是创建此对话的详细摘要。此摘要将放置在继续会话的开头；基于此上下文的更新消息将跟随在你的摘要之后（你在这里看不到它们）。请 thorough 摘要，以便只阅读你的摘要和更新消息的人能）fully 理解发生了什么并继续工作。

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

你的摘要应包含以下部分：

1. 主要请求和意图：详细捕获用户的显式请求和意图
2. 关键技术概念：列出讨论的重要技术概念、技术和框架。
3. 文件和代码部分：枚举检查、修改或创建的特定文件和代码部分。在适用时包含完整代码片段，并摘要说明为什么此文件读取或编辑很重要。
4. 错误和修复：列出遇到的错误以及如何修复。
5. 问题解决：记录已解决的问题和正在进行的故障排除工作。
6. 所有用户消息：列出所有不是工具结果的用户消息。
7. 待处理任务： outline 任何待处理任务。
8. 已完成工作：描述在此部分结束前完成的工作。
9. 继续工作的上下文：摘要化任何上下文、决策或状态，这些对于理解和继续后续消息中的工作是必要的。

以下是你的输出应如何结构的示例：

<example>
<analysis>
[你的思考过程，确保 thoroughly 覆盖所有要点]
</analysis>

<summary>
1. 主要请求和意图：
   [详细描述]

2. 关键技术概念：
   - [概念 1]
   - [概念 2]

3. 文件和代码部分：
   - [文件）1]
      - [此文件重要性的摘要]
      - [重要代码片段]

4. 错误和修复：
    - [错误描述]。
      - [你如何修复]

5. 问题解决。
   [描述]

6. 所有用户消息：
    - [详细的非工具使用用户消息]

7. 待处理任务：
   - [任务 1]

8. 已完成工作：
   [已完成工作的描述]

9. 继续工作的上下文。
   [继续工作所需的关键上下文、决策或状态]

</summary>
</example>

请遵循此结构提供你的摘要，确保精确和 thorough。

**你必须始终用中文回复）*`

const NO_TOOLS_TRAILER =
  '\n\n提醒：不要调用任何工具。仅以纯文本响应 —）' +
  '一）<analysis> 块后跟一）<summary> 块。 +
  '工具调用将被拒绝，你将无法完成任务。

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
 * 格式化精简摘要，移）<analysis> 草稿区域，并）<summary> XML 标签替换为可读的章节标题。
 * @param summary 可能包含 <analysis> ）<summary> XML 标签的原始摘要字符串
 * @returns 格式化后的摘要，移除了分析部分，并将摘要标签替换为标。
 */
export function formatCompactSummary(summary: string): string {
  let formattedSummary = summary

  // 移除分析部分 —）这是一个草稿区域，用于提高摘要质量。
  // 但一旦摘要写出后就没有信息价值了。
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

  // 清理章节之间的多余空。
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

  let baseSummary = `此会话是从一个因上下文不足而中断的先前对话继续的。下面的摘要涵盖了对话的早期部分。

${formattedSummary}`

  if (transcriptPath) {
    baseSummary += `\n\n如果你需要压缩之前的具体细节（如确切的代码片段、错误消息或你生成的内容），请在此处阅读完整记录）{transcriptPath}`
  }

  if (recentMessagesPreserved) {
    baseSummary += `\n\n最近的消息被完整保留。`
  }

  if (suppressFollowUpQuestions) {
    let continuation = `${baseSummary}
继续对话，从中断处开始，不要向用户提出任何进一步的问题。直接恢）—）不要确认摘要，不要回顾正在发生的事情，不要以“我将继续”或类似的话开头。就像从未中断一样接续上一个任务。`

    if (
      (feature('PROACTIVE') || feature('KAIROS')) &&
      proactiveModule?.isProactiveActive()
    ) {
      continuation += `

你正在以自主/主动模式运行。这不是第一次唤）—）在压缩之前你已经处于自主工作状态。继续你的工作循环：根据上面的摘要从中断处继续。不要问候用户或询问要做什么。`
    }

    return continuation
  }

  return baseSummary
}