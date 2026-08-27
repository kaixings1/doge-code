/**
 * memdir/knowledgeStore.ts — 知识存储抽象层（absorbed from ag2 KnowledgeStore + agentset RAG pipeline）
 *
 * 为记忆系统提供统一的存储后端接口，支持：
 * - disk: 基于文件系统的持久化存储（当前实现）
 * - memory: 基于内存的临时存储（测试/临时会话）
 * - custom: 外部存储实现（Redis/Vector DB 等）
 *
 * 吸收自 ag2ai-ag2 的 KnowledgeStore + DiskKnowledgeStore 模式。
 * 吸收自 agentset 的 RAG pipeline：支持 embedding-based 语义检索。
 */

import * as fs from "fs"
import * as path from "path"

/** 计算两个向量的余弦相似度（吸收自 agentset CodeVectorStore） */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

/** 知识条目 */
export interface KnowledgeEntry {
  /** 条目 ID（通常为文件名或 UUID） */
  id: string
  /** 条目内容 */
  content: string
  /** 创建时间戳（ms） */
  createdAt: number
  /** 最后修改时间戳（ms） */
  updatedAt: number
  /** 可选标签，用于过滤和检索 */
  tags?: string[]
  /** 可选元数据 */
  metadata?: Record<string, unknown>
  /** 可选的 embedding 向量（吸收自 agentset CodeVectorStore） */
  embedding?: number[]
  /** 自动技能记录：描述此条目关联的技能或行为模式（支持多技能） */
  autoSkill?: Array<{
    /** 技能名称 */
    skill: string
    /** 关联强度（0-1） */
    weight: number
    /** 最后匹配时间戳（ms） */
    lastMatched?: number
  }>
}

/** 语义检索选项（吸收自 agentset CodeVectorStore） */
export interface SemanticSearchOptions {
  /** 最大返回条目数 */
  limit?: number
  /** 最小相似度阈值（0-1） */
  minScore?: number
  /** 自定义 embedding 函数：文本 -> 向量 */
  embedder?: (text: string) => number[]
}

/** 知识存储查询参数 */
export interface KnowledgeQuery {
  /** 查询文本（用于语义检索） */
  query?: string
  /** 标签过滤 */
  tags?: string[]
  /** 时间范围：创建时间晚于此值（ms） */
  createdAfter?: number
  /** 时间范围：创建时间早于此值（ms） */
  createdBefore?: number
  /** 最大返回条目数 */
  limit?: number
  /** 最小相似度阈值（0-1），用于 embedding 检索（吸收自 agentset） */
  minScore?: number
}

/** 知识存储抽象接口（absorbed from ag2 KnowledgeStore） */
export interface KnowledgeStore {
  /** 添加一个知识条目 */
  add(entry: Omit<KnowledgeEntry, 'createdAt' | 'updatedAt'>): Promise<KnowledgeEntry>
  /** 根据 ID 获取条目 */
  get(id: string): Promise<KnowledgeEntry | null>
  /** 更新条目 */
  update(id: string, updates: Partial<Omit<KnowledgeEntry, 'id' | 'createdAt'>>): Promise<KnowledgeEntry | null>
  /** 删除条目 */
  delete(id: string): Promise<boolean>
  /** 查询条目 */
  query(query: KnowledgeQuery): Promise<KnowledgeEntry[]>
  /** 列出所有条目 ID */
  listIds(): Promise<string[]>
  /** 清空所有条目 */
  clear(): Promise<void>
  /** 语义检索：返回按相似度排序的条目（吸收自 agentset RAG pipeline） */
  semanticSearch?(queryText: string, options?: { limit?: number; minScore?: number }): Promise<Array<{ entry: KnowledgeEntry; score: number }>>
  /** 关联检索：根据 autoSkill 标签和标签重叠度查找相关条目（吸收自 Supermemory 关联记忆） */
  associate?(entryId: string, options?: { limit?: number; minWeight?: number }): Promise<Array<{ entry: KnowledgeEntry; score: number }>>
}

/** 磁盘知识存储实现（absorbed from ag2 DiskKnowledgeStore） */
export class DiskKnowledgeStore implements KnowledgeStore {
  private storePath: string
  private writeCache = new Map<string, KnowledgeEntry>()

  constructor(storePath: string) {
    this.storePath = path.resolve(storePath)
    fs.mkdirSync(this.storePath, { recursive: true })
  }

  private entryPath(id: string): string {
    const safeId = path.basename(id).replace(/[^a-zA-Z0-9_-]/g, '_')
    return path.join(this.storePath, `${safeId}.json`)
  }

  private now(): number {
    return Date.now()
  }

  async add(entry: Omit<KnowledgeEntry, 'createdAt' | 'updatedAt'>): Promise<KnowledgeEntry> {
    const id = entry.id ?? `entry_${this.now()}_${Math.random().toString(36).slice(2, 8)}`
    const full: KnowledgeEntry = {
      ...entry,
      id,
      createdAt: this.now(),
      updatedAt: this.now(),
    }
    await this.writeEntry(full)
    this.writeCache.set(id, full)
    return full
  }

