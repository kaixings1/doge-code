import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = 'Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.\n\nAsk the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.\n\nIf a question can be answered by exploring the codebase, explore the codebase instead.'

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