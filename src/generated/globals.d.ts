/**
 * Global type declarations for build-time injected variables and other globals.
 *
 * BUILD_ENV, MACRO, and other globals are injected at build time by scripts/inject-macro.ts
 * or by the build pipeline. This file provides TypeScript declarations so the compiler
 * recognizes them during type-checking.
 */

/** Build environment identifier (development | production | test) */
declare const BUILD_ENV: string | undefined

/** Build macro information injected at build time */
declare const MACRO: {
  VERSION: string
  BUILD_TIME: string
  PACKAGE_URL: string
  NATIVE_PACKAGE_URL: string
  VERSION_CHANGELOG: string
  ISSUES_EXPLAINER: string
  FEEDBACK_CHANNEL: string
}

/** Platform identifier injected at build time */
declare const BUILD_PLATFORM: string | undefined

/** Safe JSON stringify helper */
declare function jsonStringify(value: unknown, replacer?: unknown, space?: number): string

/** Diagnostics logging helper */
declare function logForDiagnosticsNoPII(message: string, ...args: unknown[]): void

/** Hook timing display threshold in ms */
declare const HOOK_TIMING_DISPLAY_THRESHOLD_MS: number | undefined

/** BROWSER_TOOLS constant list */
declare const BROWSER_TOOLS: readonly string[] | undefined

/** TTFT text computation function */
declare function computeTtftText(ms: number): string
