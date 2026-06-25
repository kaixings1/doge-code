import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Obsidian Vault\n\nSearch, create, and manage notes in the Obsidian vault with wikilinks and index notes.\n\n## Convention\n- **Title case** for all note names\n- No folders for organization — use wikilinks and index notes instead\n- **Index notes** aggregate related topics (e.g., "RAG Index.md", "Skills Index.md")\n\n## Finding notes\nAsk the user what they are looking for. Search the vault for matching titles and content. Present results with wikilinks.\n\n## Creating notes\nWhen creating notes, link them to relevant index notes and cross-link to related notes using [[wikilinks]].\n\n## Updating\nWhen the user asks to update or add to a note, read the current content first, then make the change. Preserve existing wikilinks.\n\n## Organization\nIf a topic grows beyond a single note, create an index note for it and reorganize related notes under that index.\n\nAsk the user for the vault path if not specified. Default to searching in common Obsidian vault locations.'

export function registerObsidianVaultSkill(): void {
  registerBundledSkill({
    name: 'obsidian-vault',
    description: '在 Obsidian 知识库中搜索、创建和管理笔记，支持 wikilinks 和索引笔记。',
    whenToUse: 'When the user wants to find, create, or organize notes in Obsidian.',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}