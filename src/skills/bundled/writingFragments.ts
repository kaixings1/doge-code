import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Writing Fragments\n\nGrilling session that mines the user for fragments — heterogeneous nuggets of writing (claims, vignettes, sharp sentences, half-thoughts) — and appends them to a single document as raw material for a future article.\n\n## Process\n\nRun a grilling session that produces fragments. Interview the user relentlessly about whatever they want to write about. Do not impose phases, outlines, or structure.\n\nAs fragments emerge from either side of the conversation, append them to a single markdown file. Re-read the file before each write so the user edits are preserved.\n\nCapture fragments from the very first thing the user says, including the initial prompt.\n\nOn first write, put a single H1 with a working title and nothing else — no metadata, no TOC, no date.\n\nIf the user did not pass a path, ask once where to save the document.'

export function registerWritingFragmentsSkill(): void {
  registerBundledSkill({
    name: 'writing-fragments',
    description: 'Grilling session that mines the user for writing fragments — claims, vignettes, half-thoughts — appended to a document for a future article.',
    whenToUse: 'When the user wants to develop ideas before imposing structure, or mentions fragments, ideate, or raw material for writing.',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}