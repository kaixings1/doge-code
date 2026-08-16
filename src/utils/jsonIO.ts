/**
 * JSON 文件读写工具
 * 吸收自 agno (agno_infra/agno/utilities/json_io.py)
 *
 * - readJsonFile: 读取 JSON 文件
 * - writeJsonFile: 写入 JSON 文件（Date 自动序列化为 ISO）
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * 读取 JSON 文件。
 * @returns 解析后的对象，文件不存在或解析失败返回 null
 */
export function readJsonFile(filePath: string): unknown {
  if (!existsSync(filePath)) return null
  try {
    const content = readFileSync(filePath, 'utf8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * 写入 JSON 文件。
 * @param filePath 目标文件路径
 * @param data 要序列化的数据（Date 自动转 ISO 字符串）
 * @param space 缩进空格数，默认 4
 */
export function writeJsonFile(filePath: string, data: unknown, space = 4): void {
  const dir = dirname(filePath)
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const json = JSON.stringify(data, (_key, value) => {
    if (value instanceof Date) {
      return value.toISOString()
    }
    return value
  }, space)
  writeFileSync(filePath, json, 'utf8')
}
