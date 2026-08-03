import type { Command } from '../../commands.js'

const heapDump = {
  type: 'local',
  name: 'heapdump',
  description: '将 JS 堆转储到桌面',
  isHidden: true,
  supportsNonInteractive: true,
  load: () => import('./heapdump.ts'),
} satisfies Command

export default heapDump
