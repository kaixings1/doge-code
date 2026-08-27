/**
 * utils/fileHash.ts — 确定性编辑锚点（吸收自 oh-my-pi Hash-anchored edits）
 *
 * 在编辑前验证 old_string 的内容哈希是否匹配预期，防止因并发修改或
 * 陈旧上下文导致的错误编辑。基于内容哈希而非行号定位，兼容任意文本文件。
 *
 * 吸收自 can1357/oh-my-pi 的 Hash-anchored edits 模式。
 */

import { hashContent } from './hash.js'
import { readFileSyncCached } from './file.js'
import { expandPath } from './path.js'

export interface HashAnchorResult {
  /** 验证是否通过 */
  valid: boolean
  /** 预期的哈希值（从 old_string 计算） */
  expectedHash: string
  /** 实际的文件内容哈希 */
  actualHash: string
  /** 文件当前行数（用于诊断） */
  lineCount: number
}

/**
 * 验证文件内容是否与预期哈希匹配。
 * 当 old_string 对应文件内容的某个区域时，验证整个文件哈希可检测并发修改。
 *
 * 用法：
 *   const result = verifyContentHash(filePath, oldString)
 *   if (!result.valid) throw new Error('文件已被并发修改，old_string 锚点失效')
 */
export function verifyContentHash(filePath: string, oldString: string): HashAnchorResult {
  const fullPath = expandPath(filePath)
  const expectedHash = hashContent(oldString)
  let actualHash = ''
  let lineCount = 0

  try {
    const content = readFileSyncCached(fullPath)
    actualHash = hashContent(content)
    lineCount = content.split('\n').length
  } catch {
    // 文件不存在或不可读，哈希视为空字符串
  }

  return {
    valid: actualHash === expectedHash,
    expectedHash,
    actualHash,
    lineCount,
  }
}

/**
 * 检查文件中的 old_string 是否仍然存在（通过哈希前缀快速验证）。
 * 比完整内容读取更轻量，适用于编辑前的快速一致性检查。
 */
export function verifyEditAnchor(filePath: string, oldString: string): boolean {
  const fullPath = expandPath(filePath)
  const expectedHash = hashContent(oldString)

  try {
    const content = readFileSyncCached(fullPath)
    if (!content.includes(oldString)) return false
    // 双重验证：确保内容未发生结构变更
    return hashContent(content) !== hashContent(content.replace(oldString, ''))
  } catch {
    return false
  }
}
