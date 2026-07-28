/**
 * bun:bundle polyfill for Electron environment
 * 原 bun:bundle 用于编译时死代码消除（feature flags）
 * 默认返回 false，可通过环境变量 CLAUDE_CODE_FEATURE_<NAME>=1 启用
 */

const envKey = (name: string) => `CLAUDE_CODE_FEATURE_${name.toUpperCase()}`

export function feature(name: string): boolean {
  const val = process.env[envKey(name)]
  if (val === null || val === undefined || val === '') return false
  return val !== '0' && val.toLowerCase() !== 'false'
}

export namespace feature {
  export function __brand() {
    return undefined
  }
}
