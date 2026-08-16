/**
 * 文件路径模糊解析工具
 * 吸收自 cline SDK (sdk/packages/shared/src/storage/path-resolution.ts)
 *
 * - resolveExistingFilePath: 解决 macOS 等系统的 Unicode 文件名变体问题
 *   （如窄不换行空格 U+202F、NFD 分解、弯引号等）
 */

import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

// macOS 文件名中出现的 Unicode 空白字符
const UNICODE_SPACES_RE = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g
const NARROW_NO_BREAK_SPACE = '\u202F'

/**
 * 将 Unicode 空白字符统一为普通空格，用于比较文件名。
 */
function collapseUnicodeWhitespace(name: string): string {
  return name.normalize('NFC').replace(UNICODE_SPACES_RE, ' ')
}

/**
 * 尝试 macOS AM/PM 变体：将普通空格替换为窄不换行空格。
 */
function tryMacOSAmPmVariant(filePath: string): string {
  const fileName = basename(filePath)
  const variantName = fileName.replace(/ (AM|PM)\./gi, `${NARROW_NO_BREAK_SPACE}$1.`)
  return variantName === fileName ? filePath : join(dirname(filePath), variantName)
}

/**
 * 尝试 NFD 分解变体。
 */
function tryNFDVariant(filePath: string): string {
  return filePath.normalize('NFD')
}

/**
 * 尝试弯引号变体：将直引号替换为弯引号。
 */
function tryCurlyApostropheVariant(filePath: string): string {
  return filePath.replace(/'/g, '\u2019')
}

/**
 * 最后手段：扫描父目录，查找与目标文件名模糊匹配的条目。
 */
function scanDirForCanonicalMatch(filePath: string): string | undefined {
  const dir = dirname(filePath)
  const wanted = collapseUnicodeWhitespace(basename(filePath))
  try {
    for (const entry of readdirSync(dir)) {
      if (collapseUnicodeWhitespace(entry) === wanted) {
        return join(dir, entry)
      }
    }
  } catch {
    // 目录不可读或不存在 — 无回退方案
  }
  return undefined
}

/**
 * 将可能被修改过的文件路径解析为磁盘上的实际文件路径。
 *
 * 解决以下常见问题：
 * - macOS 截屏文件名中的窄不换行空格 (U+202F)
 * - NFD 分解与 NFC 标准化的差异
 * - 弯引号 (U+2019) 与直引号 (U+0027) 的差异
 * - 其他 Unicode 空白字符的差异
 *
 * 返回原始路径（如果已存在），否则尝试一系列变体，最后扫描父目录。
 * 找不到匹配文件时返回 undefined。
 */
export function resolveExistingFilePath(filePath: string): string | undefined {
  if (existsSync(filePath)) {
    return filePath
  }

  const amPmVariant = tryMacOSAmPmVariant(filePath)
  if (amPmVariant !== filePath && existsSync(amPmVariant)) {
    return amPmVariant
  }

  const nfdVariant = tryNFDVariant(filePath)
  if (nfdVariant !== filePath && existsSync(nfdVariant)) {
    return nfdVariant
  }

  const curlyVariant = tryCurlyApostropheVariant(filePath)
  if (curlyVariant !== filePath && existsSync(curlyVariant)) {
    return curlyVariant
  }

  const nfdCurlyVariant = tryCurlyApostropheVariant(nfdVariant)
  if (
    nfdCurlyVariant !== nfdVariant &&
    nfdCurlyVariant !== curlyVariant &&
    existsSync(nfdCurlyVariant)
  ) {
    return nfdCurlyVariant
  }

  return scanDirForCanonicalMatch(filePath)
}
