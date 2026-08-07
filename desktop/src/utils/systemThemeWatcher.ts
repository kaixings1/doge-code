import { nativeTheme } from 'electron'

/**
 * Watch for system theme changes and invoke the callback.
 * Uses Electron's nativeTheme API with matchMedia fallback for non-Electron environments.
 */
export function watchSystemTheme(
  _querier: any,
  setTheme: (theme: any) => void,
): () => void {
  // Apply current theme immediately.
  setTheme(nativeTheme.shouldUseDarkColors ? 'dark' : 'light')

  const onUpdated = () => {
    setTheme(nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
  }

  nativeTheme.on('updated', onUpdated)

  // Fallback: also listen to matchMedia for OS-level changes that may not
  // trigger nativeTheme events in all Electron versions.
  let mediaQuery: MediaQueryList | null = null
  try {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener?.('change', onUpdated)
  } catch {
    // matchMedia may not be available in some contexts.
  }

  // Return cleanup function.
  return () => {
    nativeTheme.removeListener('updated', onUpdated)
    mediaQuery?.removeEventListener?.('change', onUpdated)
  }
}
