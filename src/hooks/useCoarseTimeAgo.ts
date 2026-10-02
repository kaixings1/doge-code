import { useCallback, useSyncExternalStore } from 'react';
import { formatRelativeTimeAgo } from '../utils/format.js';

/**
 * 阶梯式相对时间（"2m ago"），按指数回退更新：10s / 30s / 1m / 5m / 15m / 30m。
 * 过了 30 分钟就不再设定时器，读数冻结在最后一次 tick 上。
 *
 * 阶梯而非每秒 tick 是刻意的：系统消息位于终端回滚区，每次内容变化都会
 * 强制 log-update 全量重置终端（见 OffscreenFreeze 的说明）。
 */
const TICK_STEPS_MS = [10_000, 30_000, 60_000, 300_000, 900_000, 1_800_000];

export function useCoarseTimeAgo(timestamp?: string | number): string {
  const ts =
    timestamp === undefined || timestamp === null || timestamp === ''
      ? NaN
      : new Date(timestamp).getTime();
  const valid = Number.isFinite(ts);

  const getSnapshot = useCallback(
    () => (valid ? formatRelativeTimeAgo(new Date(ts), { style: 'narrow' }) : ''),
    [valid, ts],
  );

  const subscribe = useCallback(
    (notify: () => void) => {
      if (!valid) return () => {};
      let timer: ReturnType<typeof setTimeout> | undefined;
      const scheduleNext = () => {
        const elapsed = Date.now() - ts;
        const next = TICK_STEPS_MS.find(step => step > elapsed);
        if (next === undefined) return; // 已过最后一个阶梯：停止计时
        timer = setTimeout(() => {
          notify();
          scheduleNext();
        }, Math.max(0, next - elapsed));
      };
      scheduleNext();
      return () => {
        if (timer !== undefined) clearTimeout(timer);
      };
    },
    [valid, ts],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
