// Stub: assistant/AssistantSessionChooser.tsx
import * as React from 'react'

export interface AssistantSession {
  id: string
  [key: string]: any
}

export function AssistantSessionChooser(_props: {
  sessions: AssistantSession[]
  onSelect: (id: string) => void
  onCancel: () => void
}): React.ReactElement {
  return React.createElement('ink-text', null, 'AssistantSessionChooser stub')
}
