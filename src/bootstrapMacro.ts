import pkg from '../package.json'

type MacroConfig = {
  VERSION: string
  BUILD_TIME: string
  PACKAGE_URL: string
  NATIVE_PACKAGE_URL: string
  VERSION_CHANGELOG: string
  ISSUES_EXPLAINER: string
  FEEDBACK_CHANNEL: string
}

const defaultMacro: MacroConfig = {
  VERSION: pkg.version,
  BUILD_TIME: '',
  PACKAGE_URL: pkg.name,
  NATIVE_PACKAGE_URL: pkg.name,
  VERSION_CHANGELOG: '',
  ISSUES_EXPLAINER:
    '在https://github.com/anthropics/claude-code/issues 提交问题',
  FEEDBACK_CHANNEL: 'github',
}

export function ensureBootstrapMacro(): void {
  if (!('MACRO' in globalThis)) {
    ;(globalThis as typeof globalThis & { MACRO: MacroConfig }).MACRO =
      defaultMacro
  }
}
