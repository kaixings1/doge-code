import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Writing Beats\n\nShape an article as a journey of beats, choose-your-own-adventure style.\n\n## Process\n\nThe user passes a markdown file of raw material.\n\n1. Write 2-3 candidate **starting beats** drawn from the raw material. Each is a different entry point. Show the user before writing to the article file. The user picks one.\n\n2. Write **only that beat** to the article file. A beat may be one sentence or several paragraphs.\n\n3. Re-read the article file from disk. Offer 2-3 candidate **next beats** — different directions the journey could pivot to.\n\n4. Loop steps 2-4 until the article reaches a natural end.\n\nIf the user did not say where to save the article, ask once and remember the path.'

export function registerWritingBeatsSkill(): void {
  registerBundledSkill({
    name: 'writing-beats',
    description: 'Shape an article as a journey of beats, choose-your-own-adventure style. Write beat by beat until the article reaches a natural end.',
    whenToUse: 'When the user has raw material and wants to assemble it as a narrative rather than an argument.',
    argumentHint: '<path to raw material markdown file>',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}