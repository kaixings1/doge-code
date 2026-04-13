/**
 * Auto mode subcommand handlers ）dump default/merged classifier rules and
 * critique user-written rules. Dynamically imported when `claude auto-mode ...` runs.
 */

import { errorMessage } from '../../../utils/errors.js'
import {
  getMainLoopModel,
  parseUserSpecifiedModel,
} from '../../../utils/model/model.js'
import {
  type AutoModeRules,
  buildDefaultExternalSystemPrompt,
  getDefaultExternalAutoModeRules,
} from '../../../utils/permissions/yoloClassifier.js'
import { getAutoModeConfig } from '../../../utils/settings/settings.js'
import { sideQuery } from '../../../utils/sideQuery.js'
import { jsonStringify } from '../../../utils/slowOperations.js'

function writeRules(rules: AutoModeRules): void {
  process.stdout.write(jsonStringify(rules, null, 2) + '\n')
}

export function autoModeDefaultsHandler(): void {
  writeRules(getDefaultExternalAutoModeRules())
}

/**
 * Dump the effective auto mode config: user settings where provided, external
 * defaults otherwise. Per-section REPLACE semantics ）matches how
 * buildYoloSystemPrompt resolves the external template (a non-empty user
 * section replaces that section's defaults entirely; an empty/absent section
 * falls through to defaults).
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
  '你是 Claude Code 自动模式分类器规则的专家审查员。\n' +
  '\n' +
  'Claude Code 有一）自动模式"，使）AI 分类器来决定是否\n' +
  '应该自动批准工具调用或需要用户确认。用户可以\n' +
  '在三个类别中编写自定义规则：\n' +
  '\n' +
  '- **allow**: 分类器应自动批准的操作\n' +
  '- **soft_deny**: 分类器应阻止的操作（需要用户确认）\n' +
  '- **environment**: 关于用户设置的上下文信息，帮助分类器做出决策\n' +
  '\n' +
  '你的工作是审查用户的自定义规则，找出清晰度、完整性和\n' +
  '潜在问题。分类器是一）LLM，将这些规则作为\n' +
  '其系统提示词的一部分来阅读。\n' +
  '\n' +
  '对于每条规则，评估：\n' +
  '1. **清晰）*: 规则是否明确？分类器是否会误解它？\n' +
  '2. **完整）*: 是否有规则未覆盖的漏洞或边缘情况？\n' +
  '3. **冲突**: 规则之间是否有任何冲突？\n' +
  '4. **可操作）*: 规则是否足够具体，分类器可以据此操作？\n' +
  '\n' +
  '保持简洁且有建设性。只评论可以改进的规则。 +
  '如果所有规则看起来都不错，请说明。

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
        '在你的设置文件中添加规则，位）autoMode.{allow, soft_deny, environment} 下。\n' +
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

  process.stdout.write('Analyzing your auto mode rules…\n\n')

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
            'Here is the full classifier system prompt that the auto mode classifier receives:\n\n' +
            '<classifier_system_prompt>\n' +
            classifierPrompt +
            '\n</classifier_system_prompt>\n\n' +
            "Here are the user's custom rules that REPLACE the corresponding default sections:\n\n" +
            userRulesSummary +
            '\n请审查这些自定义规则）,
        },
      ],
    })
  } catch (error) {
    process.stderr.write(
      '规则分析失败: ' + errorMessage(error) + '\n',
    )
    process.exitCode = 1
    return
  }

  const textBlock = response.content.find(block => block.type === 'text')
  if (textBlock?.type === 'text') {
    process.stdout.write(textBlock.text + '\n')
  } else {
    process.stdout.write('未生成审查结果。请重试。\n')
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
    ' (custom rules replacing defaults)\n' +
    'Custom:\n' +
    customLines +
    '\n\n' +
    'Defaults being replaced:\n' +
    defaultLines +
    '\n\n'
  )
}
