/**
 * 自动模式子命令处理器——输出默认/合并的分类器规则并
 * 批评用户编写的规则。当运行 `claude auto-mode ...` 时动态导入。
 */

import { errorMessage } from '../../utils/errors.js'
import {
  getMainLoopModel,
  parseUserSpecifiedModel,
} from '../../utils/model/model.js'
import {
  type AutoModeRules,
  buildDefaultExternalSystemPrompt,
  getDefaultExternalAutoModeRules,
} from '../../utils/permissions/yoloClassifier.js'
import { getAutoModeConfig } from '../../utils/settings/settings.js'
import { sideQuery } from '../../utils/sideQuery.js'
import { jsonStringify } from '../../utils/slowOperations.js'

function writeRules(rules: AutoModeRules): void {
  process.stdout.write(jsonStringify(rules, null, 2) + '\n')
}

export function autoModeDefaultsHandler(): void {
  writeRules(getDefaultExternalAutoModeRules())
}

/**
 * 输出有效的自动模式配置：用户设置（如提供），否则使用外部
 * 默认值。每部分替换语义——匹配 buildYoloSystemPrompt 如何
 * 解析外部模板（非空用户部分完全替换该部分的默认值；空/缺失部分
 * 则回退到默认值）。
 */
export function autoModeConfigHandler(): void {
  const config = getAutoModeConfig()
  const defaults = getDefaultExternalAutoModeRules()
  writeRules({
    allow: config?.allow?.length ? config.allow : defaults.allow,
    soft_deny: config?.soft_deny?.length
      ? config.soft_deny
      : defaults.soft_deny,
    environment: config?.environment?.length
      ? config.environment
      : defaults.environment,
  })
}

const CRITIQUE_SYSTEM_PROMPT =
  '你是 Claude Code 自动模式分类器规则的专家评审员。\n' +
  '\n' +
  'Claude Code 有一个"自动模式"，使用 AI 分类器来决定是否应该自动批准工具调用或需要用户确认。用户可以编写自定义规则，分为三类：\n' +
  '\n' +
  '- **allow**：分类器应该自动批准的操作\n' +
  '- **soft_deny**：分类器应该阻止的操作（需要用户确认）\n' +
  "- **environment**：关于用户设置的上下文信息，帮助分类器做出决策\n" +
  '\n' +
  "你的工作是批评用户的自定义规则的清晰度、完整性和潜在问题。分类器是一个 LLM，在其系统提示中读取这些规则。\n" +
  '\n' +
  '对于每条规则，评估：\n' +
  '1. **清晰度**：规则是否明确？分类器会不会误解它？\n' +
  "2. **完整性**：规则是否有未覆盖的空白或边缘情况？\n" +
  '3. **冲突**：规则之间是否有任何冲突？\n' +
  '4. **可操作性**：规则是否足够具体，分类器可以据此行动？\n' +
  '\n' +
  '请简洁并具建设性。仅评论可能需要改进的规则。' +
  '如果所有规则看起来都不错，请说明。'

export async function autoModeCritiqueHandler(options: {
  model?: string
}): Promise<void> {
  const config = getAutoModeConfig()
  const hasCustomRules =
    (config?.allow?.length ?? 0) > 0 ||
    (config?.soft_deny?.length ?? 0) > 0 ||
    (config?.environment?.length ?? 0) > 0

  if (!hasCustomRules) {
    process.stdout.write(
      '未找到自定义自动模式规则。\n\n' +
        '在设置文件的 autoMode.{allow, soft_deny, environment} 下添加规则。\n' +
        '运行 `claude auto-mode defaults` 查看默认规则作为参考。\n',
    )
    return
  }

  const model = options.model
    ? parseUserSpecifiedModel(options.model)
    : getMainLoopModel()

  const defaults = getDefaultExternalAutoModeRules()
  const classifierPrompt = buildDefaultExternalSystemPrompt()

  const userRulesSummary =
    formatRulesForCritique('allow', config?.allow ?? [], defaults.allow) +
    formatRulesForCritique(
      'soft_deny',
      config?.soft_deny ?? [],
      defaults.soft_deny,
    ) +
    formatRulesForCritique(
      'environment',
      config?.environment ?? [],
      defaults.environment,
    )

  process.stdout.write('正在分析您的自动模式规则…\n\n')

  let response
  try {
    response = await sideQuery({
      querySource: 'auto_mode_critique',
      model,
      system: CRITIQUE_SYSTEM_PROMPT,
      skipSystemPromptPrefix: true,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content:
            '以下是自动模式分类器接收到的完整分类器系统提示：\n\n' +
            '<classifier_system_prompt>\n' +
            classifierPrompt +
            '\n</classifier_system_prompt>\n\n' +
            "以下是用户的自定义规则，替换了相应的默认部分：\n\n" +
            userRulesSummary +
            '\n请批评这些自定义规则。',
        },
      ],
    })
  } catch (error) {
    process.stderr.write(
      '分析规则失败：' + errorMessage(error) + '\n',
    )
    process.exitCode = 1
    return
  }

  const textBlock = response.content.find(block => block.type === 'text')
  if (textBlock?.type === 'text') {
    process.stdout.write(textBlock.text + '\n')
  } else {
    process.stdout.write('未生成评审意见。请再试一次。\n')
  }
}

function formatRulesForCritique(
  section: string,
  userRules: string[],
  defaultRules: string[],
): string {
  if (userRules.length === 0) return ''
  const customLines = userRules.map(r => '- ' + r).join('\n')
  const defaultLines = defaultRules.map(r => '- ' + r).join('\n')
  return (
    '## ' +
    section +
    '（自定义规则替换默认规则）\n' +
    '自定义规则：\n' +
    customLines +
    '\n\n' +
    '被替换的默认规则：\n' +
    defaultLines +
    '\n\n'
  )
}
