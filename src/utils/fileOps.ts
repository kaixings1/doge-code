/**
 * 文件系统删除工具函数
 * 吸收自 agno (agno_infra/agno/utilities/filesystem.py)
 *
 * - rmdirRecursive: 递归删除目录或文件
 * - deleteFilesInDir: 清空目录内容但保留目录本身
 * - deleteFromFs: 安全删除路径（文件或目录）
 */

import { existsSync, statSync, unlinkSync, readdirSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'

// ==================== 递归删除 ====================

/**
 * 递归删除目录或文件。
 * @returns 删除后路径是否不存在
 */
export function rmdirRecursive(dirPath: string): boolean {
  if (!existsSync(dirPath)) return true

  if (statSync(dirPath).isDirectory()) {
    try {
      rmdirSync(dirPath, { recursive: true })
    } catch {
      // ignore errors
    }
  } else {
    try {
      unlinkSync(dirPath)
    } catch {
      // ignore errors
    }
  }

  return !existsSync(dirPath)
}

/**
 * 删除目录中的所有文件和子目录，但保留目录本身。
 */
export function deleteFilesInDir(dir: string): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      rmdirRecursive(fullPath)
    } else {
      try {
        unlinkSync(fullPath)
      } catch {
        // ignore
      }
    }
  }
}

/**
 * 安全删除路径（文件或目录）。
 * @returns 删除后路径是否不存在
 */
export function deleteFromFs(pathToDel: string): boolean {
  if (!existsSync(pathToDel)) return true
  return rmdirRecursive(pathToDel)
}
