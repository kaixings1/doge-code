import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = 'Based on the PRD or Issues, implement the specified work.\n\nRules:\n1. Use TDD at pre-agreed seams.\n2. Run typecheck regularly, run full test suite at end.\n3. Use /review when done.\n4. Commit to current branch.\n\nMultiple Issues: implement one by one, commit each.'

export function registerImplementSkill(): void {
  registerBundledSkill({
    name: 'implement',
    description: 'Implement code based on PRD or Issues.',
    whenToUse: 'User wants to start coding from PRD/Issues.',
    argumentHint: '<PRD ref or Issue numbers>',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}