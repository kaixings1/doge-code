import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Edit Article\n\nEdit and improve articles by restructuring sections, improving clarity, and tightening prose.\n\n## Process\n\n1. Divide the article into sections based on its headings. Think about the main points. Consider that information is a directed acyclic graph — pieces of information can depend on other pieces. Make sure section order respects these dependencies.\n\n2. Confirm the sections with the user.\n\n3. For each section:\n   - Rewrite to improve clarity, coherence, and flow\n   - Use maximum 240 characters per paragraph\n   - Tighten prose: remove redundancy, strengthen verbs, vary sentence length\n   - Check that each section builds on the previous one\n\n4. After all sections, add cross-links between related sections\n\n5. Final pass: check the article reads as a coherent whole, not disconnected sections'

export function registerEditArticleSkill(): void {
  registerBundledSkill({
    name: 'edit-article',
    description: '通过重构章节、提高清晰度和精简文笔来编辑和完善文章。',
    whenToUse: '当用户想要编辑、修改或改进文章草稿时。',
    argumentHint: '<path to article markdown file>',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}