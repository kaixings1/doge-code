import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '## Domain Modeling\n\nBuild and sharpen the project\'s domain model. This is the active discipline of challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise.\n\n### During the session\n\n1. **Challenge against the glossary** — when user uses a term that conflicts with existing CONTEXT.md language, call it out.\n2. **Sharpen fuzzy language** — propose precise canonical terms for vague or overloaded words.\n3. **Discuss concrete scenarios** — stress-test domain relationships with specific edge cases.\n4. **Cross-reference with code** — check whether the code agrees with stated domain rules.\n5. **Update CONTEXT.md inline** — capture resolved terms immediately, don\'t batch.\n6. **Offer ADRs sparingly** — only when: (a) hard to reverse, (b) surprising without context, (c) result of a real trade-off.\n\n### File structure\n- CONTEXT.md at root or per-module — pure glossary, no implementation details\n- docs/adr/ — architectural decision records\n\n### When to create files\n- Create CONTEXT.md when first term is resolved\n- Create docs/adr/ when first ADR is needed\n- Create lazily, only when you have something to write'

export function registerDomainModelingSkill(): void {
  registerBundledSkill({
    name: 'domain-modeling',
    description: 'Build and sharpen a project domain model — track ubiquitous language, record ADRs, maintain CONTEXT.md.',
    whenToUse: 'When pinning down domain terminology, building a glossary, or recording architectural decisions.',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}