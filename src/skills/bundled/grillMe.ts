import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '运行 /grilling 会话—— relentless 追问用户关于计划的每一个细节，直到达成共识。沿着设计树的每个分支走下去，逐个解决决策之间的依赖关系。对每个问题，提供你的推荐答案。\n\n一次问一个问题，在继续之前等待反馈。\n\n如果一个问题可以通过探索代码库来回答，则改为探索代码库。\n\n此变体不创建 CONTEXT.md 或 ADRs——它是无状态的。当你有代码库并希望持久化决策时使用 /grill-with-docs。'

export function registerGrillMeSkill(): void {
  registerBundledSkill({
    name: 'grill-me',
    description: ' relentless 追问以完善计划或设计 — 无状态变体，不创建 CONTEXT.md 或 ADR。',
    whenToUse: '当你想验证计划可行性但无需代码库，或不想持久化任何内容到 CONTEXT.md/ADR 时。',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}