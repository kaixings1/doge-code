import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Improve Codebase Architecture\n\nSurface architectural friction and propose deepening opportunities — refactors that turn shallow modules into deep ones.\n\n## Process\n\n### 1. Explore\nRead CONTEXT.md and ADRs first. Use Explore sub-agent to walk the codebase. Note where:\n- Understanding one concept requires bouncing between many small modules\n- Modules are shallow (interface as complex as implementation)\n- Pure functions extracted just for testability, but real bugs hide in call patterns\n- Tightly-coupled modules leak across seams\n- Code is untested or hard to test through current interface\n\nApply the deletion test: would deleting it concentrate complexity or just move it?\n\n### 2. Present candidates as HTML report\nWrite a self-contained HTML file to OS temp dir. For each candidate include:\n- Files involved\n- Problem description\n- Solution in plain English\n- Benefits in terms of locality and leverage\n- Before/After diagram (side-by-side, visual)\n- Recommendation strength: Strong / Worth exploring / Speculative\n\nUse Mermaid via CDN for relationship diagrams. Use CONTEXT.md vocabulary for domain terms.\n\nEnd with a Top recommendation section.\n\n### 3. Grilling loop\nOnce user picks a candidate, run /grilling to walk the design tree.\n\n## Architecture vocabulary\nUse /codebase-design terms: module, interface, depth, seam, adapter, leverage, locality.'

export function registerImproveCodebaseArchitectureSkill(): void {
  registerBundledSkill({
    name: 'improve-codebase-architecture',
    description: 'Scan codebase for deepening opportunities, present visual HTML report, then grill through candidates.',
    whenToUse: 'When you want to improve codebase testability, AI-navigability, or find architectural friction points.',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}