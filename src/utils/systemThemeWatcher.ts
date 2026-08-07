import { execFile } from 'child_process'
import { promisify } from 'util'
import { logForDebugging } from '../debug.js'

const execFileAsync = promisify(execFile)

type Theme = 'light' | 'dark' | 'unknown'

type SetThemeFn = (theme: Theme) => void

/**
 * Detect the current system theme by querying the OS.
 */
async function detectSystemTheme(): Promise<Theme> {
  const platform = process.platform

  try {
    if (platform === 'darwin') {
      // macOS: check AppleInterfaceStyle — "Dark" means dark mode.
      const { stdout } = await execFileAsync('defaults', [
        'read',
        '-g',
        'AppleInterfaceStyle',
      ])
      return stdout.trim() === 'Dark' ? 'dark' : 'light'
    }

    if (platform === 'win32') {
      // Windows: query the registry for AppsUseLightTheme.
      const { stdout } = await execFileAsync('reg', [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
        '/v',
        'AppsUseLightTheme',
      ])
      const match = stdout.match(/AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-fA-F]+)/)
      if (match) {
        return parseInt(match[1], 16) === 1 ? 'light' : 'dark'
      }
      return 'unknown'
    }

    // Linux / other: check gsettings for GNOME, fallback to unknown.
    try {
      const { stdout } = await execFileAsync('gsettings', [
        'get',
        'org.gnome.desktop.interface',
        'gtk-theme',
      ])
      const theme = stdout.trim().replace(/['"]/g, '')
      return theme.toLowerCase().includes('dark') ? 'dark' : 'light'
    } catch {
      return 'unknown'
    }
  } catch {
    return 'unknown'
  }
}

/**
 * Watch the system theme and invoke `setTheme` whenever it changes.
 *
 * @param querier  - Unused placeholder for future query integration.
 * @param setTheme - Callback invoked with the current theme on change.
 * @returns        A cleanup function that stops the watcher.
 */
export function watchSystemTheme(
  _querier: any,
  setTheme: SetThemeFn,
): () => void {
  let stopped = false
  let lastTheme: Theme = 'unknown'

  logForDebugging('watchSystemTheme: starting')

  async function poll(): Promise<void> {
    if (stopped) return

    const theme = await detectSystemTheme()
    if (theme !== lastTheme && theme !== 'unknown') {
      lastTheme = theme
      try {
        setTheme(theme)
        logForDebugging(`watchSystemTheme: detected ${theme} mode`)
      } catch (error) {
        logForDebugging(
          `watchSystemTheme: setTheme callback failed — ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  // Initial detection.
  void poll()

  // Poll every 5 seconds — theme changes are infrequent and there is no
  // reliable cross-platform event-based notification API available to Node.js.
  const intervalId = setInterval(poll, 5_000)

  return () => {
    stopped = true
    clearInterval(intervalId)
    logForDebugging('watchSystemTheme: stopped')
  }
}
