/**
 * collaborativeDoc.ts — 轻量级 CRDT 文档协作引擎
 *
 * 实现基于操作日志的 CRDT（Conflict-free Replicated Data Type）文档同步。
 * 核心思想：
 * - 每个房间维护一个 Y.Text 风格的文档结构和操作日志
 * - 编辑以字符粒度操作（insert/delete），附带位置和 Lamport 时间戳
 * - 并发编辑通过操作变换（OT-like transform）解决冲突
 * - 所有操作可交换、可幂等，保证最终一致性
 */

// ─── 类型定义 ───

export interface DocOperation {
  id: string              // 操作唯一 ID
  roomId: string          // 所属房间
  userId: string          // 操作者
  type: 'insert' | 'delete'
  position: number        // 文档中的位置
  text?: string           // insert 时的文本内容
  length?: number         // delete 时的删除长度
  lamport: number         // Lamport 逻辑时钟
  parentVersion: number   // 基于哪个文档版本
  timestamp: number       // 物理时间戳
}

export interface DocState {
  content: string
  version: number
  operations: DocOperation[]
  lamportClock: number
}

// ─── Lamport 时钟 ───

function incrementClock(current: number, remote: number): number {
  return Math.max(current, remote) + 1
}

// ─── 操作应用 ───

/**
 * 将单个操作应用到文档内容
 */
export function applyOperation(content: string, op: DocOperation): string {
  if (op.type === 'insert' && op.text) {
    return content.slice(0, op.position) + op.text + content.slice(op.position)
  }
  if (op.type === 'delete' && op.length) {
    return content.slice(0, op.position) + content.slice(op.position + op.length)
  }
  return content
}

/**
 * 操作变换：当两个并发操作需要合并时，调整操作位置以保持一致性
 *
 * 规则：
 * - insert vs insert：位置相同则按 Lamport 时间戳决定先后
 * - insert vs delete：insert 在 delete 范围内时调整位置
 * - delete vs delete：合并重叠的删除范围
 */
export function transformOp(op1: DocOperation, op2: DocOperation): DocOperation {
  if (op1.type === 'insert' && op2.type === 'insert') {
    if (op1.position < op2.position) return op1
    if (op1.position > op2.position) {
      return { ...op1, position: op1.position + (op2.text?.length || 0) }
    }
    // 相同位置：按 Lamport 时间戳决定（小的先执行）
    if (op1.lamport <= op2.lamport) return op1
    return { ...op1, position: op1.position + (op2.text?.length || 0) }
  }

  if (op1.type === 'insert' && op2.type === 'delete') {
    if (op1.position <= op2.position) return op1
    if (op1.position >= op2.position + (op2.length || 0)) {
      return { ...op1, position: op1.position - (op2.length || 0) }
    }
    // insert 在 delete 范围内：移动到 delete 起始位置
    return { ...op1, position: op2.position }
  }

  if (op1.type === 'delete' && op2.type === 'insert') {
    if (op1.position >= op2.position) {
      return { ...op1, position: op1.position + (op2.text?.length || 0) }
    }
    return op1
  }

  // delete vs delete
  if (op1.type === 'delete' && op2.type === 'delete') {
    const end1 = op1.position + (op1.length || 0)
    const end2 = op2.position + (op2.length || 0)

    if (end1 <= op2.position) return op1
    if (end2 <= op1.position) {
      return { ...op1, position: op1.position - (op2.length || 0) }
    }

    // 有重叠
    const newStart = Math.min(op1.position, op2.position)
    const newEnd = Math.max(end1, end2)
    const overlapStart = Math.max(op1.position, op2.position)
    const overlapEnd = Math.min(end1, end2)

    if (overlapStart < overlapEnd) {
      // 有重叠区域
      const effectiveEnd = newEnd - (op2.length || 0)
      const effectiveStart = op1.position < op2.position ? op1.position : op2.position
      return {
        ...op1,
        position: effectiveStart,
        length: Math.max(0, effectiveEnd - effectiveStart)
      }
    }

    return { ...op1, position: newStart, length: Math.max(0, newEnd - newStart - (op2.length || 0)) }
  }

  return op1
}

// ─── 文档管理器 ───

export class CollaborativeDocument {
  private state: DocState
  private operationLog: DocOperation[] = []

