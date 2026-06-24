import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Writing Great Skills\n\nReference for writing and editing skills. Predictability — the agent taking the same process every run — is the root virtue.\n\n## Invocation\nTwo choices:\n\n**Model-invoked**: omit disableModelInvocation. Agent can fire autonomously. Rich description with trigger phrases. Costs context load (description sits in window every turn).\n\n**User-invoked**: set disableModelInvocation: true. Only invocable by typing the name. Zero context load, but you must remember it exists.\n\nPick model-invocation only when the agent must reach the skill on its own, or another skill must.\n\n## Skill Design Principles\n\n1. **Single responsibility** — one skill does one thing well.\n2. **Composable** — skills call other skills by name.\n3. **Predictable process** — same steps every run, regardless of model or context.\n4. **Minimal context load** — descriptions are short, trigger phrases precise.\n5. **Fail explicitly** — if preconditions aren\'t met, say so and stop.\n\n## Anatomy of a Skill\n- **name**: kebab-case unique identifier\n- **description**: one-line human summary (user-invoked) or rich trigger phrasing (model-invoked)\n- **argumentHint**: describes what the user passes as argument (optional)\n- **disableModelInvocation**: true = user-invoked only\n- **getPromptForCommand**: returns the instruction text that controls agent behavior\n\n## Testing Skills\nRun the skill with various inputs. Verify it follows the same process each time. Check that edge cases (empty input, missing files, confliicting state) are handled gracefully.'

export function registerWritingGreatSkillsSkill(): void {
  registerBundledSkill({
    name: 'writing-great-skills',
    description: 'Reference for writing and editing skills — predictability, invocation modes, design principles.',
    whenToUse: 'When you want to write a new skill, understand skill design principles, or edit an existing skill.',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}