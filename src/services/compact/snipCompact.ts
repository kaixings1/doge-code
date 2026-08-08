export function snipCompactIfNeeded<T>(messages: T, _options?: unknown): {
  messages: T
  changed: boolean
} {
  return { messages, changed: false }
}

export function isSnipBoundaryMessage(): boolean {
  return false
}

export function isSnipRuntimeEnabled(): boolean {
  return false
}

export const SNIP_NUDGE_TEXT = ''
