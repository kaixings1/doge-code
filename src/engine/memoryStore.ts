/**
 * engine/memoryStore.ts — 记忆分层存储（ULTRA 阶段 C4）
 *
 * 短期（会话级）/ 中期（项目级）/ 长期（跨项目）记忆自动分层：
 *
 * - session：进程内 Map，会话结束即消失（会话内上下文）
 * - project：<project>/.doge/memory/project.json（项目专属知识，如架构决策、约定）
 * - global：~/.doge/memory/global.json（跨项目通用记忆，如用户偏好、常用模式）
 *
 * 分层策略：
 * - set 未指定 level 时按内容启发式选择（含项目路径/文件 → project；用户偏好/通用 → global）
 * - search 默认跨全部层检索，支持按层/标签过滤
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// ============================================================================
// Types
// ============================================================================

export type MemoryLevel = 'session' | 'project' | 'global'

export interface MemoryEntry {
  key: string
  value: string
  level: MemoryLevel
  /** 标签（用于分类检索） */
  tags?: string[]
  /** 会话作用域（session 层用） */
  scope?: string
  createdAt: number
  updatedAt: number
}

export interface MemoryStoreOptions {
  /** 项目根目录（project 层文件位置） */
  projectDir?: string
  /** 全局记忆目录（默认 ~/.doge/memory） */
  globalDir?: string
  /** 会话作用域标识 */
  sessionScope?: string
}

export interface SearchMemoryOptions {
  levels?: MemoryLevel[]
  tags?: string[]
  limit?: number
}

export interface MemoryStats {
  session: number
  project: number
  global: number
  total: number
}

// ============================================================================
// MemoryStore
// ============================================================================

export class MemoryStore {
  private session = new Map<string, MemoryEntry>()
  private project = new Map<string, MemoryEntry>()
  private global = new Map<string, MemoryEntry>()
  private projectDir: string | null
  private globalDir: string
  private sessionScope: string

  constructor(options: MemoryStoreOptions = {}) {
    this.projectDir = options.projectDir ?? null
    this.globalDir = options.globalDir ?? path.join(os.homedir(), '.doge', 'memory')
    this.sessionScope = options.sessionScope ?? 'default'
    this.load('project')
    this.load('global')
  }

  // ─── 内部存取 ───

  private mapFor(level: MemoryLevel): Map<string, MemoryEntry> {
    switch (level) {
      case 'session': return this.session
      case 'project': return this.project
      case 'global': return this.global
    }
  }

  private fileFor(level: MemoryLevel): string | null {
    switch (level) {
      case 'session': return null
      case 'project': return this.projectDir ? path.join(this.projectDir, '.doge', 'memory', 'project.json') : null
      case 'global': return path.join(this.globalDir, 'global.json')
    }
  }

  private load(level: MemoryLevel): void {
    const file = this.fileFor(level)
    if (!file) return
    try {
      if (!fs.existsSync(file)) return
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
      if (!raw || typeof raw !== 'object' || !raw.entries) return
      const map = this.mapFor(level)
      for (const entry of raw.entries as MemoryEntry[]) {
        if (entry && entry.key) map.set(entry.key, entry)
      }
    } catch { /* 损坏则忽略 */ }
  }

  private save(level: MemoryLevel): void {
    const file = this.fileFor(level)
    if (!file) return
    try {
      const dir = path.dirname(file)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const entries = Array.from(this.mapFor(level).values())
      fs.writeFileSync(file, JSON.stringify({ version: 1, entries }, null, 2), 'utf-8')
    } catch { /* 保存失败忽略 */ }
  }

  // ─── 启发式分层 ───

