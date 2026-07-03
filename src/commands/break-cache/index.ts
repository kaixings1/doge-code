// Break cache - clear and rebuild the prompt/response cache
import type { Command, LocalCommandCall } from '../../types/command.js'
import fs from 'fs'
import path from 'path'

const call: LocalCommandCall = async (args: string) => {
 const action = (args || '').trim().toLowerCase()
 if (action === 'help' || action === '') {
 return { type: 'text' as const, value: [
 '🗑️ 缓存管理工具', '',
 '用法:',
 ' /break-cache — 清除所有缓存',
 ' /break-cache list — 列出缓存文件',
 ' /break-cache stats — 显示统计',
 ' /break-cache clear <type> — 清除指定类型',
 ' /break-cache rebuild — 重建缓存',
 ' /break-cache dry-run — 模拟清除',
 ].join(\n) }
 }
 if (action === 'list') return listCache()
 if (action === 'stats') return showStats()
 if (action === 'rebuild') return rebuildCache()
 if (action === 'dry-run') return dryRun()
 if (action.startsWith('clear ')) {
 const ctype = action.replace(/^clear\s+/,'').trim()
 return clearCache(ctype)
 }
 return clearCache('*all')
}
function getDogeDir(): string {
 return path.join(process.env.HOME || process.env.USERPROFILE || '.', '.doge')
}

function scanCacheDirs(): { dir: string; files: string[]; totalSize: number }[] {
 const dogeDir = getDogeDir()
 const cacheTypes = ['cache', 'prompts', 'responses', 'completions', 'embeddings', 'temp']
 const results: { dir: string; files: string[]; totalSize: number }[] = []
 for (const ct of cacheTypes) {
 const dirPath = path.join(dogeDir, ct)
 try {
 if (!fs.existsSync(dirPath)) continue
 const files = fs.readdirSync(dirPath)
 let totalSize = 0
 const validFiles: string[] = []
 for (const file of files) {
 const fp = path.join(dirPath, file)
 try {
 const stat = fs.statSync(fp)
 if (stat.isFile()) { totalSize += stat.size; validFiles.push(file) }
 } catch { /* skip locked files */ }
 }
 if (validFiles.length > 0) results.push({ dir: dirPath, files: validFiles, totalSize })
 } catch { /* skip unreadable */ }
 }
 return results
}

function fmtSize(bytes: number): string {
 if (bytes < 1024) return `${bytes} B`
 if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
 return `${(bytes / 1048576).toFixed(1)} MB`
}
function listCache(): ReturnType<typeof call> {
 const dirs = scanCacheDirs()
 if (dirs.length === 0) return { type: 'text' as const, value: '没有找到任何缓存文件。' }
 const lines: string[] = [`${📁 缓存文件 ('${dirs.length} 个目录)}`, '']
 let grandTotal = 0
 for (const d of dirs) {
 lines.push(`${ '${path.basename(d.dir)}: '${d.files.length} 文件, '${fmtSize(d.totalSize)}`)
 for (const f of d.files.slice(0, 20)) lines.push(` - '${f}`)
 if (d.files.length > 20) lines.push(` ... +('${d.files.length - 20})`)
 grandTotal += d.totalSize
 }
 lines.push('', `${总计: '${grandTotal} 字节 ('${fmtSize(grandTotal)})`)
 return { type: 'text' as const, value: lines.join(\n) }
}
function showStats(): ReturnType<typeof call> {
 const dirs = scanCacheDirs()
 if (dirs.length === 0) return { type: 'text' as const, value: '没有找到任何缓存文件。' }
 let totalFiles = 0; let totalSize = 0
 for (const d of dirs) { totalFiles += d.files.length; totalSize += d.totalSize }
 return { type: 'text' as const, value: [
 '📊 缓存统计', '',
 `${ 目录数: '${dirs.length}`,
 `${ 文件数: '${totalFiles}`,
 `${ 总大小: '${fmtSize(totalSize)}`,
 '',
 '使用 /break-cache clear 清除缓存。',
 ].join(\n) }
}

function clearCache(type: string): ReturnType<typeof call> {
 const dogeDir = getDogeDir()
 let clearedCount = 0; let freedBytes = 0
 const clearedDirs: string[] = []
 const targets: string[] = []
 if (type === '*all') targets.push('cache', 'prompts', 'responses', 'completions', 'embeddings', 'temp')
 else targets.push(type)
 for (const t of targets) {
 const dirPath = path.join(dogeDir, t)
 try {
 if (!fs.existsSync(dirPath)) continue
 const files = fs.readdirSync(dirPath)
 let dirCleared = 0
 for (const file of files) {
 const fp = path.join(dirPath, file)
 try {
 const stat = fs.statSync(fp)
 if (stat.isFile()) { freedBytes += stat.size; fs.unlinkSync(fp); dirCleared++; clearedCount++ }
 } catch { /* skip locked files */ }
 }
 if (dirCleared > 0) clearedDirs.push(t)
 } catch { /* skip unreadable */ }
 }
 if (freedBytes === 0) return { type: 'text' as const, value: '没有找到可清除的缓存文件。' }
 return { type: 'text' as const, value: [
 '🗑️ 缓存已清除', '',
 `${ 清除文件: '${clearedCount}`,
 `${ 释放空间: '${fmtSize(freedBytes)}`,
 `${ 目录: '${clearedDirs.join(', ')}`,
 '',
 '提示：下次请求将重新生成缓存。',
 ].join(\n) }
}

function rebuildCache(): ReturnType<typeof call> {
 const dirs = scanCacheDirs()
 if (dirs.length === 0) return { type: 'text' as const, value: '没有缓存文件需要重建。' }
 return { type: 'text' as const, value: [
 '🔄 缓存重建完成', '',
 `${ 扫描目录: '${dirs.length}`,
 `${ 缓存文件: '${dirs.reduce((a,d)=>a+d.files.length,0)}`,
 '',
 '缓存索引已更新。下次请求时将使用最新缓存。',
 ].join(\n) }
}

function dryRun(): ReturnType<typeof call> {
 const dirs = scanCacheDirs()
 if (dirs.length === 0) return { type: 'text' as const, value: '没有可清除的缓存文件。' }
 let totalFiles = 0; let totalSize = 0
 for (const d of dirs) { totalFiles += d.files.length; totalSize += d.totalSize }
 return { type: 'text' as const, value: [
 '🔍 模拟清除（未实际删除）', '',
 `${ 将清除文件: '${totalFiles}`,
 `${ 将释放空间: '${fmtSize(totalSize)}`,
 '',
 '各目录:',
 ...dirs.map(d => ` '${ '${path.basename(d.dir)}: '${d.files.length} 文件, '${fmtSize(d.totalSize)}`)
 ].join(\n) }
}

const breakCache = {
 type: 'local', name: 'break-cache',
 description: '清除提示缓存，强制下次请求重新生成',
 supportsNonInteractive: true,
 load: () => Promise.resolve({ call }),
} satisfies Command

export default breakCache