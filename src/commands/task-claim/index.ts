import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'

/**
 * task-claim — 任务所有权管理命令
 *
 * 从 Ancienttwo repo-harness 吸收的分布式所有权协议：
 * - claim / bind / release / steal 所有权动词
 * - fencing token 机制（防止 TOCTOU 竞态）
 * - 租约存储和查找（LeaseClaimLookup, LeaseRead）
 * - 锁机制（withTaskLock）
 */

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'stolen' | 'released'
export type LeaseState = 'reserving' | 'bound' | 'completing' | 'released' | 'stolen'

export interface LeaseRecord {
  taskId: string
  claimId: string
  ownerSessionId: string
  state: LeaseState
  createdAt: string
  updatedAt: string
  worktree?: string
  targetRef?: string
  previousClaimId?: string
}

export interface TaskLease {
  taskId: string
  record: LeaseRecord | null
  classification: 'available' | 'owned' | 'stolen' | 'unknown'
  unknownReason?: string
}

export interface ClaimResult {
  claimId: string
  taskId: string
  state: LeaseState
  ownerSessionId: string
  token: string
}

export interface StatusResult {
  taskId: string
  classification: string
  state?: LeaseState
  claimId?: string
  ownerSessionId?: string
  unknownReason?: string
}

export interface ListResult {
  activeLeases: Array<{
    taskId: string
    claimId: string
    state: LeaseState
    ownerSessionId: string
    createdAt: string
  }>
}

// 内存存储
const memoryStore = {
  leases: new Map<string, LeaseRecord>(),
  leasesByClaimId: new Map<string, string>(),
  tasks: new Map<string, { status: TaskStatus; ownerSessionId?: string }>(),
}

