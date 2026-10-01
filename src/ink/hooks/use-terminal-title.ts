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
      // 依赖变化时的清理：把标题重置为不含前缀的会话标题，而不是清空。
      //
      // 原先写空字符串会导致 isIdle 从 false→true（需要用户干预或对话完成）
      // 时，React 先跑旧 effect 的 cleanup 把标题清空，再跑新 effect 写入
      // 含绿方块的标题。两者都写 stdout，顺序虽保证，但空标题会短暂生效，
      // 部分终端（Windows Terminal / conhost）会把这段中间态记进标签页，
      // 表现为绿方块时有时无。改为重置为标题本体，消除中间空态。
      if (process.platform === 'win32') {
        try { process.title = clean } catch { /* ignore */ }
      }
      if (writeRaw) {
        writeRaw(osc(OSC.SET_TITLE_AND_ICON, clean))
      }
    }
  }, [title, writeRaw])
}
