import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# To Issues\n\nBreak a plan, spec, or PRD into independently-grabbable issues using vertical slices (tracer bullets).\n\n## Process\n\n### 1. Gather context\nWork from whatever is already in the conversation context — PRD, discussion, or passed argument.\n\n### 2. Explore the codebase\nUnderstand current code state. Issue titles should use domain glossary vocabulary. Respect existing ADRs.\n\n### 3. Draft vertical slices\nBreak the plan into tracer bullet issues. Each issue is a thin vertical slice that cuts through ALL layers end-to-end:\n- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)\n- A completed slice is demoable or verifiable on its own\n- Any prefactoring should be done first\n\n### 4. Present breakdown\nShow each slice with:\n- Title: short descriptive name\n- Blocked by: which other slices must complete first\n- User stories covered: which user stories this addresses\n\nAsk the user:\n- Does granularity feel right?\n- Are dependency relationships correct?\n- Should any slices be merged or split?\n\nIterate until approved.\n\n### 5. Save to file\nSave the final breakdown as ISSUES.md in the project root with:\n- Overview dependency graph (text-based)\n- Each issue with its title, description, blocked-by, acceptance criteria\n- Suggested implementation order'

export function registerToIssuesSkill(): void {
  registerBundledSkill({
    name: 'to-issues',
    description: '将计划、规范或 PRD 分解为可独立领取的 Issues，使用垂直追踪弹片方法。',
    whenToUse: '在编写 PRD 或讨论功能后，创建带有依赖关系的具体实现计划。',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}