/**
 * dirCache.ts — 单次命令执行期间的目录扫描缓存
 *
 * 解决同一命令内多次 readdirSync 同一目录造成的重复扫描。
 * 使用 Map 以目录路径为键，缓存条目列表（string[]）。
 * 生命周期：模块级单例，覆盖单次命令调用的所有子函数。
 */

import * as fs from 'fs'

const dirCache = new Map<string, string[]>()

export function getCachedDirEntries(dirPath: string): string[] | undefined {
  return dirCache.get(dirPath)
}

export function setCachedDirEntries(dirPath: string, entries: string[]): void {
  dirCache.set(dirPath, entries)
}

export function clearDirCache(): void {
  dirCache.clear()
}
