/**
 * toolRegistry.ts — 统一工具注册表（吸收 OpenManus 精华）
 *
 * 替代当前的分散式工具注册，提供：
 * 1. 集中注册/注销
 * 2. 按名称/分类/标签查询
 * 3. 工具元数据（参数 schema、权限、注解）
 * 4. 工具关系图谱（依赖、替代、组合）
 * 5. 生命周期钩子（注册前/后、执行前/后）
 */

import type { Tool } from '../../engine/toolScheduler.js'

// ─── 工具元数据 ────────────────────────────────────────────

export interface ToolMetadata {
  name: string
  description: string
  category: 'file' | 'shell' | 'web' | 'git' | 'database' | 'ai' | 'system' | 'communication'
  tags: string[]
  version: string
  author?: string
  deprecated?: boolean
  replacement?: string          // 被哪个工具替代
  requires?: string[]           // 依赖的其他工具
  compatibleWith?: string[]     // 可组合使用的工具
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    title?: string
  }
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  examples?: Array<{
    description: string
    input: Record<string, unknown>
    expectedOutput?: string
  }>
}

// ─── 工具适配器 ────────────────────────────────────────────

export interface ToolAdapter {
  /** 原始工具实例 */
  readonly tool: Tool
  /** 元数据 */
  readonly metadata: ToolMetadata
  /** 执行工具（带包装逻辑） */
  execute(input: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolExecutionResult>
  /** 验证参数 */
  validate(input: Record<string, unknown>): { valid: boolean; errors?: string[] }
  /** 获取权限要求 */
  getPermissionRequirements(): PermissionRequirement[]
}

export interface ToolExecutionContext {
  timeout?: number
  onProgress?: (progress: ToolProgress) => void
  caller?: string
  sessionId?: string
}

export interface ToolExecutionResult {
  success: boolean
  output?: unknown
  error?: string
  errorType?: 'validation' | 'timeout' | 'network' | 'permission' | 'runtime' | 'unknown'
  duration: number
  metadata?: Record<string, unknown>
}

export interface ToolProgress {
  toolName: string
  percent: number
  message?: string
}

export interface PermissionRequirement {
  type: 'read' | 'write' | 'execute' | 'network' | 'admin'
  resource: string
  reason: string
}

// ─── 工具关系 ────────────────────────────────────────────

export interface ToolRelationship {
  type: 'depends_on' | 'replaces' | 'complements' | 'alternative'
  target: string
  description?: string
}

// ─── 注册表事件 ────────────────────────────────────────────

export type RegistryEventType =
  | 'tool:registered'
  | 'tool:unregistered'
  | 'tool:executed'
  | 'tool:failed'
  | 'tool:deprecated'

export interface RegistryEvent {
  type: RegistryEventType
  toolName: string
  timestamp: number
  data?: Record<string, unknown>
}

export type RegistryEventListener = (event: RegistryEvent) => void

// ─── 统一工具注册表 ────────────────────────────────────────────

export class ToolRegistry {
  private tools = new Map<string, ToolAdapter>()
  private relationships = new Map<string, ToolRelationship[]>()
  private listeners = new Set<RegistryEventListener>()
  private executionStats = new Map<string, {
    calls: number
    successes: number
    failures: number
    avgDuration: number
    lastCalled: number
  }>()

  // ─── 注册 ────────────────────────────────────────────

  register(adapter: ToolAdapter): void {
    if (this.tools.has(adapter.metadata.name)) {
      console.warn(`[ToolRegistry] Tool ${adapter.metadata.name} already registered, replacing`)
    }
    this.tools.set(adapter.metadata.name, adapter)
    this.emit({ type: 'tool:registered', toolName: adapter.metadata.name, timestamp: Date.now() })
  }

  registerMany(adapters: ToolAdapter[]): void {
    for (const adapter of adapters) {
      this.register(adapter)
    }
  }

