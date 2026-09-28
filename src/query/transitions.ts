export interface Continue {
  reason: string
  committed?: number
  attempt?: number
}

export interface Terminal {
  reason: string
  finishReason?: string
  canRetry?: boolean
  error?: unknown
  turnCount?: number
}

export function transitionQueryState<T>(value: T): T {
  return value
}
