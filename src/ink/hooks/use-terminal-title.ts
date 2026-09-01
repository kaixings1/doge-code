import { useContext, useEffect } from 'react'
import stripAnsi from '../../vendor/stripAnsi.js'
import { OSC, osc } from '../termio/osc.js'
import { TerminalWriteContext } from '../useTerminalNotification.js'

/**
 * Declaratively set the terminal tab/window title.
 *
 * Pass a string to set the title. ANSI escape sequences are stripped
 * automatically so callers don't need to know about terminal encoding.
 * Pass `null` to opt out — the hook becomes a no-op and leaves the
 * terminal title untouched.
 *
 * On Windows, sets both `process.title` (conhost) and OSC 0 (Windows Terminal).
 * Elsewhere, writes OSC 0 (set title+icon) via Ink's stdout.
 *
 * Cleanup: clears the title on unmount to avoid stale title after exit.
 */
export function useTerminalTitle(title: string | null): void {
  const writeRaw = useContext(TerminalWriteContext)

  useEffect(() => {
    if (title === null) return

    const clean = stripAnsi(title)

    if (process.platform === 'win32') {
      try { process.title = clean } catch { /* ignore */ }
      // Windows Terminal supports OSC 0; conhost ignores it harmlessly.
      if (writeRaw) {
        writeRaw(osc(OSC.SET_TITLE_AND_ICON, clean))
      }
    } else if (writeRaw) {
      writeRaw(osc(OSC.SET_TITLE_AND_ICON, clean))
    }

    return () => {
      // Clear title on unmount to avoid stale title persisting after exit
      if (process.platform === 'win32') {
        try { process.title = '' } catch { /* ignore */ }
      }
      if (writeRaw) {
        writeRaw(osc(OSC.SET_TITLE_AND_ICON, ''))
      }
    }
  }, [title, writeRaw])
}
