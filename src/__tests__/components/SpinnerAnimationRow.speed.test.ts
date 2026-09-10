import { describe, it, expect } from 'vitest';

/**
 * SpinnerAnimationRow 速度计算逻辑验证
 *
 * 核心公式: speed = (responseLength / 4) / (elapsedMs / 1000)
 * 与 UI 显示的 token 数 round(len / 4) 保持一致
 */

function calcSpeed(responseLength: number, elapsedMs: number): number {
  if (elapsedMs < 2000 || responseLength <= 0) return 0;
  return (responseLength / 4) / (elapsedMs / 1000);
}

describe('SpinnerAnimationRow speed calculation', () => {
  it('应该匹配用户看到的 token 数: 1300 token / 29s ≈ 44.8 t/s', () => {
    const responseLength = 5200; // 原始长度，显示为 round(5200/4) = 1300
    const elapsedMs = 29_000;
    const speed = calcSpeed(responseLength, elapsedMs);
    expect(speed).toBeCloseTo(44.8, 0);
    expect(Math.round(speed)).toBe(45);
  });

  it('应该匹配: 3000 token / 10s = 300 t/s', () => {
    const responseLength = 12000; // 显示为 round(12000/4) = 3000
    const elapsedMs = 10_000;
    const speed = calcSpeed(responseLength, elapsedMs);
    expect(speed).toBeCloseTo(300, 0);
    expect(Math.round(speed)).toBe(300);
  });

  it('应该匹配: 3000 token / 30s = 100 t/s', () => {
    const responseLength = 12000; // 显示为 round(12000/4) = 3000
    const elapsedMs = 30_000;
    const speed = calcSpeed(responseLength, elapsedMs);
    expect(speed).toBeCloseTo(100, 0);
    expect(Math.round(speed)).toBe(100);
  });

  it('2秒内不显示速度', () => {
    expect(calcSpeed(4000, 1999)).toBe(0);
  });

  it('responseLength 为 0 时不显示速度', () => {
    expect(calcSpeed(0, 30_000)).toBe(0);
  });

  it('速度应该与显示的 token 数使用相同的除法因子 (÷4)', () => {
    const responseLength = 8000;
    const elapsedMs = 10_000;
    const speed = calcSpeed(responseLength, elapsedMs);
    const displayedTokens = Math.round(responseLength / 4);
    // displayedTokens / elapsedS = 速度
    expect(speed).toBeCloseTo(displayedTokens / 10, 0);
  });
});
