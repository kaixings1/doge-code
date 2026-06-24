import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Ask Matt — Skill Router\n\nYou don\'t remember every skill, so ask.\n\n## Main Flow: idea to ship\n\n1. **/grill-with-docs** — sharpen the idea by interview (if you have a codebase with CONTEXT.md)\n2. Branch: need a runnable answer? /handoff out, /prototype, /handoff back\n3. Branch: multi-session build? /to-prd, /to-issues, then /implement per issue\n4. Otherwise: /implement right here\n\n## On-ramps\n- **Bugs/requests piling up** → /triage → /implement\n\n## Codebase Health\n- **/improve-codebase-architecture** — when you have a spare moment\n\n## Crossing Sessions\n- **/handoff** — fresh session, preserved context\n- **/compact** — stay in same session, summarized\n\n## Standalone\n- **/grill-me** — same as /grill-with-docs but no codebase\n- **/teach** — learn a concept over multiple sessions\n- **/codebase-design** — vocabulary for deep module design\n- **/domain-modeling** — build and sharpen domain model\n- **/diagnosing-bugs** — systematic debug loop\n- **/tdd** — test-driven development\n- **/prototype** — throwaway code to answer a question\n- **/writing-great-skills** — reference for writing skills'

export function registerAskMattSkill(): void {
  registerBundledSkill({
    name: 'ask-matt',
    description: 'Ask which skill fits your situation. A router over all available skills in this system.',
    whenToUse: 'When you are unsure which skill to use for your current task.',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}