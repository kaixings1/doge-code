import { useEffect, useRef } from 'react'
import {
  CLEAR_PROGRAM_STATUS,
  programStatus,
  wrapForMultiplexer,
} from '../termio/osc.js'
import { TerminalWriteContext } from '../useTerminalNotification.js'
import { useContext } from 'react'
import type { TabStatusKind } from './use-tab-status.js'

/**
 * Declaratively report this session's working state via the Claude Code
 * Program Status Protocol (OSC 7501).
 *
 * Emits `ESC ] 7501 ; <state> BEL` where `state` is one of `busy` / `idle` /
 * `waiting` / `done`. Terminals that implement the protocol show a per-session
 * status (working / waiting on you / done); terminals that don't discard the
 * sequence silently, so this is safe to call unconditionally — matching the
 * upstream behavior (there is nothing for the user to turn on).
 *
 * Pass `null` to opt out (e.g. when `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`
 * disables terminal status reporting). Transitioning to `null` emits
 * CLEAR_PROGRAM_STATUS so toggling off mid-session doesn't leave a stale
 * status. Output is wrapped for tmux/screen DCS passthrough.
 *
 * Only the foreground REPL mounts this hook, so background sessions never
 * report status — that constraint is satisfied by construction.
 */
export function useProgramStatus(kind: TabStatusKind | null): void {
  const writeRaw = useContext(TerminalWriteContext)
  const prevKindRef = useRef<TabStatusKind | null>(null)

  useEffect(() => {
    if (kind === null) {
      if (prevKindRef.current !== null && writeRaw) {
        writeRaw(wrapForMultiplexer(CLEAR_PROGRAM_STATUS))
      }
      prevKindRef.current = null
      return
    }

    prevKindRef.current = kind
    if (!writeRaw) return
    // OSC 7501 uses the same idle/busy/waiting vocabulary as the session
    // status machine; `idle` already covers the "done" case (task finished,
    // nothing pending). Terminals render it as "done / waiting on you / working".
    writeRaw(wrapForMultiplexer(programStatus(kind)))
  }, [kind, writeRaw])
}