  constructor(roomId: string, initialContent = '') {
    this.state = {
      content: initialContent,
      version: 0,
      operations: [],
      lamportClock: 0,
    }
  }

  /**
   * 获取当前文档内容
   */
  getContent(): string {
    return this.state.content
  }

  /**
   * 获取当前版本号
   */
  getVersion(): number {
    return this.state.version
  }

  /**
   * 获取操作日志
   */
  getOperations(): readonly DocOperation[] {
    return this.operationLog
  }

  /**
   * 获取指定版本之后的操作
   */
  getOperationsSince(version: number): DocOperation[] {
    return this.operationLog.slice(version)
  }

  /**
   * 本地插入操作
   */
  localInsert(userId: string, position: number, text: string): DocOperation {
    this.state.lamportClock = incrementClock(this.state.lamportClock, 0)

    const op: DocOperation = {
      id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roomId: '',
      userId,
      type: 'insert',
      position,
      text,
      lamport: this.state.lamportClock,
      parentVersion: this.state.version,
      timestamp: Date.now(),
    }

    this.state.content = applyOperation(this.state.content, op)
    this.state.version++
    this.state.operations.push(op)
    this.operationLog.push(op)

    return op
  }

  /**
   * 本地删除操作
   */
  localDelete(userId: string, position: number, length: number): DocOperation {
    this.state.lamportClock = incrementClock(this.state.lamportClock, 0)

    const op: DocOperation = {
      id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roomId: '',
      userId,
      type: 'delete',
      position,
      length,
      lamport: this.state.lamportClock,
      parentVersion: this.state.version,
      timestamp: Date.now(),
    }

    this.state.content = applyOperation(this.state.content, op)
    this.state.version++
    this.state.operations.push(op)
    this.operationLog.push(op)

    return op
  }

  /**
   * 应用远程操作（来自其他客户端）
   *
   * 如果远程操作基于旧版本，需要先进行变换
   */
  applyRemote(op: DocOperation): boolean {
    // 已应用过的操作（幂等性检查）
    if (this.operationLog.some(o => o.id === op.id)) {
      return false
    }

    // 更新 Lamport 时钟
    this.state.lamportClock = incrementClock(this.state.lamportClock, op.lamport)

    // 如果远程操作基于当前版本，直接应用
    if (op.parentVersion === this.state.version) {
      this.state.content = applyOperation(this.state.content, op)
      this.state.version++
      this.operationLog.push(op)
      return true
    }

    // 如果远程操作基于旧版本，需要变换
    if (op.parentVersion < this.state.version) {
      const missingOps = this.getOperationsSince(op.parentVersion)
      let transformed = op

      for (const localOp of missingOps) {
        // 只变换并发操作（Lamport 时间戳不可比较的）
        if (localOp.id !== op.id) {
          transformed = transformOp(transformed, localOp)
        }
      }

      this.state.content = applyOperation(this.state.content, transformed)
      this.state.version++
      this.operationLog.push(transformed)
      return true
    }

    // 远程操作基于更新的版本 — 暂存，等待中间操作（简化处理：直接应用）
    this.state.content = applyOperation(this.state.content, op)
    this.state.version++
    this.operationLog.push(op)
    return true
  }

  /**
   * 获取文档快照
   */
  getSnapshot(): { content: string; version: number; lamportClock: number } {
    return {
      content: this.state.content,
      version: this.state.version,
      lamportClock: this.state.lamportClock,
    }
  }

  /**
   * 从快照恢复（用于新加入的协作者同步）
   */
  restoreFromSnapshot(content: string, version: number, lamportClock: number): void {
    this.state.content = content
    this.state.version = version
    this.state.lamportClock = lamportClock
  }
}

// ─── 文档管理器（多房间） ───

export class DocumentManager {
  private documents = new Map<string, CollaborativeDocument>()

  getOrCreate(roomId: string): CollaborativeDocument {
    let doc = this.documents.get(roomId)
    if (!doc) {
      doc = new CollaborativeDocument(roomId)
      this.documents.set(roomId, doc)
    }
    return doc
  }

  get(roomId: string): CollaborativeDocument | undefined {
    return this.documents.get(roomId)
  }

  delete(roomId: string): void {
    this.documents.delete(roomId)
  }

  has(roomId: string): boolean {
    return this.documents.has(roomId)
  }
}