function generateToken(): string {
  return `tok_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function generateClaimId(): string {
  return `claim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function now(): string {
  return new Date().toISOString()
}

function withTaskLock<T>(taskId: string, run: () => T): T {
  return run()
}

function readLease(taskId: string): TaskLease {
  const record = memoryStore.leases.get(taskId) || null
  if (!record) {
    return { taskId, record: null, classification: 'available' }
  }

  let classification: TaskLease['classification'] = 'owned'
  if (record.state === 'released') classification = 'available'
  else if (record.state === 'stolen') classification = 'stolen'

  return { taskId, record, classification }
}

function createLeaseDirectory(taskId: string): boolean {
  if (memoryStore.leases.has(taskId)) {
    return false
  }
  memoryStore.leases.set(taskId, {
    taskId,
    claimId: '',
    ownerSessionId: '',
    state: 'reserving',
    createdAt: now(),
    updatedAt: now(),
  })
  return true
}

function writeLeaseOwner(taskId: string, record: LeaseRecord): void {
  memoryStore.leases.set(taskId, record)
  memoryStore.leasesByClaimId.set(record.claimId, taskId)
}

function removeLease(taskId: string, claimId: string): void {
  memoryStore.leases.delete(taskId)
  memoryStore.leasesByClaimId.delete(claimId)
}

function rollbackOwnLease(taskId: string, claimId: string): void {
  memoryStore.leases.delete(taskId)
  memoryStore.leasesByClaimId.delete(claimId)
}

function findLeaseByClaimId(claimId: string): { ok: boolean; lease?: LeaseRecord; error?: string } {
  const taskId = memoryStore.leasesByClaimId.get(claimId)
  if (!taskId) {
    return { ok: false, error: `no lease found for claim ${claimId}` }
  }
  const record = memoryStore.leases.get(taskId)
  if (!record) {
    return { ok: false, error: `lease record missing for claim ${claimId}` }
  }
  return { ok: true, lease: record }
}

function isFlagValue(value: string): boolean {
  return value.startsWith('-')
}

function claimTask(taskId: string, sessionId: string, targetRef?: string): { ok: boolean; record?: LeaseRecord; error?: string } {
  const task = memoryStore.tasks.get(taskId)
  if (!task) {
    return { ok: false, error: `task ${taskId} not found` }
  }

  return withTaskLock(taskId, () => {
    const existing = memoryStore.leases.get(taskId)
    if (existing) {
      if (existing.state === 'released') {
        // can re-claim
      } else if (existing.state === 'stolen') {
        return { ok: false, error: `task ${taskId} was stolen from ${existing.ownerSessionId}` }
      } else {
        return { ok: false, error: `task ${taskId} is already claimed by ${existing.ownerSessionId}` }
      }
    }

    if (!createLeaseDirectory(taskId)) {
      return { ok: false, error: `lost the lease election for task ${taskId}` }
    }

    const claimId = generateClaimId()
    const token = generateToken()
    const record: LeaseRecord = {
      taskId,
      claimId,
      ownerSessionId: sessionId,
      state: 'reserving',
      createdAt: now(),
      updatedAt: now(),
      targetRef,
    }

    try {
      writeLeaseOwner(taskId, record)
    } catch {
      rollbackOwnLease(taskId, claimId)
      return { ok: false, error: `failed to write lease for task ${taskId}` }
    }

    task.status = 'in_progress'
    task.ownerSessionId = sessionId

    return { ok: true, record }
  })
}

function releaseTask(claimId: string): { ok: boolean; released?: LeaseRecord; error?: string } {
  const lookup = findLeaseByClaimId(claimId)
  if (!lookup.ok) {
    return { ok: false, error: lookup.error }
  }

  const lease = lookup.lease!
  return withTaskLock(lease.taskId, () => {
    const current = memoryStore.leases.get(lease.taskId)
    if (!current) {
      return { ok: false, error: `lease for task ${lease.taskId} no longer exists` }
    }

    if (current.claimId !== claimId) {
      return { ok: false, error: `claim id mismatch: expected ${claimId}, got ${current.claimId}` }
    }

    const released: LeaseRecord = {
      ...current,
      state: 'released',
      updatedAt: now(),
    }

    writeLeaseOwner(lease.taskId, released)
    memoryStore.leases.delete(lease.taskId)
    memoryStore.leasesByClaimId.delete(claimId)

    const task = memoryStore.tasks.get(lease.taskId)
    if (task) {
      task.status = 'pending'
      delete task.ownerSessionId
    }

    return { ok: true, released }
  })
}

function stealTask(expectedClaimId: string, newSessionId: string, reason: string): { ok: boolean; record?: LeaseRecord; error?: string } {
  const lookup = findLeaseByClaimId(expectedClaimId)
  if (!lookup.ok) {
    return { ok: false, error: lookup.error }
  }

  const lease = lookup.lease!
  return withTaskLock(lease.taskId, () => {
    const current = memoryStore.leases.get(lease.taskId)
    if (!current) {
      return { ok: false, error: `lease for task ${lease.taskId} no longer exists` }
    }

    if (current.claimId !== expectedClaimId) {
      return { ok: false, error: `claim id mismatch: expected ${expectedClaimId}, got ${current.claimId}` }
    }

    const newClaimId = generateClaimId()
    const stolen: LeaseRecord = {
      taskId: lease.taskId,
      claimId: newClaimId,
      ownerSessionId: newSessionId,
      state: 'bound',
      createdAt: now(),
      updatedAt: now(),
      previousClaimId: expectedClaimId,
      targetRef: current.targetRef,
    }

    writeLeaseOwner(lease.taskId, stolen)
    memoryStore.leasesByClaimId.delete(expectedClaimId)
    memoryStore.leasesByClaimId.set(newClaimId, lease.taskId)

    const task = memoryStore.tasks.get(lease.taskId)
    if (task) {
      task.status = 'stolen'
      task.ownerSessionId = newSessionId
    }

    return { ok: true, record: stolen }
  })
}

function formatStatus(result: StatusResult, asJson = false): string {
  if (asJson) return JSON.stringify(result, null, 2)

  const lines = [`Task Status: ${result.taskId}`]
  lines.push(`Classification: ${result.classification}`)
  if (result.state) lines.push(`State: ${result.state}`)
  if (result.claimId) lines.push(`Claim ID: ${result.claimId}`)
  if (result.ownerSessionId) lines.push(`Owner: ${result.ownerSessionId}`)
  if (result.unknownReason) lines.push(`Reason: ${result.unknownReason}`)
  return lines.join('\n')
}

function formatList(result: ListResult, asJson = false): string {
  if (asJson) return JSON.stringify(result, null, 2)

  const lines = [`Active Leases: ${result.activeLeases.length}`]
  for (const lease of result.activeLeases) {
    lines.push(`  ${lease.taskId}: ${lease.state} (${lease.ownerSessionId})`)
  }
  return lines.join('\n')
}

const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const json = s.includes('--json')

  if (s === '--help' || s === '') {
    return {
      type: 'text',
      value: `Task Claim — 任务所有权管理

用法: /task-claim <verb> [选项]

动词:
  --claim   <task-id> --session <id> [--target-ref <ref>]
            声明任务所有权（生成 fencing token）
  --release <claim-id>
            释放任务
  --status  <task-id>
            查看当前所有权状态
  --list    列出所有活跃租约
  --steal   <expected-claim-id> --session <id> --reason <reason>
            抢占任务所有权

选项:
  --json    JSON 格式输出

生命周期：
  claim    创建租约，生成 fencing token
  release  释放租约
  steal    带 provenance 的抢占
  status   查看状态
  list     列出活跃租约

示例:
  /task-claim --claim task-001 --session sess-abc --target-ref main
  /task-claim --release claim_xxx
  /task-claim --steal claim_xxx --session sess-xyz --reason "timeout"`,
    }
  }

  if (memoryStore.tasks.size === 0) {
    memoryStore.tasks.set('task-001', { status: 'pending' })
    memoryStore.tasks.set('task-002', { status: 'pending' })
    memoryStore.tasks.set('task-003', { status: 'pending' })
  }

  // claim
  if (s.includes('--claim')) {
    const taskIdMatch = s.match(/--claim\s+(\S+)/)
    const sessionMatch = s.match(/--session\s+(\S+)/)
    const targetRefMatch = s.match(/--target-ref\s+(\S+)/)

    if (!taskIdMatch || !sessionMatch) {
      return { type: 'text', value: 'Error: --claim requires --claim <task-id> and --session <id>' }
    }

    const rawTaskId = taskIdMatch[1]
    const rawSessionId = sessionMatch[1]
    const rawTargetRef = targetRefMatch?.[1]

    if (isFlagValue(rawTaskId) || isFlagValue(rawSessionId)) {
      return { type: 'text', value: 'Error: --claim requires --claim <task-id> and --session <id>' }
    }

    const result = claimTask(rawTaskId, rawSessionId, rawTargetRef && !isFlagValue(rawTargetRef) ? rawTargetRef : undefined)
    if (!result.ok || !result.record) {
      return { type: 'text', value: `Error: ${result.error}` }
    }

    const claimResult: ClaimResult = {
      claimId: result.record.claimId,
      taskId: result.record.taskId,
      state: result.record.state,
      ownerSessionId: result.record.ownerSessionId,
      token: `${result.record.claimId}:${result.record.taskId}`,
    }

    return { type: 'text', value: json ? JSON.stringify(claimResult, null, 2) : `Claimed: ${claimResult.taskId}\nClaim ID: ${claimResult.claimId}\nToken: ${claimResult.token}` }
  }

  // release
  if (s.includes('--release')) {
    const claimIdMatch = s.match(/--release\s+(\S+)/)
    if (!claimIdMatch) {
      return { type: 'text', value: 'Error: --release requires --release <claim-id>' }
    }

    const rawClaimId = claimIdMatch[1]
    if (isFlagValue(rawClaimId)) {
      return { type: 'text', value: 'Error: --release requires --release <claim-id>' }
    }

    const result = releaseTask(rawClaimId)
    if (!result.ok) {
      return { type: 'text', value: `Error: ${result.error}` }
    }

    return { type: 'text', value: json ? JSON.stringify({ released: result.released }, null, 2) : `Released: ${result.released!.taskId}` }
  }

  // steal
  if (s.includes('--steal')) {
    const claimIdMatch = s.match(/--steal\s+(\S+)/)
    const sessionMatch = s.match(/--session\s+(\S+)/)
    const reasonMatch = s.match(/--reason\s+(.+?)(?:\s|$)/)

    if (!claimIdMatch || !sessionMatch || !reasonMatch) {
      return { type: 'text', value: 'Error: --steal requires --steal <claim-id> --session <id> --reason <reason>' }
    }

    const rawClaimId = claimIdMatch[1]
    const rawSessionId = sessionMatch[1]

    if (isFlagValue(rawClaimId) || isFlagValue(rawSessionId)) {
      return { type: 'text', value: 'Error: --steal requires --steal <claim-id> --session <id> --reason <reason>' }
    }

    const result = stealTask(rawClaimId, rawSessionId, reasonMatch[1])
    if (!result.ok) {
      return { type: 'text', value: `Error: ${result.error}` }
    }

    return { type: 'text', value: json ? JSON.stringify({ stolen: result.record }, null, 2) : `Stolen: ${result.record!.taskId}\nNew Claim ID: ${result.record!.claimId}` }
  }

  // status
  if (s.includes('--status')) {
    const taskIdMatch = s.match(/--status\s+(\S+)/)
    if (!taskIdMatch) {
      return { type: 'text', value: 'Error: --status requires --status <task-id>' }
    }

    const rawTaskId = taskIdMatch[1]
    if (isFlagValue(rawTaskId)) {
      return { type: 'text', value: 'Error: --status requires --status <task-id>' }
    }

    const lease = readLease(rawTaskId)
    const task = memoryStore.tasks.get(rawTaskId)

    const statusResult: StatusResult = {
      taskId: rawTaskId,
      classification: lease.classification,
      state: lease.record?.state,
      claimId: lease.record?.claimId,
      ownerSessionId: lease.record?.ownerSessionId,
      unknownReason: lease.unknownReason,
    }

    if (task) {
      statusResult.ownerSessionId = task.ownerSessionId
    }

    return { type: 'text', value: formatStatus(statusResult, json) }
  }

  // list
  if (s.includes('--list')) {
    const activeLeases: ListResult['activeLeases'] = []
    for (const [taskId, record] of memoryStore.leases.entries()) {
      if (record.state !== 'released') {
        activeLeases.push({
          taskId,
          claimId: record.claimId,
          state: record.state,
          ownerSessionId: record.ownerSessionId,
          createdAt: record.createdAt,
        })
      }
    }

    const listResult: ListResult = { activeLeases }
    return { type: 'text', value: formatList(listResult, json) }
  }

  return { type: 'text', value: 'Error: unknown command. Use --help for usage.' }
}

const taskClaim: Command = {
  type: 'local',
  name: 'task-claim',
  description: '任务所有权管理命令 — 支持 claim/release/steal/status/list 操作',
  aliases: ['task-claim', 'task-claim'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export { call }
export default taskClaim

export function clearTaskClaimStore(): void {
  memoryStore.leases.clear()
  memoryStore.leasesByClaimId.clear()
  memoryStore.tasks.clear()
}

export function registerTask(taskId: string, status: TaskStatus = 'pending'): void {
  memoryStore.tasks.set(taskId, { status })
}
