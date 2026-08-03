/**
 * 输入防抖器：防止用户在短时间内重复提交相同内容
 *
 * 对应 OpenClaw inbound-debounce.ts：保护主查询循环免受
 * rapid-fire 输入（连击、重复粘贴、端口抖动）的影响
 *
 * 整合自 OpenClaw:
 * - snapshotDebounce: 简单快照防抖（原版，针对重复内容）
 * - KeyedDebouncer: 按键级防抖队列（来自 inbound-debounce.ts，针对重复事件）
 */

export type DebounceConfig = {
 readonly windowMs: number
 readonly maxDupes: number
}

export type DebounceResult = {
 readonly dropped: boolean
 readonly dupesSkipped: number
}

const DEFAULT_CONFIG: DebounceConfig = { windowMs: 1500, maxDupes: 3 }
let lastFingerprint = ''
let lastSeenAt = 0
let repeatCount = 0

export function resetDebounce(): void {
 lastFingerprint = ''
 lastSeenAt = 0
 repeatCount = 0
}

export function checkInputDebounce(
 input: string,
 config: DebounceConfig = DEFAULT_CONFIG,
): DebounceResult {
 if (typeof input !== 'string' || input.trim() === '') {
 return { dropped: false, dupesSkipped: 0 }
 }
 const now = Date.now()
 const normalized = input.trim()
 if (now - lastSeenAt > config.windowMs || normalized !== lastFingerprint) {
 lastFingerprint = normalized
 lastSeenAt = now
 repeatCount = 1
 return { dropped: false, dupesSkipped: 0 }
 }
 repeatCount++
 const dupesSkipped = repeatCount - 1
 const shouldDrop = repeatCount > config.maxDupes
 return { dropped: shouldDrop, dupesSkipped }
}

export function snapshotDebounceState() {
 return { fingerprint: lastFingerprint, count: repeatCount }
}
// ===== 按键级防抖队列（来自 OpenClaw inbound-debounce.ts） =====

export type KeyedDebounceParams<T> = {
 debounceMs: number
 maxTrackedKeys?: number
 buildKey: (item: T) => string | null | void
 shouldDebounce?: (item: T) => boolean
 resolveDebounceMs?: (item: T) => number | void
 onFlush: (items: T[]) => Promise<void>
 onError?: (err: unknown, items: T[]) => void
}

type DebounceBuffer<T> = {
 items: T[]
 timeout: ReturnType<typeof setTimeout> | null
 debounceMs: number
 releaseReady: () => void
 readyReleased: boolean
 task: Promise<void>
}

const DEFAULT_MAX_TRACKED_KEYS = 2048

export function createKeyedDebouncer<T>(params: KeyedDebounceParams<T>) {
 const buffers = new Map<string, DebounceBuffer<T>>()
 const keyChains = new Map<string, Promise<void>>()
 const defaultDebounceMs = Math.max(0, Math.trunc(params.debounceMs))
 const maxTrackedKeys = Math.max(1, Math.trunc(params.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_KEYS))

 const resolveDebounceMs = (item: T) => {
 const resolved = params.resolveDebounceMs?.(item)
 if (typeof resolved !== 'number' || !Number.isFinite(resolved)) {
 return defaultDebounceMs
 }
 return Math.max(0, Math.trunc(resolved))
 }

 const runFlush = async (items: T[]) => {
 try { await params.onFlush(items) }
 catch (err) { try { params.onError?.(err, items) } catch {} }
 }

 const enqueueKeyTask = (key: string, task: () => Promise<void>) => {
 const previous = keyChains.get(key) ?? Promise.resolve()
 const next = previous.catch(() => {}).then(task)
 const settled = next.catch(() => {})
 keyChains.set(key, settled)
 settled.finally(() => { if (keyChains.get(key) === settled) keyChains.delete(key) })
 return next
 }

 const enqueueReservedKeyTask = (key: string, task: () => Promise<void>) => {
 let readyReleased = false
 let releaseReady!: () => void
 const ready = new Promise<void>((resolve) => { releaseReady = resolve })
 return {
 task: enqueueKeyTask(key, async () => { await ready; await task() }),
 release: () => { if (!readyReleased) { readyReleased = true; releaseReady() } },
 }
 }

 const releaseBuffer = (buffer: DebounceBuffer<T>) => {
 if (buffer.readyReleased) return
 buffer.readyReleased = true
 buffer.releaseReady()
 }

 const flushBuffer = async (key: string, buffer: DebounceBuffer<T>) => {
 if (buffers.get(key) === buffer) buffers.delete(key)
 if (buffer.timeout) { clearTimeout(buffer.timeout); buffer.timeout = null }
 releaseBuffer(buffer)
 await buffer.task
 }

 const scheduleFlush = (key: string, buffer: DebounceBuffer<T>) => {
 if (buffer.timeout) clearTimeout(buffer.timeout)
 buffer.timeout = setTimeout(async () => { await flushBuffer(key, buffer) }, buffer.debounceMs)
 buffer.timeout.unref?.()
 }

 const canTrackKey = (key: string) => {
 if (buffers.has(key) || keyChains.has(key)) return true
 return new Set([...buffers.keys(), ...keyChains.keys()]).size < maxTrackedKeys
 }

 const flushKey = async (key: string) => {
 const buffer = buffers.get(key)
 if (!buffer) return
 await flushBuffer(key, buffer)
 }

 const enqueue = async (item: T) => {
 const key = params.buildKey(item)
 const debounceMs = resolveDebounceMs(item)
 const canDebounce = debounceMs > 0 && (params.shouldDebounce?.(item) ?? true)

 if (!canDebounce || !key) {
 if (key) {
 if (buffers.has(key)) {
 const reservedTask = enqueueReservedKeyTask(key, async () => { await runFlush([item]) })
 try { await flushKey(key) } finally { reservedTask.release() }
 await reservedTask.task
 return
 }
 if (keyChains.has(key)) {
 await enqueueKeyTask(key, async () => { await runFlush([item]) })
 return
 }
 await runFlush([item])
 } else {
 await runFlush([item])
 }
 return
 }

 const existing = buffers.get(key)
 if (existing) {
 existing.items.push(item)
 existing.debounceMs = debounceMs
 scheduleFlush(key, existing)
 return
 }
 if (!canTrackKey(key)) {
 await enqueueKeyTask(key, async () => { await runFlush([item]) })
 return
 }

 let buffer!: DebounceBuffer<T>
 const reservedTask = enqueueReservedKeyTask(key, async () => {
 if (buffer.items.length === 0) return
 await runFlush(buffer.items)
 })
 buffer = {
 items: [item], timeout: null, debounceMs,
 releaseReady: reservedTask.release, readyReleased: false, task: reservedTask.task,
 }
 buffers.set(key, buffer)
 scheduleFlush(key, buffer)
 }

 return { enqueue, flushKey }
}