  private autoLevel(key: string, value: string): MemoryLevel {
    const text = `${key} ${value}`
    // 项目专属（路径/文件/模块）→ project
    if (/[\w./-]+\.(ts|tsx|js|py|go|rs|json|md)\b|\.\/|src\/|\.doge\//.test(text)) return 'project'
    // 用户偏好/通用 → global
    if (/偏好|喜欢|习惯|不要|总是|偏好|prefer|喜欢用/i.test(text)) return 'global'
    return 'session'
  }

  // ─── 写入 ───

  set(
    key: string,
    value: string,
    options: { level?: MemoryLevel; tags?: string[] } = {},
  ): MemoryEntry {
    const level = options.level ?? this.autoLevel(key, value)
    const now = Date.now()
    const existing = this.mapFor(level).get(key)
    const entry: MemoryEntry = {
      key,
      value,
      level,
      tags: options.tags ?? existing?.tags,
      scope: level === 'session' ? this.sessionScope : existing?.scope,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    this.mapFor(level).set(key, entry)
    this.save(level)
    return entry
  }

  // ─── 读取 ───

  get(key: string, level?: MemoryLevel): MemoryEntry | null {
    if (level) return this.mapFor(level).get(key) ?? null
    // 按 全局 → 项目 → 会话 的优先级读取（长期记忆优先）
    return this.global.get(key) ?? this.project.get(key) ?? this.session.get(key) ?? null
  }

  has(key: string, level?: MemoryLevel): boolean {
    return this.get(key, level) !== null
  }

  // ─── 删除 ───

  delete(key: string, level?: MemoryLevel): boolean {
    if (level) {
      const ok = this.mapFor(level).delete(key)
      if (ok) this.save(level)
      return ok
    }
    let removed = false
    for (const l of ['global', 'project', 'session'] as MemoryLevel[]) {
      if (this.mapFor(l).delete(key)) {
        this.save(l)
        removed = true
      }
    }
    return removed
  }

  // ─── 检索 ───

  search(query: string, options: SearchMemoryOptions = {}): MemoryEntry[] {
    const levels = options.levels ?? (['global', 'project', 'session'] as MemoryLevel[])
    const limit = options.limit ?? 20
    const qLower = query.toLowerCase()
    const terms = qLower.split(/\s+/).filter(Boolean)

    const results: MemoryEntry[] = []
    for (const level of levels) {
      for (const entry of this.mapFor(level).values()) {
        if (options.tags && options.tags.length > 0) {
          if (!entry.tags?.some(t => options.tags!.includes(t))) continue
        }
        if (terms.length === 0) {
          results.push(entry)
          continue
        }
        const haystack = `${entry.key} ${entry.value} ${entry.tags?.join(' ') ?? ''}`.toLowerCase()
        if (terms.every(t => haystack.includes(t))) {
          results.push(entry)
        }
      }
    }
    // 按 updatedAt 降序
    results.sort((a, b) => b.updatedAt - a.updatedAt)
    return results.slice(0, limit)
  }

  /** 按标签检索 */
  byTag(tag: string, level?: MemoryLevel): MemoryEntry[] {
    const levels = level ? [level] : (['global', 'project', 'session'] as MemoryLevel[])
    const results: MemoryEntry[] = []
    for (const l of levels) {
      for (const entry of this.mapFor(l).values()) {
        if (entry.tags?.includes(tag)) results.push(entry)
      }
    }
    results.sort((a, b) => b.updatedAt - a.updatedAt)
    return results
  }

  // ─── 清空与统计 ───

  clear(level?: MemoryLevel): void {
    if (level) {
      this.mapFor(level).clear()
      this.save(level)
      return
    }
    for (const l of ['global', 'project', 'session'] as MemoryLevel[]) {
      this.mapFor(l).clear()
      this.save(l)
    }
  }

  stats(): MemoryStats {
    return {
      session: this.session.size,
      project: this.project.size,
      global: this.global.size,
      total: this.session.size + this.project.size + this.global.size,
    }
  }
}

/** 便捷工厂 */
export function createMemoryStore(options?: MemoryStoreOptions): MemoryStore {
  return new MemoryStore(options)
}
