import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = 'Run a /grilling session — interview the user relentlessly about every aspect of the plan until shared understanding is reached. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.\n\nAsk questions one at a time, waiting for feedback before continuing.\n\nIf a question can be answered by exploring the codebase, explore instead.\n\nThis variant does NOT create CONTEXT.md or ADRs — it is stateless. Use /grill-with-docs when you have a codebase and want to persist decisions.'

export function registerGrillMeSkill(): void {
  registerBundledSkill({
    name: 'grill-me',
    description: 'A relentless interview to sharpen a plan or design — stateless variant of grilling, no CONTEXT.md or ADRs created.',
    whenToUse: 'When you want to stress-test a plan but have no codebase, or do not want to persist anything to CONTEXT.md/ADRs.',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}