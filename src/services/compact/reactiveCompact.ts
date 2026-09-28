export async function runReactiveCompact<T>(messages: T): Promise<T> {
  return messages
}

export function isReactiveCompactEnabled(): boolean {
  return false
}

export function isWithheldPromptTooLong(_message: unknown): boolean {
  return false
}

export function isWithheldMediaSizeError(_message: unknown): boolean {
  return false
}

export async function tryReactiveCompact<T>(messages: T): Promise<T> {
  return messages
}
