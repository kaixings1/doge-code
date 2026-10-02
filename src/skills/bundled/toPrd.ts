import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# To PRD\n\nTurn the current conversation context and codebase understanding into a PRD document. Do NOT interview the user — just synthesize what you already know.\n\n## Process\n\n1. Explore the repo to understand the current state of the codebase. Use domain glossary vocabulary throughout, respect existing ADRs.\n\n2. Sketch the seams at which to test the feature. Prefer existing seams. Use the highest seam possible.\n\n3. Write the PRD and save to PRD.md in the project root.\n\n## PRD Template\n\n### Problem Statement\nThe problem the user is facing, from the user perspective.\n\n### Solution\nThe solution, from the user perspective.\n\n### User Stories\nA numbered list of user stories in the format:\nAs an <actor>, I want a <feature>, so that <benefit>\n\nList extensively, covering all aspects.\n\n### Implementation Decisions\n- Modules to build/modify\n- Interface definitions\n- Technical clarifications\n- Architectural decisions\n- Schema changes\n- API contracts\n\nDo NOT include specific file paths or code snippets (they become outdated).\n\n### Testing Decisions\n- What constitutes a good test (behavior, not implementation)\n- Which modules to test\n- Prior art in the codebase\n\n### Out of Scope\nWhat this PRD explicitly does NOT cover.\n\n### Further Notes\nAny additional context or constraints.'

export function registerToPrdSkill(): void {
  registerBundledSkill({
    name: 'to-prd',
    description: '将当前对话综合成 PRD 文档并保存到项目根目录。',
    whenToUse: '当用户已充分讨论某个功能，无需进一步访谈即可撰写正式 PRD 时。',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}