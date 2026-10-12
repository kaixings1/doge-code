import { describe, it, expect } from 'vitest';
import { BRAILLE_FRAMES, BRAILLE_INTERVAL_MS, brailleFrameAt } from '../../components/ToolUseLoader.js';

/**
 * ToolUseLoader 盲文旋转器帧选择逻辑。
 * 直接调用生产代码导出的纯函数，而非在测试里复刻算法。
 */

describe('brailleFrameAt', () => {
  it('t=0 取第一帧', () => {
    expect(brailleFrameAt(0)).toBe('⠋');
  });

  it('每过一个间隔前进一帧', () => {
    expect(brailleFrameAt(BRAILLE_INTERVAL_MS)).toBe('⠙');
    expect(brailleFrameAt(BRAILLE_INTERVAL_MS * 2)).toBe('⠹');
  });

  it('间隔内不跳帧（同一帧持续整个区间）', () => {
    expect(brailleFrameAt(BRAILLE_INTERVAL_MS - 1)).toBe('⠋');
    expect(brailleFrameAt(BRAILLE_INTERVAL_MS * 3 - 1)).toBe(brailleFrameAt(BRAILLE_INTERVAL_MS * 2));
  });

  it('走完所有帧后回到第一帧（循环）', () => {
    expect(brailleFrameAt(BRAILLE_INTERVAL_MS * BRAILLE_FRAMES.length)).toBe('⠋');
  });

  it('输出恒为合法帧字符', () => {
    for (let i = 0; i < 200; i++) {
      expect(BRAILLE_FRAMES).toContain(brailleFrameAt(i * BRAILLE_INTERVAL_MS));
    }
  });

  // 变异哨兵：帧表必须非空且覆盖多帧，否则动画退化为静止
  it('帧表至少 8 帧且互不相同', () => {
    expect(BRAILLE_FRAMES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(BRAILLE_FRAMES).size).toBe(BRAILLE_FRAMES.length);
  });
});
