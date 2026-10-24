import type { Command } from '../../commands.js'

const vault = {
  type: 'local',
  name: 'vault',
  description: '本地 Markdown 知识库检索（Obsidian 风格，BM25 + 标签 + 双向链接）',
  argumentHint: '[--dir <path>] [--tag <tag>|--links <note>|--json] [<关键词>]',
  supportsNonInteractive: true,
  load: () => import('./vault.js'),
} satisfies Command

export default vault
