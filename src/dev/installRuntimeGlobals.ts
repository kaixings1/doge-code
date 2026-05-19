import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getSecureStorage } from '../utils/secureStorage/index.js'

type MacroConfig = {
  VERSION: string
  BUILD_TIME?: string
  PACKAGE_URL: string
  NATIVE_PACKAGE_URL?: string
  FEEDBACK_CHANNEL: string
  ISSUES_EXPLAINER: string
  VERSION_CHANGELOG?: string
}

function readLocalVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version?: string }

    if (typeof packageJson.version === 'string' && packageJson.version.length > 0) {
      return packageJson.version
    }
  } catch {
    // Fall through to the source snapshot version below.
  }

  return '2.1.88-source.0'
}

function getDefaultDevConfigDir(): string {
  return process.env.CLAUDE_CODE_DEV_CONFIG_DIR || join(process.cwd(), '.claude-dev')
}

function readDefaultCredentials(): string | null {
  const hostCredentialsPath = join(process.env.HOME || '', '.claude', '.credentials.json')
  if (process.env.HOME && existsSync(hostCredentialsPath)) {
    return readFileSync(hostCredentialsPath, 'utf8')
  }

  const credentials = getSecureStorage().read()
  if (!credentials || Object.keys(credentials).length === 0) {
    return null
  }

  return JSON.stringify(credentials)
}

function configureDevConfigDir(): void {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return
  }

  const devConfigDir = getDefaultDevConfigDir()
  mkdirSync(devConfigDir, { recursive: true })

  const devCredentialsPath = join(devConfigDir, '.credentials.json')
  if (!existsSync(devCredentialsPath)) {
    const defaultCredentials = readDefaultCredentials()
    if (defaultCredentials) {
      writeFileSync(devCredentialsPath, defaultCredentials, 'utf8')
      chmodSync(devCredentialsPath, 0o600)
    }
  }

  process.env.CLAUDE_CONFIG_DIR = devConfigDir
}

configureDevConfigDir()

const defaults: MacroConfig = {
  VERSION: process.env.CLAUDE_CODE_DEV_VERSION || readLocalVersion(),
  BUILD_TIME: process.env.CLAUDE_CODE_DEV_BUILD_TIME,
  PACKAGE_URL: '@anthropic-ai/claude-code',
  NATIVE_PACKAGE_URL: process.env.CLAUDE_CODE_NATIVE_PACKAGE_URL,
  FEEDBACK_CHANNEL: 'https://github.com/anthropics/claude-code/issues',
  ISSUES_EXPLAINER:
    'open an issue at https://github.com/anthropics/claude-code/issues',
  VERSION_CHANGELOG: process.env.CLAUDE_CODE_DEV_CHANGELOG || '',
}

globalThis.MACRO = {
  ...defaults,
  ...(typeof globalThis.MACRO === 'undefined' ? {} : globalThis.MACRO),
}
