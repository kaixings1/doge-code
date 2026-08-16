/**
 * 编码安全、换行符安全的文本文件 I/O 工具。
 *
 * 解决以下问题：
 * 1. 非 UTF-8 Windows 区域设置（如 GBK/cp936）读取 UTF-8 文件时出现乱码或 UnicodeDecodeError
 * 2. 文本模式下写入时 \n 被转换为 \r\n，导致已有的 \r\n 变成 \r\r\n
 *
 * 策略：
 * - 读取：优先 UTF-8，失败则回退到系统 locale 编码，最终使用 TextDecoder 容错解码
 * - 写入：原子化写入（临时文件 + fsync + rename），保持原有换行符不变
 */

import { existsSync, statSync, chmodSync, renameSync, unlinkSync, openSync, closeSync, writeSync, fdatasyncSync, readFileSync as nodeReadFileSync, realpathSync } from 'node:fs'
import { dirname, basename } from 'node:path'

/**
 * 将文本内容安全写入文件，原子化操作。
 *
 * 写入流程：
 * 1. 如果目标是符号链接，解析为真实路径
 * 2. 在目标同目录创建临时文件
 * 3. 写入内容并 fsync
 * 4. 保留原文件权限
 * 5. 使用 rename 原子替换
 *
 * 崩溃安全：写入失败时删除临时文件，原文件保持不变
 */
export function writeText(filePath: string, content: string): void {
  const targetReal = existsSync(filePath) && statSync(filePath).isSymbolicLink()
    ? realpathSync(filePath)
    : filePath

  const targetDir = dirname(targetReal)
  const targetBase = basename(targetReal)
  const tmpName = `.${targetBase}.${process.pid}.tmp`
  const tmpPath = targetDir + '/' + tmpName

  let fd: number
  try {
    fd = openSync(tmpPath, 'w', 0o600)
    try {
      const buffer = Buffer.from(content, 'utf-8')
      writeSync(fd, buffer, 0, buffer.length, 0)
      fdatasyncSync(fd)
    } finally {
      closeSync(fd)
    }

    if (existsSync(targetReal)) {
      try {
        const targetMode = statSync(targetReal).mode
        chmodSync(tmpPath, targetMode & 0o7777)
      } catch {
        // 权限获取失败，使用临时文件的默认权限
      }
    }

    renameSync(tmpPath, targetReal)
  } catch (error) {
    try {
      unlinkSync(tmpPath)
    } catch {
      // 清理失败，忽略
    }
    throw error
  }
}

/**
 * 读取文本文件，自动处理编码。
 *
 * 解码顺序：UTF-8（严格） → 系统 locale 编码（严格） → UTF-8 容错解码
 * 行结尾统一为 \n
 */
export function readText(filePath: string, defaultValue?: string): string {
  try {
    const buffer = nodeReadFileSync(filePath)
    return normalizeLineEndings(decodeBuffer(buffer))
  } catch (error) {
    if (defaultValue !== undefined && isNoSuchFileError(error)) {
      return defaultValue
    }
    throw error
  }
}

/**
 * 追加文本到文件（UTF-8，不转换换行符）
 */
export function appendText(filePath: string, content: string): void {
  const fd = openSync(filePath, 'a', 0o644)
  try {
    const buffer = Buffer.from(content, 'utf-8')
    writeSync(fd, buffer, 0, buffer.length, 0)
  } finally {
    closeSync(fd)
  }
}

// ---- 内部辅助函数 ----

function decodeBuffer(buffer: Buffer): string {
  // 尝试 UTF-8
  try {
    return buffer.toString('utf-8')
  } catch {
    // 继续尝试其他编码
  }

  // 尝试系统 locale 编码
  const localeEncoding = getLocaleEncoding()
  if (localeEncoding && localeEncoding.toLowerCase().replace(/[-_]/g, '') !== 'utf8') {
    try {
      return buffer.toString(localeEncoding as BufferEncoding)
    } catch {
      // 继续 fallback
    }
  }

  // 最终 fallback：使用 TextDecoder 容错解码
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
}

function getLocaleEncoding(): string {
  try {
    return process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || 'UTF-8'
  } catch {
    return 'UTF-8'
  }
}

function isNoSuchFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}
