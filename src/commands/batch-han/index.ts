/**
 * batch-han command - Batch localize and upgrade TypeScript files
 */
import type { Command } from "../../commands.js"

const batchHan = {
  type: 'local',
  name: 'batch-han',
  description: 'Batch TS file han-ification',
  aliases: ['bh'],
  supportsNonInteractive: true,
  load: () => import('./batch-han.js'),
} satisfies Command

export default batchHan
