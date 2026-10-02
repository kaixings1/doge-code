import type { Message } from '../../types/message.js'

export function snipCompactIfNeeded<T>(messages: T, _options?: unknown): {
  messages: T
  changed: boolean
  tokensFreed?: number
  boundaryMessage?: unknown
} {
  return { messages, changed: false }
}

export function isSnipBoundaryMessage(_msg?: Message): boolean {
  return false
}

export function isSnipRuntimeEnabled(): boolean {
  return false
}

export function isSnipMarkerMessage(_msg?: Message): boolean {
  return false
}

export const SNIP_NUDGE_TEXT = ''
