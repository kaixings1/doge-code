import chalk from 'chalk'
import React, { useContext } from 'react'
import { Text } from '../ink.js'
import { getShortcutDisplay } from '../keybindings/shortcutFormat.js'
import { useShortcutDisplay } from '../keybindings/useShortcutDisplay.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import { InVirtualListContext } from './messageActions.js'

// Context to track if we're inside a sub agent
// Similar to MessageResponseContext, this helps us avoid showing
// too many "（Ctrl+o 展开）" hints in sub agent output
const SubAgentContext = React.createContext(false)
export function SubAgentProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  return (
    <SubAgentContext.Provider value={true}>{children}</SubAgentContext.Provider>
  )
}

export function CtrlOToExpand(): React.ReactNode {
  const isInSubAgent = useContext(SubAgentContext)
  const inVirtualList = useContext(InVirtualListContext)
  const expandShortcut = useShortcutDisplay(
    'app:toggleTranscript',
    'Global',
    'Ctrl+o',
  )
  if (isInSubAgent || inVirtualList) {
    return null
  }
  return (
    <Text dimColor>
      <KeyboardShortcutHint shortcut={expandShortcut} action="展开" parens />
    </Text>
  )
}

export function ctrlOToExpand(): string {
  const shortcut = getShortcutDisplay(
    'app:toggleTranscript',
    'Global',
    'Ctrl+o',
  )
  return chalk.dim(`（${shortcut} 展开）`)
}
