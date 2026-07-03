import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = ' relentless 追问用户关于计划的每一个细节，直到达成共识。沿着设计树的每个分支走下去，逐个解决决策之间的依赖关系。对每个问题，提供你的推荐答案。\n\n一次问一个问题，在继续之前等待反馈。同时问多个问题会让人困惑。\n\n如果一个问题可以通过探索代码库来回答，则改为探索代码库。'

export function registerGrillingSkill(): void {
  registerBundledSkill({
    name: 'grilling',
    description: ' relentless 追问用户关于计划或设计的每一个细节，直到双方对方案达成共识。',
    whenToUse: '当用户想要在构建前验证计划的可行性，或使用任何 grill 触发词时。',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}