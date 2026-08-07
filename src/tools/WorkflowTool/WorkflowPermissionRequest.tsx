import React, { useState, useEffect, useCallback } from 'react'
import { useInput } from 'ink'

/**
 * Props for the WorkflowPermissionRequest Ink component.
 */
export interface WorkflowPermissionRequestProps {
  /** Title shown at the top of the dialog. */
  title?: string
  /** Human-readable description of the permission being requested. */
  description?: string
  /** List of permissions the workflow is requesting. */
  permissions: string[]
  /** Callback invoked when the user approves. Receives the granted permissions. */
  onApprove: (permissions: string[]) => void
  /** Callback invoked when the user denies. */
  onDeny: () => void
  /** Whether the dialog is visible. */
  visible?: boolean
}

/**
 * Ink/React component that renders an interactive permission-request dialog
 * for workflows.
 *
 * Keyboard navigation:
 *  - `↑` / `k`  move selection up
 *  - `↓` / `j`  move selection down
 *  - `Space` / `Enter`  toggle the highlighted permission
 *  - `a`  grant all permissions
 *  - `d`  deny all
 *  - `Esc` / `q`  deny and close
 */
export function WorkflowPermissionRequest({
  title = 'Workflow Permission Request',
  description = 'This workflow is requesting the following permissions:',
  permissions,
  onApprove,
  onDeny,
  visible = true,
}: WorkflowPermissionRequestProps): React.ReactNode {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [cursor, setCursor] = useState(0)

  // Reset state when permissions change.
  useEffect(() => {
    setSelected(new Set())
    setCursor(0)
  }, [permissions.join(',')])

  const toggle = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }

  const grantAll = useCallback(() => setSelected(new Set(permissions.map((_, i) => i))), [permissions])
  const denyAll = useCallback(() => {
    onDeny()
  }, [onDeny])
  const submit = useCallback(() => {
    const granted = permissions.filter((_, i) => selected.has(i))
    if (granted.length > 0) {
      onApprove(granted)
    } else {
      onDeny()
    }
  }, [permissions, selected, onApprove, onDeny])

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onDeny()
    } else if (input === 'a') {
      grantAll()
    } else if (input === 'd') {
      denyAll()
    } else if (input === ' ' || key.return) {
      if (input === ' ') {
        toggle(cursor)
      } else {
        submit()
      }
    } else if (key.upArrow || input === 'k') {
      setCursor(c => Math.max(0, c - 1))
    } else if (key.downArrow || input === 'j') {
      setCursor(c => Math.min(permissions.length - 1, c + 1))
    }
  })

  if (!visible) {
    return null
  }

  return (
    <>
      {`${title}\n${description}\n`}
      {permissions.map((perm, i) => {
        const checked = selected.has(i)
        const isCursor = i === cursor
        const prefix = isCursor ? '▸ ' : '  '
        const checkbox = checked ? '[x]' : '[ ]'
        return `${prefix}${checkbox} ${perm}\n`
      })}
      {'\n[a] Grant all  [d] Deny  [Space] Toggle  [Enter] Submit  [Esc] Cancel\n'}
    </>
  )
}
