/**
 * Runtime polyfill for Bun's `bun:bundle` feature flag system.
 * In CLI mode (bun run), feature flags default to false.
 * This polyfill reads from environment variables to allow runtime override:
 *   CLAUDE_CODE_FEATURE_<NAME>=1  → enables the feature
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
