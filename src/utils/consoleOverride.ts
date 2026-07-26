import { isEnvTruthy } from './envUtils.js'
import { isDebugMode } from './debug.js'

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
 */
const consoleDebugEnabled =
  isEnvTruthy(process.env.CLAUDE_CODE_CONSOLE_DEBUG) ||
  isEnvTruthy(process.env.DEBUG) ||
  isDebugMode()

if (!consoleDebugEnabled) {
  const noop = () => {}
  console.log = noop
  console.info = noop
  console.debug = noop
  console.warn = noop
  // console.error is intentionally NOT overridden
}
