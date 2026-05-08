import type { Command } from '../../commands.js'

const copyPage = {
  type: 'local-jsx',
  name: 'copy-page',
  description: '将当前页面或选中的内容复制为 Markdown 格式',
  load: () => import('./copy-page.js'),
} satisfies Command

export default copyPage
