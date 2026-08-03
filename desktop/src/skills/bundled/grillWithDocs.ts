import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '运行一个 grilling 会话以精炼计划或设计采访。使用 domain-modeling 在做出决策时将已解决的术语捕获到 CONTEXT.md 和 ADRs 中。\n\n## 工作流\n1. 运行 /grilling 采访用户关于计划\n2. 运行 /domain-modeling 捕获已解决的术语和决策\n3. 为难以逆转的决策创建 ADRs\n4. 使用已解决的术语更新 CONTEXT.md'

export function registerGrillWithDocsSkill(): void {
  registerBundledSkill({
    name: 'grill-with-docs',
    description: ' relentless 追问以完善计划或设计，同时创建 ADR 和术语表。',
    whenToUse: '当用户想要验证计划可行性并拥有代码库来记录决策时。',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}