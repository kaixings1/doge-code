import type { Command } from '../../commands.js'
import { getDirectoryAddedHook } from '../../features/directoryAddedHook.js'

const addDir = {
  type: 'local-jsx',
  name: 'add-dir',
  description: '添加新的工作目录',
  argumentHint: '<path>',
  load: () => import('./add-dir.tsx'),
  async call(args: string) {
    const path = args.trim()
    if (!path) return { type: 'text' as const, value: '用法: /add-dir <path>' }
    // 触发 DirectoryAdded hook（更新日志 2.1.219）
    const hook = getDirectoryAddedHook()
    hook.fire({ path, sessionId: `session-${Date.now()}`, source: 'add-dir', timestamp: Date.now() })
    return { type: 'text' as const, value: `已触发 DirectoryAdded hook: ${path}` }
  },
} satisfies Command

export default addDir
