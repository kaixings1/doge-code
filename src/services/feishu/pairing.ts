/**
 * 飞书长连接配对：一次性配对码 + 持久化绑定。
 *
 * 目的：让「飞书私聊机器人发一条消息」这台机器就连上，无需公网回调地址，
 * 也不需要每次重配。流程：
 *   1. CLI 启动长连接后生成 6 位配对码，打印在终端（或 /feishu 命令里）。
 *   2. 用户在飞书私聊机器人发送 `/pair 123456`。
 *   3. 服务端校验并写入绑定文件，之后该 chat 的消息直接进本机会话队列。
 *
 * 绑定文件：~/.doge/feishu-bind.json
 * 只保存 chat_id / open_id / 绑定时间，不保存任何密钥。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

export const PAIRING_CODE_TTL_MS = 15 * 60 * 1000
export const PAIRING_CODE_LENGTH = 6

export type FeishuBinding = {
  chatId: string
  chatType: 'p2p' | 'group'
  openId?: string
  boundAt: string
  /** 机器人自身 open_id，绑定后用于群聊 @ 判定。 */
  botOpenId?: string
}

export type FeishuBindStore = {
  version: 1
  bindings: FeishuBinding[]
}

function bindFilePath(): string {
  return join(getClaudeConfigHomeDir(), 'feishu-bind.json')
}

/** 生成 6 位数字配对码（避免 0/O、1/I 混淆的场景这里是纯数字，无歧义）。 */
export function generatePairingCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    code += String(Math.floor(random() * 10))
  }
  return code
}

/**
 * 从消息文本里解析配对指令。
 * 支持 `/pair 123456`、`pair 123456`、`123456`（纯数字）。
 * 不匹配时返回 null，交由正常对话流程处理。
 */
export function parsePairCommand(text: string): string | null {
  const trimmed = text.trim()
  const withCmd = /^\/?pair\s+(\d{6})$/i.exec(trimmed)
  if (withCmd) return withCmd[1]!
  if (/^\d{6}$/.test(trimmed)) return trimmed
  return null
}

/** 常量时间比较，避免按位泄露配对码。 */
export function codeMatches(input: string, expected: string): boolean {
  if (input.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < input.length; i++) {
    diff |= input.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

export function readBindings(path: string = bindFilePath()): FeishuBindStore {
  try {
    if (!existsSync(path)) return { version: 1, bindings: [] }
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as FeishuBindStore
    if (!raw || !Array.isArray(raw.bindings)) return { version: 1, bindings: [] }
    return { version: 1, bindings: raw.bindings }
  } catch {
    return { version: 1, bindings: [] }
  }
}

/** 写入绑定（同 chatId 覆盖），返回写入后的完整列表。 */
export function saveBinding(
  binding: FeishuBinding,
  path: string = bindFilePath(),
): FeishuBinding[] {
  const store = readBindings(path)
  const next = store.bindings.filter(b => b.chatId !== binding.chatId)
  next.push(binding)
  writeBindings({ version: 1, bindings: next }, path)
  return next
}

export function removeBinding(chatId: string, path: string = bindFilePath()): FeishuBinding[] {
  const store = readBindings(path)
  const next = store.bindings.filter(b => b.chatId !== chatId)
  writeBindings({ version: 1, bindings: next }, path)
  return next
}

function writeBindings(store: FeishuBindStore, path: string): void {
  try {
    mkdirSync(join(path, '..'), { recursive: true })
  } catch {
    // 目录已存在
  }
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf-8')
}

/**
 * 一次性配对码持有者。
 *
 * 生命周期 15 分钟或首次成功配对后失效。多次启动会生成新码并作废旧码，
 * 避免终端里残留的旧二维码/旧码被误用。
 */
export class PairingSession {
  private code: string | null = null
  private issuedAt = 0
  private readonly ttlMs: number
  private readonly random: () => number

  constructor(options: { ttlMs?: number; random?: () => number } = {}) {
    this.ttlMs = options.ttlMs ?? PAIRING_CODE_TTL_MS
    this.random = options.random ?? Math.random
  }

  /** 生成（或复用未过期的）配对码。 */
  issue(now: number = Date.now()): string {
    if (this.code && now - this.issuedAt < this.ttlMs) return this.code
    this.code = generatePairingCode(this.random)
    this.issuedAt = now
    return this.code
  }

  /** 校验并消费配对码：成功一次后立即失效。 */
  consume(input: string, now: number = Date.now()): boolean {
    if (!this.code) return false
    if (now - this.issuedAt >= this.ttlMs) {
      this.code = null
      return false
    }
    if (!codeMatches(input, this.code)) return false
    this.code = null
    return true
  }

  /** 当前有效码（用于展示）；未生成或已过期返回 null。 */
  current(now: number = Date.now()): string | null {
    if (!this.code) return null
    return now - this.issuedAt < this.ttlMs ? this.code : null
  }

  invalidate(): void {
    this.code = null
  }
}
