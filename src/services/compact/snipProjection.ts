import type { Message } from '../../types/message.js'

export function isSnipBoundaryMessage(_msg?: Message): boolean {
  return false
}

export function projectSnippedMessages<T>(messages: T): T {
  return messages
}
