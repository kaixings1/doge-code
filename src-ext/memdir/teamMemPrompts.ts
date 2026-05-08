import {
  buildSearchingPastContextSection,
  DIRS_EXIST_GUIDANCE,
  ENTRYPOINT_NAME,
  MAX_ENTRYPOINT_LINES,
} from './memdir.js'
import {
  MEMORY_DRIFT_CAVEAT,
  MEMORY_FRONTMATTER_EXAMPLE,
  TRUSTING_RECALL_SECTION,
  TYPES_SECTION_COMBINED,
  WHAT_NOT_TO_SAVE_SECTION,
} from './memoryTypes.js'
import { getAutoMemPath } from './paths.js'
import { getTeamMemPath } from './teamMemPaths.js'

/**
 * Build the combined prompt when both auto memory and team memory are enabled.
 * Closed four-type taxonomy (user / feedback / project / reference) with
 * per-type <scope> guidance embedded in XML-style <type> blocks.
 */
export function buildCombinedMemoryPrompt(
  extraGuidelines?: string[],
  skipIndex = false,
): string {
  const autoDir = getAutoMemPath()
  const teamDir = getTeamMemPath()

  const howToSave = skipIndex
    ? [
        '## 如何保存记忆',
        '',
        '将每个记忆写入所选目录（private 或 team，根据类型的范围指引）的独立文件，使用以下 frontmatter 格式:',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '- 保持记忆文件中的 name、description 和 type 字段与内容同步',
        '- 按主题语义组织记忆，而不是按时间顺序',
        '- 更新或删除错误或过时的记忆',
        '- 不要写重复的记忆。在写入新记忆之前，先检查是否有可以更新的现有记忆。',
      ]
    : [
        '## 如何保存记忆',
        '',
        '保存记忆分为两步:',
        '',
        '**第一步** — 将记忆写入所选目录（private 或 team，根据类型的范围指引）的独立文件，使用以下 frontmatter 格式:',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        `**第二步** — 在同一目录的 \`${ENTRYPOINT_NAME}\` 中添加指向该文件的指针。每个目录（private 和 team）都有自己的 \`${ENTRYPOINT_NAME}\` 索引——每个条目应为一行，约 150 个字符以内：\`- [标题](file.md) — 一行简介\`。它们没有 frontmatter。切勿将记忆内容直接写入 \`${ENTRYPOINT_NAME}\`。`,
        '',
        `- 两个 \`${ENTRYPOINT_NAME}\` 索引都加载到你的对话上下文中——超过 ${MAX_ENTRYPOINT_LINES} 行的内容将被截断，因此请保持简洁`,
        '- 保持记忆文件中的 name、description 和 type 字段与内容同步',
        '- 按主题语义组织记忆，而不是按时间顺序',
        '- 更新或删除错误或过时的记忆',
        '- 不要写重复的记忆。在写入新记忆之前，先检查是否有可以更新的现有记忆。',
      ]

  const lines = [
    '# 记忆',
    '',
    `你有一个基于文件的持久记忆系统，包含两个目录：一个位于 \`${autoDir}\` 的 private 目录，以及一个位于 \`${teamDir}\` 的共享 team 目录。${DIRS_EXIST_GUIDANCE}`,
    '',
    '你应该随着时间的推移建立这个记忆系统，以便未来的对话能够全面了解用户是谁、他们希望如何与你协作、要避免或重复哪些行为，以及你为用户所做工作的背景信息。',
    '',
    '如果用户明确要求你记住某些内容，请立即将其保存为最合适的类型。如果他们要求你忘记某些内容，请找到并删除相关条目。',
    '',
    '## 记忆范围',
    '',
    '有两种范围级别:',
    '',
    `- private: 仅在你和当前用户之间的记忆。它们仅与这个特定用户的对话中持久化，存储在根目录 \`${autoDir}\`。`,
    `- team: 与所有在此项目目录工作的用户共享和贡献的记忆。Team 记忆在每个会话开始时同步，存储在 \`${teamDir}\`。`,
    '',
    ...TYPES_SECTION_COMBINED,
    ...WHAT_NOT_TO_SAVE_SECTION,
    '- You MUST avoid saving sensitive data within shared team memories. For example, never save API keys or user credentials.',
    '',
    ...howToSave,
    '',
    '## 何时访问记忆',
    '- 当记忆（个人或 team）看起来相关时，或者用户提到了与他们或组织中其他人的先前工作。',
    '- 当用户明确要求你检查、召回或记住时，你必须访问记忆。',
    '- 如果用户说*忽略*或*不要使用*记忆：就像 MEMORY.md 是空的一样继续。不要应用记住的事实、引用、对比或提及记忆内容。',
    MEMORY_DRIFT_CAVEAT,
    '',
    ...TRUSTING_RECALL_SECTION,
    '',
    '## 记忆与其他形式的持久化机制',
    '记忆是你在协助用户时可用的多种持久化机制之一。区别通常在于，记忆可以在未来对话中召回，不应仅用于保存仅在当前对话范围内有用的信息。',
    '- 何时使用或更新计划而不是记忆：如果你即将开始一项重要的实现任务，并希望与用户在方法上达成一致，你应该使用计划而不是将此信息保存到记忆中。同样，如果你已经在对话中有一个计划并且改变了方法，请通过更新计划来持久化此更改，而不是保存记忆。',
    '- 何时使用或更新任务而不是记忆：当需要将当前对话中的工作分解为离散的步骤或跟踪进度时，请使用任务而不是保存到记忆。任务非常适合持久化当前对话中需要完成的工作的相关信息，但记忆应保留对未来对话有用的信息。',
    ...(extraGuidelines ?? []),
    '',
    ...buildSearchingPastContextSection(autoDir),
  ]

  return lines.join('\n')
}
