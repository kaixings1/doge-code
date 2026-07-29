/**
 * batch-han command - Batch localize and upgrade TypeScript files
 */
import type { Command } from "../../commands.js"

const batchHan = {
  type: 'local',
  name: 'batch-han',
  description: '批量汉化 TypeScript 文件',
  aliases: ['bh'],
  supportsNonInteractive: true,
  load: () => import('./batch-han.ts'),
} satisfies Command

export default batchHan
