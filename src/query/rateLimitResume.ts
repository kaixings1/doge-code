/**
 * 429（含容量限制如 `tpm_exceeded`）在 withRetry 的重试预算耗尽后，
 * 不能直接把对话结束。这里在 query 层继续等待并重试：
 * 沿用与 withRetry 相同的指数退避（起步 20s、2x、上限 32s+25% 抖动），
 * 并尊重服务端的 Retry-After。
 *
 * 上限：最多追加 RETRY_ROUNDS 轮、每轮最多 sleep 一次。达到上限后才真正结束对话，
 * 并在错误消息里注明。如需更长等待，调大 RETRY_ROUNDS 或改用 CLAUDE_CODE_UNATTENDED_RETRY。
 */

export const RATE_LIMIT_RETRY_ROUNDS = 10;

/** 每轮的附加退避计数器（1 起），对应 withRetry 的 attempt 语义。 */
export function nextRateLimitRound(previous: number): number {
  return previous + 1;
}

/** 是否还应继续等待。 */
export function shouldResumeRateLimit(round: number): boolean {
  return round <= RATE_LIMIT_RETRY_ROUNDS;
}

/**
 * 解析 Retry-After（秒或 HTTP 日期）。非法/缺失返回 null。
 */
export function parseRetryAfterMs(
  header: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  if (!Number.isNaN(seconds)) return seconds > 0 ? seconds * 1000 : null;
  const dateMs = Date.parse(header);
  if (Number.isNaN(dateMs)) return null;
  const delay = dateMs - now;
  return delay > 0 ? delay : null;
}

const BASE_DELAY_MS = 20_000;
const MAX_DELAY_MS = 32_000;

/**
 * 计算本轮等待时长。优先使用 Retry-After，否则指数退避 + 25% 抖动。
 */
export function computeRateLimitDelayMs(
  round: number,
  retryAfterHeader?: string | null,
): number {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  if (retryAfterMs !== null) return retryAfterMs;
  const base = Math.min(
    BASE_DELAY_MS * Math.pow(2, Math.max(0, round - 1)),
    MAX_DELAY_MS,
  );
  return base + Math.random() * 0.25 * base;
}

/** 可被 abort 打断的等待，保证 Ctrl+C 不会卡在退避里。 */
export function sleepInterruptible(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
