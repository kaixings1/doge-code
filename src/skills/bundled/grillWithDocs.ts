import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = 'Run a grilling session to sharpen the plan or design interview. Use domain-modeling to capture resolved terms to CONTEXT.md and ADRs as decisions are made.\n\n## Workflow\n1. Run /grilling to interview the user on the plan\n2. Run /domain-modeling to capture resolved terms and decisions\n3. Create ADRs for hard-to-reverse decisions\n4. Update CONTEXT.md with resolved terminology'

export function registerGrillWithDocsSkill(): void {
  registerBundledSkill({
    name: 'grill-with-docs',
    description: 'A relentless interview to sharpen a plan or design, creating ADRs and glossary as you go.',
    whenToUse: 'When user wants to stress-test a plan AND has a codebase to document decisions in.',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}