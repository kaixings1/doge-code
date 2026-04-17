import { basename } from 'path'

const SCRIPT_SUFFIX_RE = /\.(?:[cm]?js|ts|tsx|mjs|cjs|exe|cmd|ps1)$/i
const INTERNAL_ENTRYPOINTS = new Set([
  'bootstrap-entry',
  'cli',
  'dev-entry',
  'main',
])

export function getCliCommandName(): string {
  const configured = process.env.CLAUDE_CODE_BIN_NAME?.trim()
  if (configured) {
    return configured
  }

  const invokedPath = process.argv[1]
  if (invokedPath) {
    const candidate = basename(invokedPath).replace(SCRIPT_SUFFIX_RE, '')
    if (candidate && !INTERNAL_ENTRYPOINTS.has(candidate)) {
      return candidate
    }
  }

  return 'claude'
}