  async get(id: string): Promise<KnowledgeEntry | null> {
    const cached = this.writeCache.get(id)
    if (cached) return cached
    try {
      const raw = await fs.promises.readFile(this.entryPath(id), 'utf-8')
      return JSON.parse(raw) as KnowledgeEntry
    } catch {
      return null
    }
  }

  async update(id: string, updates: Partial<Omit<KnowledgeEntry, 'id' | 'createdAt'>>): Promise<KnowledgeEntry | null> {
    const existing = await this.get(id)
    if (!existing) return null
    const updated: KnowledgeEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: this.now(),
    }
    await this.writeEntry(updated)
    this.writeCache.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<boolean> {
    try {
      await fs.promises.unlink(this.entryPath(id))
      this.writeCache.delete(id)
      return true
    } catch {
      return false
    }
  }

  async query(q: KnowledgeQuery): Promise<KnowledgeEntry[]> {
    const ids = await this.listIds()
    const results: KnowledgeEntry[] = []
    for (const id of ids) {
      const entry = await this.get(id)
      if (!entry) continue
      // 标签过滤
      if (q.tags && q.tags.length > 0) {
        const hasTag = q.tags.some(t => entry.tags?.includes(t))
        if (!hasTag) continue
      }
      // 时间范围过滤
      if (q.createdAfter && entry.createdAt < q.createdAfter) continue
      if (q.createdBefore && entry.createdAt > q.createdBefore) continue
      // 简单文本匹配（语义检索应由上层调用 LLM 完成）
      if (q.query) {
        const queryLower = q.query.toLowerCase()
        const contentLower = entry.content.toLowerCase()
        if (!contentLower.includes(queryLower)) continue
      }
      results.push(entry)
      if (q.limit && results.length >= q.limit) break
    }
    return results
  }

  async listIds(): Promise<string[]> {
    try {
      const files = await fs.promises.readdir(this.storePath)
      return files.filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
    } catch {
      return []
    }
  }

  async clear(): Promise<void> {
    const ids = await this.listIds()
    await Promise.all(ids.map(id => this.delete(id)))
    this.writeCache.clear()
  }

  /** 语义检索：按 embedding 相似度排序（吸收自 agentset CodeVectorStore） */
  async semanticSearch(queryText: string, options?: SemanticSearchOptions): Promise<Array<{ entry: KnowledgeEntry; score: number }>> {
    const limit = options?.limit ?? 10
    const minScore = options?.minScore ?? 0
    const embedder = options?.embedder
    if (!embedder) {
      // 无 embedding 函数时回退到文本匹配
      return (await this.query({ query: queryText, limit })).map(e => ({ entry: e, score: 1 }))
    }
    const queryVec = embedder(queryText)
    const ids = await this.listIds()
    const scored: Array<{ entry: KnowledgeEntry; score: number }> = []
    for (const id of ids) {
      const entry = await this.get(id)
      if (!entry?.embedding) continue
      const score = cosineSimilarity(queryVec, entry.embedding)
      if (score >= minScore) scored.push({ entry, score })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }

  /** 关联检索：根据 autoSkill 标签和标签重叠度查找相关条目（吸收自 Supermemory 关联记忆） */
  async associate(entryId: string, options?: { limit?: number; minWeight?: number }): Promise<Array<{ entry: KnowledgeEntry; score: number }>> {
    const limit = options?.limit ?? 10
    const minWeight = options?.minWeight ?? 0.1
    const source = await this.get(entryId)
    if (!source) return []
    const sourceTags = new Set(source.tags ?? [])
    const sourceSkills = new Set<string>(source.autoSkill?.map(a => a.skill) ?? [])
    const ids = await this.listIds()
    const scored: Array<{ entry: KnowledgeEntry; score: number }> = []
    const now = Date.now()
    for (const id of ids) {
      if (id === entryId) continue
      const entry = await this.get(id)
      if (!entry) continue
      let score = 0
      // autoSkill 标签匹配（权重最高，带时间衰减）
      if (entry.autoSkill) {
        for (const a of entry.autoSkill) {
          if (sourceSkills.has(a.skill)) {
            let weight = a.weight
            // 时间衰减：超过 7 天未匹配则衰减（吸收自 Supermemory 关联记忆时效性）
            if (a.lastMatched) {
              const ageDays = (now - a.lastMatched) / 86400000
              if (ageDays > 7) weight *= Math.max(0.3, 1 - (ageDays - 7) * 0.1)
            }
            score += weight * 0.6
          }
        }
      }
      // 标签重叠
      if (entry.tags && sourceTags.size > 0) {
        const overlap = entry.tags.filter(t => sourceTags.has(t)).length
        score += (overlap / Math.max(entry.tags.length, 1)) * 0.4
      }
      if (score >= minWeight) scored.push({ entry, score })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }

  private async writeEntry(entry: KnowledgeEntry): Promise<void> {
    const p = this.entryPath(entry.id)
    const tmp = p + '.tmp'
    await fs.promises.writeFile(tmp, JSON.stringify(entry, null, 2), 'utf-8')
    await fs.promises.rename(tmp, p)
  }
}

/** 内存知识存储实现（用于测试和临时会话） */
export class MemoryKnowledgeStore implements KnowledgeStore {
  private store = new Map<string, KnowledgeEntry>()
  private now: () => number

  constructor(now = () => Date.now()) {
    this.now = now
  }

  async add(entry: Omit<KnowledgeEntry, 'createdAt' | 'updatedAt'>): Promise<KnowledgeEntry> {
    const id = entry.id ?? `mem_${this.now()}_${Math.random().toString(36).slice(2, 8)}`
    const full: KnowledgeEntry = {
      ...entry,
      id,
      createdAt: this.now(),
      updatedAt: this.now(),
    }
    this.store.set(id, full)
    return full
  }

  async get(id: string): Promise<KnowledgeEntry | null> {
    return this.store.get(id) ?? null
  }

  async update(id: string, updates: Partial<Omit<KnowledgeEntry, 'id' | 'createdAt'>>): Promise<KnowledgeEntry | null> {
    const existing = this.store.get(id)
    if (!existing) return null
    const updated: KnowledgeEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: this.now(),
    }
    this.store.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id)
  }

