// Stub: commands/assistant/assistant.tsx
import * as React from 'react'

export function NewInstallWizard(_props: {
  defaultDir: string
  onInstalled: (dir: string) => void
  onCancel: () => void
  onError: (message: string) => void
}): React.ReactElement {
  return React.createElement('ink-text', null, 'NewInstallWizard stub')
}

export async function computeDefaultInstallDir(): Promise<string> {
  return ''
}
