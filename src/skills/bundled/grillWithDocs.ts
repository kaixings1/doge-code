import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = 'Run a grilling session to sharpen the plan or design interview. Use domain-modeling to capture resolved terms to CONTEXT.md and ADRs as decisions are made.\n\n## Workflow\n1. Run /grilling to interview the user on the plan\n2. Run /domain-modeling to capture resolved terms and decisions\n3. Create ADRs for hard-to-reverse decisions\n4. Update CONTEXT.md with resolved terminology'

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