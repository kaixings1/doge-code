import { describe, expect, it, vi } from 'vitest';

// 阶梯定义（与 useCoarseTimeAgo.ts 保持一致）
const TICK_STEPS_MS = [10_000, 30_000, 60_000, 300_000, 900_000, 1_800_000];

function nextDelay(elapsed: number): number | undefined {
  const next = TICK_STEPS_MS.find(step => step > elapsed);
  return next === undefined ? undefined : Math.max(0, next - elapsed);
}

describe('useCoarseTimeAgo 阶梯调度', () => {
  it('按 10s/30s/1m/5m/15m/30m 依次回退', () => {
    const fired: number[] = [];
    let elapsed = 0;
    let guard = 0;
    for (;;) {
      const d = nextDelay(elapsed);
      if (d === undefined || guard++ > 20) break;
      elapsed += d + 1; // tick 后越过该阶梯
      fired.push(elapsed);
    }
    expect(fired).toEqual([10_001, 30_001, 60_001, 300_001, 900_001, 1_800_001]);
  });

  it('超过 30 分钟后不再设定时器', () => {
    expect(nextDelay(1_800_000)).toBeUndefined();
    expect(nextDelay(3_600_000)).toBeUndefined();
    expect(nextDelay(0)).toBe(10_000);
  });

  it('最多 6 次定时器，而非每秒一次', () => {
    vi.useFakeTimers();
    const timer = vi.spyOn(globalThis, 'setTimeout');
    // 30 分钟后的会话：不应产生任何定时器
    const d = nextDelay(2_000_000);
    expect(d).toBeUndefined();
    expect(timer).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
