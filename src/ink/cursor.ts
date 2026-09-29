export interface Cursor {
  x: number
  y: number
  visible: boolean
}

export function hideCursor(): string {
  return ''
}

export function showCursor(): string {
  return ''
}
