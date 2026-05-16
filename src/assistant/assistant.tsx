// 存根: commands/assistant/assistant.tsx
import * as React from 'react'

export function NewInstallWizard(_props: {
  defaultDir: string
  onInstalled: (dir: string) => void
  onCancel: () => void
  onError: (message: string) => void
}): React.ReactElement {
  return React.createElement('ink-text', null, '新安装向导存根')
}

export async function computeDefaultInstallDir(): Promise<string> {
  return ''
}
