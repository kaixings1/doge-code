import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Teach\n\nThe user has asked you to teach them something. This is a stateful request — they intend to learn the topic over multiple sessions.\n\n## Teaching Workspace\n\nTreat the current directory as a teaching workspace. Learning state is captured in:\n\n- **MISSION.md** — the reason the user is interested in this topic, grounds all teaching.\n- **RESOURCES.md** — list of resources to ground teaching in contextual knowledge.\n- **./learning-records/0001-*.md** — captures non-obvious lessons and key insights, like ADRs. Numbered incrementally.\n- **./lessons/*.html** — single self-contained HTML outputs that teach one tightly-scoped thing tied to the mission.\n- **./reference/*.html** — cheat sheets, reference algorithms, syntax, glossaries. Designed for quick reference and print.\n- **./assets/** — reusable components shared across lessons.\n- **NOTES.md** — scratchpad for user preferences and working notes.\n\n## Philosophy\n\nTo learn at a deep level, the user needs:\n1. **Knowledge** — from high-quality, high-trust resources\n2. **Skills** — acquired through highly-relevant interactive lessons devised by you\n3. **Wisdom** — from interacting with other learners and practitioners\n\n## Teaching Principles\n\n1. **Start from mission.** Ground every lesson in why the user cares.\n2. **One thing per lesson.** A lesson teaches one tightly-scoped concept.\n3. **Interactive over passive.** Design exercises the user can run.\n4. **Reference matters.** Cheat sheets and glossaries endure beyond the session.\n5. **Track progress.** Learning records capture what was learned and what\'s next.\n6. **Zone of proximal development.** Each lesson builds on the last, at the edge of their ability.\n\n## Workflow\n\n1. Ask the user what they want to learn. Write or update MISSION.md.\n2. Gather knowledge resources into RESOURCES.md.\n3. Plan the first lesson based on mission and existing knowledge.\n4. Create the lesson as a self-contained HTML file in ./lessons/.\n5. After the lesson, write a learning record capturing key insights.\n6. Ask the user what they want to learn next — continue or deepen.\n\nUse reference HTML files that are beautiful and print well. Lessons should be practical and runnable where possible.'

export function registerTeachSkill(): void {
  registerBundledSkill({
    name: 'teach',
    description: 'Teach the user a new skill or concept within this workspace, with structured lessons and learning records.',
    whenToUse: 'When user wants to learn a new topic over multiple sessions, with structured lesson plans and progress tracking.',
    argumentHint: '<What would you like to learn about?>',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}