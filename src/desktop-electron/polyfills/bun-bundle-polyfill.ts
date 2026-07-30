/**
 * Polyfill for Bun's `bun:bundle` feature flag system.
 * In Electron, all features are disabled at runtime.
 * The original `feature()` function from `bun:bundle` is a compile-time
 * dead-code elimination mechanism — here we provide a runtime fallback.
 */
export function feature(name: string): boolean {
  return false
}
