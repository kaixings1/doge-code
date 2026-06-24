import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Triage\n\nMove issues through a small state machine of triage roles to produce agent-ready briefs.\n\n## Category Roles\n- **bug** — something is broken\n- **enhancement** — new feature or improvement\n\n## State Roles\n- **needs-triage** — maintainer needs to evaluate\n- **needs-info** — waiting on reporter for more information\n- **ready-for-agent** — fully specified, ready for implementation\n- **ready-for-human** — needs human implementation\n- **wontfix** — will not be actioned\n\n## Triage Flow\n\n### 1. Gather context\nRead the full issue (body, comments, labels, author, dates). Parse any prior triage notes.\nExplore the codebase using domain glossary, respecting ADRs.\n\n### 2. Verify the claim\nFor a bug: reproduce it from the reporter steps.\nFor an enhancement: search for existing implementation by domain concept.\nReport: confirmed, failed, or insufficient detail.\n\n### 3. Recommend\nTell the maintainer category and state recommendation with reasoning.\nIf available, use the issue tracker to apply labels.\n\n### 4. Grill (if needed)\nIf the request needs fleshing out, run /grilling to sharpen it one question at a time.\n\n### 5. Apply outcome\n- **ready-for-agent**: write an agent brief\n- **ready-for-human**: same structure, note why it can\'t be delegated\n- **needs-info**: post triage notes with specific actionable questions\n- **wontfix**: close with explanation\n\n## Agent Brief Template\n\n```\n## Agent Brief\n\n### Goal\nWhat the agent needs to accomplish.\n\n### Context\nRelevant codebase information (files, modules, patterns).\n\n### Acceptance Criteria\nChecklist of what done looks like.\n\n### Out of Scope\nWhat the agent should NOT do.\n```\n\n## Needs-Info Template\n\n```\n## Triage Notes\n\n**What we\'ve established so far:**\n- point 1\n\n**What we still need from you:**\n- question 1\n```'

export function registerTriageSkill(): void {
  registerBundledSkill({
    name: 'triage',
    description: 'Classify and triage issues (bugs/enhancements) through a state machine, producing agent-ready briefs.',
    whenToUse: 'When user wants to triage incoming bug reports, feature requests, or organize a backlog into actionable items.',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}