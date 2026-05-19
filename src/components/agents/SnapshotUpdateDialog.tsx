// Stub: components/agents/SnapshotUpdateDialog.tsx
import * as React from 'react'

export function SnapshotUpdateDialog(_props: {
  agentType: string
  scope: any
  snapshotTimestamp: string
  onComplete: (choice: 'merge' | 'keep' | 'replace') => void
  onCancel: () => void
}): React.ReactElement {
  return React.createElement('ink-text', null, 'SnapshotUpdateDialog stub')
}

export function buildMergePrompt(_agentType: string, _scope: any): string {
  return ''
}
