/**
 * WebFetch URL 缓存 TTL 解析（对齐官方 CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS，v2.1.233）。
 *
 * 单独成文件的原因：该值在模块加载时求值，测试必须能反复重置模块缓存后重新求值。
 * 若放在 utils.ts 里，每次 import 都会拉起 axios / turndown / claude.js 等重依赖，
 * 单测代价过高。这里只依赖 process.env，零副作用。
 */

export const DEFAULT_WEBFETCH_CACHE_TTL_MS = 15 * 60 * 1000 // 15 分钟

/**
 * 解析 CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS。
 * 非法值（NaN、Infinity、负数、0）一律回落到默认值：
 * 0 会让缓存形同虚设，负数会让 lru-cache 的 ttl 语义失效，都不应静默接受。
 */
export function resolveWebFetchCacheTtlMs(
  raw: string | undefined = process.env.CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS,
): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WEBFETCH_CACHE_TTL_MS
}