  unregister(name: string): boolean {
    const existed = this.tools.has(name)
    this.tools.delete(name)
    if (existed) {
      this.emit({ type: 'tool:unregistered', toolName: name, timestamp: Date.now() })
    }
    return existed
  }

  // ─── 查询 ────────────────────────────────────────────

  get(name: string): ToolAdapter | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  getAll(): ToolAdapter[] {
    return Array.from(this.tools.values())
  }

  getByCategory(category: string): ToolAdapter[] {
    return this.getAll().filter(t => t.metadata.category === category)
  }

  getByTag(tag: string): ToolAdapter[] {
    return this.getAll().filter(t => t.metadata.tags.includes(tag))
  }

  getReadOnly(): ToolAdapter[] {
    return this.getAll().filter(t => t.metadata.annotations?.readOnlyHint)
  }

  getDestructive(): ToolAdapter[] {
    return this.getAll().filter(t => t.metadata.annotations?.destructiveHint)
  }

  getDeprecated(): ToolAdapter[] {
    return this.getAll().filter(t => t.metadata.deprecated)
  }

  getAlternatives(name: string): ToolAdapter[] {
    const rels = this.relationships.get(name) ?? []
    const alternatives = rels
      .filter(r => r.type === 'alternative')
      .map(r => this.tools.get(r.target))
      .filter((t): t is ToolAdapter => t !== undefined)
    return alternatives
  }

  search(query: string): ToolAdapter[] {
    const q = query.toLowerCase()
    return this.getAll().filter(t =>
      t.metadata.name.toLowerCase().includes(q) ||
      t.metadata.description.toLowerCase().includes(q) ||
      t.metadata.tags.some(tag => tag.toLowerCase().includes(q))
    )
  }

  // ─── 关系管理 ────────────────────────────────────────────

  addRelationship(from: string, rel: ToolRelationship): void {
    const existing = this.relationships.get(from) ?? []
    existing.push(rel)
    this.relationships.set(from, existing)
  }

  getRelationships(name: string): ToolRelationship[] {
    return this.relationships.get(name) ?? []
  }

  // ─── 执行统计 ────────────────────────────────────────────

  getStats(name: string) {
    return this.executionStats.get(name) ?? null
  }

  getAllStats(): Record<string, {
    calls: number
    successes: number
    failures: number
    avgDuration: number
    lastCalled: number
  }> {
    const result: Record<string, unknown> = {}
    for (const [name, stats] of this.executionStats) {
      result[name] = stats
    }
    return result
  }

  recordExecution(name: string, result: ToolExecutionResult): void {
    const stats = this.executionStats.get(name) ?? {
      calls: 0,
      successes: 0,
      failures: 0,
      avgDuration: 0,
      lastCalled: 0,
    }
    stats.calls++
    stats.lastCalled = Date.now()
    if (result.success) {
      stats.successes++
    } else {
      stats.failures++
    }
    // 移动平均
    stats.avgDuration = (stats.avgDuration * (stats.calls - 1) + result.duration) / stats.calls
    this.executionStats.set(name, stats)

    this.emit({
      type: result.success ? 'tool:executed' : 'tool:failed',
      toolName: name,
      timestamp: Date.now(),
      data: { duration: result.duration, errorType: result.errorType },
    })
  }

  // ─── 事件监听 ────────────────────────────────────────────

  on(listener: RegistryEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: RegistryEvent): void {
    for (const listener of this.listeners) {
      try { listener(event) } catch { /* noop */ }
    }
  }

  // ─── 序列化 ────────────────────────────────────────────

  toJSON(): { tools: ToolMetadata[]; relationships: Record<string, ToolRelationship[]> } {
    return {
      tools: this.getAll().map(a => a.metadata),
      relationships: Object.fromEntries(this.relationships),
    }
  }

  get size(): number {
    return this.tools.size
  }
}

// 全局单例
let globalRegistry: ToolRegistry | null = null

export function getGlobalToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry()
  }
  return globalRegistry
}

export function resetGlobalToolRegistry(): void {
  globalRegistry = null
}
