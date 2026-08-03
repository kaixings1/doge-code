import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = `根据 PRD 或 Issues 实现指定的工作。

规则：
1. 在预协商的边界使用 TDD。
2. 定期运行类型检查，在最后运行完整测试套件。
3. 完成后使用 /review。
4. 提交到当前分支。

多个 Issues：逐一实现，每个提交一次。`

export function registerImplementSkill(): void {
  registerBundledSkill({
    name: 'implement',
    description: '根据 PRD 或 Issues 实现代码。',
    whenToUse: '用户想要从 PRD/Issues 开始编码。',
    argumentHint: '<PRD ref or Issue numbers>',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}