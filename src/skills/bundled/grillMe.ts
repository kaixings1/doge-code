import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = 'Run a /grilling session — interview the user relentlessly about every aspect of the plan until shared understanding is reached. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.\n\nAsk questions one at a time, waiting for feedback before continuing.\n\nIf a question can be answered by exploring the codebase, explore instead.\n\nThis variant does NOT create CONTEXT.md or ADRs — it is stateless. Use /grill-with-docs when you have a codebase and want to persist decisions.'

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