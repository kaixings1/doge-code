import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = ' 错误: # 编写出色的技能\n\n编写和编辑技能的参考。可预测性——agent 每次运行采取相同的流程——是根本美德。\n\n## 调用方式\n两种选择：\n\n**模型调用**：省略 disableModelInvocation。Agent 可以自主触发。丰富的描述带触发短语。消耗上下文负载（描述每轮都在窗口中）。\n\n**用户调用**：设置 disableModelInvocation: true。只能通过键入名称调用。零上下文负载，但你必须记住它的存在。\n\n仅在 agent 必须自行达到技能，或另一个技能必须时才选择模型调用。\n\n## 技能设计原则\n\n1. **单一责任** — 一个技能做好一件事。\n2. **可组合** — 技能通过名称调用其他技能。\n3. **可预测流程** — 每次运行相同的步骤，无论模型或上下文如何。\n4. **最小上下文负载** — 描述简短，触发短语精确。\n5. **显式失败** — 如果前置条件不满足，说出来并停止。\n\n## 技能的解剖\n- **name**：kebab-case 唯一标识符\n- **description**：一行人类摘要（用户调用）或丰富的触发短语（模型调用）\n- **argumentHint**：描述用户传递的参数（可选）\n- **disableModelInvocation**：true = 仅用户调用\n- **getPromptForCommand**：返回控制 agent 行为的指令文本\n\n## 测试技能\n用各种输入运行技能。验证它每次都遵循相同的流程。检查边缘情况（空输入、缺失文件、冲突状态）是否被优雅处理。'

export function registerWritingGreatSkillsSkill(): void {
  registerBundledSkill({
    name: 'writing-great-skills',
    description: '编写和编辑技能的参考——可预测性、调用模式、设计原则。',
    whenToUse: '当你想要编写新技能、理解技能设计原则，或编辑现有技能时。',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}