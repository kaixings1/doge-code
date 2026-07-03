// Break cache - clear and rebuild the prompt/response cache
import type { Command } from '../../commands.js'
import fs from 'fs'
import path from 'path'

const call = async () => {
  try {
    const dogeDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.doge')
    const cacheDirs: string[] = []
    let totalSize = 0
    let clearedCount = 0

    // Find and remove cache directories
    const possibleCachePaths = [
      path.join(dogeDir, 'cache'),
      path.join(dogeDir, 'prompts'),
      path.join(dogeDir, 'responses'),
    ]
    for (const dir of possibleCachePaths) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
        for (const file of files) {
          const filePath = path.join(dir, file)
          try {
            const stat = fs.statSync(filePath)
            totalSize += stat.size
            if (stat.isFile()) {
              fs.unlinkSync(filePath)
              clearedCount++
            }
          } catch { /* Skip files that can't be deleted */ }
        }
        cacheDirs.push(dir)
      }
    }

    const sizeMB = (totalSize / 1024 / 1024).toFixed(2)
    return {
      type: 'text' as const,
      value: [
        '🗑️ 缓存已刷新',
        '',
        `清除文件: ${clearedCount}`,
        `释放空间: ${sizeMB} MB`,
        `扫描路径: ${cacheDirs.length > 0 ? cacheDirs.join(', ') : '无缓存目录'}`,
        '',
        '提示：下次请求将重新生成提示并建立新的缓存。',
      ].join('\n'),
    }
  } catch (err: any) {
    return { type: 'text' as const, value: `刷新缓存时出错: ${err.message || err}` }
  }
}

const breakCache = {
  type: 'local',
  name: 'break-cache',
  description: '清除提示缓存，强制下次请求重新生成',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default breakCache
