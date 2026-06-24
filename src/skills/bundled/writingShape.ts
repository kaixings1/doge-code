import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Writing Shape\n\nTake a markdown file of raw material and shape it into an article through a conversational session.\n\n## Process\n\n1. **Read the pile.** Read the input file in full. Do not edit it — it is read-only.\n\n2. **Shape the opening.** Draft 2-3 candidate openings. Show the user, get feedback, write the chosen one to the output file.\n\n3. **Grow paragraph by paragraph.** Re-read the output, then offer options for what comes next: a list, a table, a callout, a quote, a narrative section. The user picks one, you write it.\n\n4. **Loop.** Keep going until the article feels complete.\n\n5. **Closing.** Offer 2-3 closing options. Once chosen, run a final re-read pass for consistency.\n\nIf the user did not say where to save the article, ask once and remember the path.'

export function registerWritingShapeSkill(): void {
  registerBundledSkill({
    name: 'writing-shape',
    description: 'Take raw material and shape it into an article through a conversational session — openings, paragraphs, format decisions.',
    whenToUse: 'When the user has a pile of notes, fragments, or a rough draft and wants help turning it into something publishable.',
    argumentHint: '<path to raw material markdown file>',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}