import { feature } from 'bun:bundle'
import { getInvokedSkillsForAgent } from '../../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
  logEvent,
} from '../../services/analytics/index.js'
import { queryModelWithoutStreaming } from '../../services/api/claude.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import { createAbortController } from '../abortController.js'
import { count } from '../array.js'
import { getCwd } from '../cwd.js'
import { toError } from '../errors.js'
import { logError } from '../log.js'
import {
  createUserMessage,
  extractTag,
  extractTextContent,
} from '../messages.js'
import { getSmallFastModel } from '../model/model.js'
import { jsonParse } from '../slowOperations.js'
import { asSystemPrompt } from '../systemPromptType.js'
import {
  type ApiQueryHookConfig,
  createApiQueryHook,
} from './apiQueryHookHelper.js'
import { registerPostSamplingHook } from './postSamplingHooks.js'

const TURN_BATCH_SIZE = 5

export type SkillUpdate = {
  section: string
  change: string
  reason: string
}

function formatRecentMessages(messages: Message[]): string {
  return messages
    .filter(m => m.type === 'user' || m.type === 'assistant')
    .map(m => {
      const role = m.type === 'user' ? 'User' : 'Assistant'
      const content = m.message.content
      if (typeof content === 'string')
        return `${role}: ${content.slice(0, 500)}`
      const text = content
        .filter(
          (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text',
        )
        .map(b => b.text)
        .join('\n')
      return `${role}: ${text.slice(0, 500)}`
    })
    .join('\n\n')
}

function findProjectSkill() {
  const skills = getInvokedSkillsForAgent(null)
  for (const [, info] of skills) {
    if (info.skillPath.startsWith('projectSettings:')) {
      return info
    }
  }
  return undefined
}

function createSkillImprovementHook() {
  let lastAnalyzedCount = 0
  let lastAnalyzedIndex = 0

  const config: ApiQueryHookConfig<SkillUpdate[]> = {
    name: 'skill_improvement',

    async shouldRun(context) {
      if (context.querySource !== 'repl_main_thread') {
        return false
      }

      if (!findProjectSkill()) {
        return false
      }

      // Only run every TURN_BATCH_SIZE user messages
      const userCount = count(context.messages, m => m.type === 'user')
      if (userCount - lastAnalyzedCount < TURN_BATCH_SIZE) {
        return false
      }

      lastAnalyzedCount = userCount
      return true
    },

    buildMessages(context) {
      const projectSkill = findProjectSkill()!
      // Only analyze messages since the last check — the skill definition
      // provides enough context for the classifier to understand corrections
      const newMessages = context.messages.slice(lastAnalyzedIndex)
      lastAnalyzedIndex = context.messages.length

      return [
        createUserMessage({
          content: `你正在分析用户执行技能（可重复流程）的对话。
你的任务：识别用户的最近消息中是否包含应该永久添加到技能定义中的偏好、请求或修正，以便下次运行时使用。

<skill_definition>
${projectSkill.content}
</skill_definition>

<recent_messages>
${formatRecentMessages(newMessages)}
</recent_messages>

查找以下内容：
- 添加、更改或移除步骤的请求："你能也问我 X 吗"、"请也做 Y"、"不要做 Z"
- 关于步骤如何工作的偏好："问我精力水平"、"注意时间"、"使用轻松的语气"
- 修正："不，改为做 X"、"总是使用 Y"、"确保..."

忽略：
- 不具通用性的常规对话（一次性回答、闲聊）
- 技能已经在做的事情

在 <updates> 标签内输出 JSON 数组。每项：{"section": "要修改的步骤/部分或'新步骤'", "change": "要添加/修改的内容", "reason": "哪条用户消息触发了此修改"}。
如果不需要更新，输出 <updates>[]</updates>。`,
        }),
      ]
    },

    systemPrompt:
      '你在技能执行期间检测用户偏好和流程改进。标记用户要求的任何应该为下次记住的内容。',

    useTools: false,

    parseResponse(content) {
      const updatesStr = extractTag(content, 'updates')
      if (!updatesStr) {
        return []
      }
      try {
        return jsonParse(updatesStr) as SkillUpdate[]
      } catch {
        return []
      }
    },

    logResult(result, context) {
      if (result.type === 'success' && result.result.length > 0) {
        const projectSkill = findProjectSkill()
        const skillName = projectSkill?.skillName ?? 'unknown'

        logEvent('tengu_skill_improvement_detected', {
          updateCount: result.result
            .length as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          uuid: result.uuid as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          // _PROTO_skill_name routes to the privileged skill_name BQ column.
          _PROTO_skill_name:
            skillName as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
        })

        context.toolUseContext.setAppState(prev => ({
          ...prev,
          skillImprovement: {
            suggestion: { skillName, updates: result.result },
          },
        }))
      }
    },

    getModel: getSmallFastModel,
  }

  return createApiQueryHook(config)
}

export function initSkillImprovement(): void {
  if (
    feature('SKILL_IMPROVEMENT') &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_copper_panda', false)
  ) {
    registerPostSamplingHook(createSkillImprovementHook())
  }
}

/**
 * Apply skill improvements by calling a side-channel LLM to rewrite the skill file.
 * Fire-and-forget — does not block the main conversation.
 */
export async function applySkillImprovement(
  skillName: string,
  updates: SkillUpdate[],
): Promise<void> {
  if (!skillName) return

  const { join } = await import('path')
  const fs = await import('fs/promises')

  // Skills live at .claude/skills/<name>/SKILL.md relative to CWD
  const filePath = join(getCwd(), '.claude', 'skills', skillName, 'SKILL.md')

  let currentContent: string
  try {
    currentContent = await fs.readFile(filePath, 'utf-8')
  } catch {
    logError(
      new Error(`读取技能文件失败以进行改进：${filePath}`),
    )
    return
  }

  const updateList = updates.map(u => `- ${u.section}: ${u.change}`).join('\n')

  const response = await queryModelWithoutStreaming({
    messages: [
      createUserMessage({
        content: `你正在编辑技能定义文件。将以下改进应用到技能。

<current_skill_file>
${currentContent}
</current_skill_file>

<improvements>
${updateList}
</improvements>

规则：
- 将改进自然地整合到现有结构中
- 完全保持 frontmatter（--- 块）不变
- 保持整体格式和风格
- 除非改进明确要求替换，否则不要删除现有内容
- 在 <updated_file> 标签内输出完整的更新后文件`,
      }),
    ],
    systemPrompt: asSystemPrompt([
      '你编辑技能定义文件以整合用户偏好。仅输出更新后的文件内容。',
    ]),
    thinkingConfig: { type: 'disabled' as const },
    tools: [],
    signal: createAbortController().signal,
    options: {
      getToolPermissionContext: async () => getEmptyToolPermissionContext(),
      model: getSmallFastModel(),
      toolChoice: undefined,
      isNonInteractiveSession: false,
      hasAppendSystemPrompt: false,
      temperatureOverride: 0,
      agents: [],
      querySource: 'skill_improvement_apply',
      mcpTools: [],
    },
  })

  const responseText = extractTextContent(response.message.content).trim()

  const updatedContent = extractTag(responseText, 'updated_file')
  if (!updatedContent) {
    logError(
      new Error('技能改进应用：响应中没有 updated_file 标签'),
    )
    return
  }

  try {
    await fs.writeFile(filePath, updatedContent, 'utf-8')
  } catch (e) {
    logError(toError(e))
  }
}
