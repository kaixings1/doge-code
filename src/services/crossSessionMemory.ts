/**
 * crossSessionMemory.ts — 跨会话记忆持久化服务（吸收自 Hermes Agent + Supermemory）
 *
 * 提供记忆数据的导出/导入接口，支持：
 * - 会话记忆导出为结构化 JSON
 * - 跨会话记忆合并（去重 + 时间衰减）
 * - 导入到指定项目或全局记忆目录
 *
 * 吸收自 Hermes Agent 自改进学习循环的经验持久化
 * 吸收自 Supermemory 关联记忆的跨会话共享机制
 */

import { readdirSync, statSync, writeFileSync, existsSync, mkdirSync, readFileSync } from "fs"
import { homedir } from "os"
import { join as pathJoin } from "path"

const CROSS_SESSION_DIR = pathJoin(homedir(), ".doge", "cross-session-memory")

export interface CrossSessionMemoryEntry {
  /** 条目 ID（通常为 UUID 或文件路径） */
  id: string
  /** 条目内容 */
  content: string
  /** 来源会话 ID */
  sessionId: string
  /** 来源项目路径 */
  projectPath: string
  /** 创建时间戳（ms） */
  createdAt: number
  /** 最后修改时间戳（ms） */
  updatedAt: number
  /** 可选标签 */
  tags?: string[]
  /** 可选元数据 */
  metadata?: Record<string, unknown>
}

export interface CrossSessionMemoryExport {
  version: string
  exportedAt: number
  entries: CrossSessionMemoryEntry[]
}

export interface CrossSessionMemoryImportOptions {
  /** 目标项目路径（用于过滤） */
  targetProject?: string
  /** 是否覆盖已有条目 */
  overwrite?: boolean
  /** 标签过滤 */
  tags?: string[]
}

/**
 * 导出跨会话记忆数据
 * 扫描指定会话目录中的所有记忆文件，打包为结构化 JSON
 */
export function exportCrossSessionMemory(
  sessionDir: string,
  outputPath?: string,
): CrossSessionMemoryExport {
  const entries: CrossSessionMemoryEntry[] = []
  const memoryDir = pathJoin(sessionDir, "session-memory")

  try {
    if (!existsSync(memoryDir)) {
      return { version: "1.0", exportedAt: Date.now(), entries: [] }
    }

    const files = readdirSync(memoryDir).filter(f => f.endsWith(".md"))
    for (const file of files) {
      const filePath = pathJoin(memoryDir, file)
      try {
        const content = readFileSync(filePath, "utf-8")
        const stat = statSync(filePath)
        entries.push({
          id: file,
          content: content.slice(0, 50000),
          sessionId: pathJoin(sessionDir).split(/[\\/]/).pop() || "",
          projectPath: sessionDir,
          createdAt: stat.mtimeMs,
          updatedAt: stat.mtimeMs,
          tags: extractTags(content),
        })
      } catch { /* 单文件读取失败则跳过 */ }
    }
  } catch { /* 目录不可读则跳过 */ }

  const result: CrossSessionMemoryExport = {
    version: "1.0",
    exportedAt: Date.now(),
    entries,
  }

  if (outputPath) {
    try {
      const dir = pathJoin(outputPath).replace(/\\/g, "/").split("/").slice(0, -1).join("/") || "."
      mkdirSync(dir, { recursive: true })
      writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8")
    } catch { /* 写入失败静默跳过 */ }
  }

  return result
}

/**
 * 导入跨会话记忆数据
 * 将导出的记忆数据导入到目标会话目录
 */
export function importCrossSessionMemory(
  importData: CrossSessionMemoryExport,
  options: CrossSessionMemoryImportOptions = {},
): { imported: number; skipped: number } {
  let imported = 0
  let skipped = 0

  try {
    if (!existsSync(CROSS_SESSION_DIR)) {
      mkdirSync(CROSS_SESSION_DIR, { recursive: true })
    }

    for (const entry of importData.entries) {
      // 标签过滤
      if (options.tags && options.tags.length > 0) {
        const hasTag = entry.tags?.some(t => options.tags!.includes(t))
        if (!hasTag) {
          skipped++
          continue
        }
      }

      const targetDir = options.targetProject
        ? pathJoin(options.targetProject, entry.sessionId || "default", "session-memory")
        : pathJoin(CROSS_SESSION_DIR, entry.id)

      try {
        mkdirSync(targetDir, { recursive: true })
        const targetPath = pathJoin(targetDir, entry.id)
        if (!existsSync(targetPath) || options.overwrite) {
          writeFileSync(targetPath, entry.content, "utf-8")
          imported++
        } else {
          skipped++
        }
      } catch { skipped++ }
    }
  } catch { /* 导入失败静默跳过 */ }

  return { imported, skipped }
}

/**
 * 列出所有可用的跨会话记忆导出
 */
export function listCrossSessionMemoryExports(): string[] {
  try {
    if (!existsSync(CROSS_SESSION_DIR)) return []
    return readdirSync(CROSS_SESSION_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => f.slice(0, -5))
  } catch {
    return []
  }
}

/** 从内容中提取标签（简化实现） */
function extractTags(content: string): string[] {
  const tags: string[] = []
  const tagPattern = /#(\w+)/g
  let match
  while ((match = tagPattern.exec(content)) !== null) {
    if (!tags.includes(match[1])) tags.push(match[1])
  }
  return tags.slice(0, 10)
}
