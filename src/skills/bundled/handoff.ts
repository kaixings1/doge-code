import { registerBundledSkill } from '../bundledSkills.js'

export function registerHandoffSkill(): void {
  registerBundledSkill({
    name: 'handoff',
    description: '将当前会话压缩成交接文档，供另一个 Agent 接手工作。',
    whenToUse: '当你要结束当前会话，或者希望另一个 Agent 继续当前工作时使用。',
    argumentHint: '<下一个会话的用途说明（可选）>',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand(args) {
      const extraContext = args.trim()
      const directive = extraContext
        ? '用户指定下一个会话将聚焦于：' + extraContext + '\n据此调整交接文档的重点。'
        : ''

      return [{
        type: 'text',
        text: [
          '将当前会话压缩成一个交接文档，供新 Agent 接手工作。',
          '保存到操作系统的临时目录 — 不要保存在当前工作区。',
          '',
          directive,
          '',
          '在文档中包含一个 "suggested skills"（推荐技能）章节，列出新 Agent 应该调用的技能。',
          '不要重复已在其他产物（PRD、计划、ADR、Issues、提交、差异）中记录的内容。用路径或 URL 引用它们。',
          '隐藏任何敏感信息，例如 API 密钥、密码或个人身份信息。',
          '交接文档使用 Markdown 格式，以交接摘要开头。',
        ].join('\n'),
      }]
    },
  })
}
