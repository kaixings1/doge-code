import { isEnvTruthy } from './envUtils.js'

/**
 * Console output gate for production performance.
 *
 * When CLAUDE_CODE_CONSOLE_DEBUG is not set or falsy:
 * - console.log/info/debug/warn are silently discarded
 * - console.error is always preserved (critical errors must be visible)
 *
 * When CLAUDE_CODE_CONSOLE_DEBUG=1 or true:
 * - All console output passes through normally
 *
 * This must be imported BEFORE any other module to intercept
 * all console calls across the entire application.
 *
 * NOTE: `--debug-file` must NOT open this gate. It only redirects
 * `logForDebugging()` output to a file; it never implies that raw console
 * writes should be painted onto the terminal. `isDebugMode()` returns true
 * whenever `--debug-file` is present, so relying on it here let every
 * background task's console.log leak straight into Ink's alt screen (the
 * "后台输出闪现到界面" symptom on Windows, where patchStderr is skipped).
 */
const consoleDebugEnabled =
  isEnvTruthy(process.env.CLAUDE_CODE_CONSOLE_DEBUG) ||
  isEnvTruthy(process.env.DEBUG)

if (!consoleDebugEnabled) {
  const noop = () => {}
  console.log = noop
  console.info = noop
  console.debug = noop
  console.warn = noop
  // console.error is intentionally NOT overridden
}