  async query(q: KnowledgeQuery): Promise<KnowledgeEntry[]> {
    let results = Array.from(this.store.values())
    if (q.tags && q.tags.length > 0) {
      results = results.filter(e => q.tags!.some(t => e.tags?.includes(t)))
    }
    if (q.createdAfter) results = results.filter(e => e.createdAt >= q.createdAfter)
    if (q.createdBefore) results = results.filter(e => e.createdAt <= q.createdBefore)
    if (q.query) {
      const ql = q.query.toLowerCase()
      results = results.filter(e => e.content.toLowerCase().includes(ql))
    }
    if (q.limit) results = results.slice(0, q.limit)
    return results
  }

  async listIds(): Promise<string[]> {
    return Array.from(this.store.keys())
  }

  async clear(): Promise<void> {
    this.store.clear()
  }

  /** 语义检索：按 embedding 相似度排序（吸收自 agentset CodeVectorStore） */
  async semanticSearch(queryText: string, options?: SemanticSearchOptions): Promise<Array<{ entry: KnowledgeEntry; score: number }>> {
    const limit = options?.limit ?? 10
    const minScore = options?.minScore ?? 0
    const embedder = options?.embedder
    if (!embedder) {
      return (await this.query({ query: queryText, limit })).map(e => ({ entry: e, score: 1 }))
    }
    const queryVec = embedder(queryText)
    const scored: Array<{ entry: KnowledgeEntry; score: number }> = []
    for (const [id, entry] of this.store) {
      if (!entry.embedding) continue
      const score = cosineSimilarity(queryVec, entry.embedding)
      if (score >= minScore) scored.push({ entry, score })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }

  /** 关联检索：根据 autoSkill 标签和标签重叠度查找相关条目（吸收自 Supermemory 关联记忆） */
  async associate(entryId: string, options?: { limit?: number; minWeight?: number }): Promise<Array<{ entry: KnowledgeEntry; score: number }>> {
    const limit = options?.limit ?? 10
    const minWeight = options?.minWeight ?? 0.1
    const source = this.store.get(entryId)
    if (!source) return []
    const sourceTags = new Set(source.tags ?? [])
    const sourceSkills = new Set<string>(source.autoSkill?.map(a => a.skill) ?? [])
    const scored: Array<{ entry: KnowledgeEntry; score: number }> = []
    const now = Date.now()
    for (const [id, entry] of this.store) {
      if (id === entryId) continue
      let score = 0
      // autoSkill 标签匹配（权重最高，带时间衰减）
      if (entry.autoSkill) {
        for (const a of entry.autoSkill) {
          if (sourceSkills.has(a.skill)) {
            let weight = a.weight
            // 时间衰减：超过 7 天未匹配则衰减（吸收自 Supermemory 关联记忆时效性）
            if (a.lastMatched) {
              const ageDays = (now - a.lastMatched) / 86400000
              if (ageDays > 7) weight *= Math.max(0.3, 1 - (ageDays - 7) * 0.1)
            }
            score += weight * 0.6
          }
        }
      }
      // 标签重叠
      if (entry.tags && sourceTags.size > 0) {
        const overlap = entry.tags.filter(t => sourceTags.has(t)).length
        score += (overlap / Math.max(entry.tags.length, 1)) * 0.4
      }
      if (score >= minWeight) scored.push({ entry, score })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }
}
