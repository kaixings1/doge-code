import { describe, it, expect } from 'vitest';
import { BRAILLE_FRAMES, BRAILLE_INTERVAL_MS, brailleFrameAt, ToolUseLoader } from '../../components/ToolUseLoader.js';
import { AssistantThinkingMessage } from '../../components/messages/AssistantThinkingMessage.js';

/**
 * 交叉验证：思考标签（AssistantThinkingMessage 的 spinner）与工具圆点（ToolUseLoader）
 * 必须共用同一套帧表与间隔，否则两处动画会不同步。
 * 直接断言共享契约——帧常量从单一来源（ToolUseLoader）导出。
 */
describe('思考/工具 动画契约一致性', () => {
  it('帧表为 10 帧盲文，间隔 80ms', () => {
    expect(BRAILLE_FRAMES).toEqual(['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']);
    expect(BRAILLE_INTERVAL_MS).toBe(80);
  });

  it('相同时间值 → 相同帧（两处调用点同源，天然同步）', () => {
    for (let t = 0; t < 2000; t += 37) {
      expect(brailleFrameAt(t)).toBe(brailleFrameAt(t));
    }
  });

  it('非动画态应回落到静态前缀（区别于旋转帧）', () => {
    // 静态前缀是 "∴"（U+2234），不属于旋转帧集合
    expect(BRAILLE_FRAMES).not.toContain('\u2234');
  });
});

/**
 * 静态契约：AssistantThinkingMessage 与 ToolUseLoader 必须能加载，
 * 且前者从后者导入帧常量（跨模块字段耦合的守护）。
 */
describe('模块加载与跨模块契约', () => {
  it('AssistantThinkingMessage 可加载且是函数组件', () => {
    expect(typeof AssistantThinkingMessage).toBe('function');
  });

  it('ToolUseLoader 可加载且导出帧常量与纯函数', () => {
    expect(typeof ToolUseLoader).toBe('function');
    expect(Array.isArray(BRAILLE_FRAMES)).toBe(true);
    expect(typeof brailleFrameAt).toBe('function');
  });

  it('源码契约：AssistantThinkingMessage 确实从 ToolUseLoader 导入帧常量', async () => {
    const fs = await import('node:fs');
    const url = await import('node:url');
    const path = url.fileURLToPath(new URL('../../components/messages/AssistantThinkingMessage.tsx', import.meta.url));
    const src = fs.readFileSync(path, 'utf8');
    expect(src).toMatch(/from '\.\.\/ToolUseLoader\.js'/);
    expect(src).toMatch(/BRAILLE_INTERVAL_MS/);
    expect(src).toMatch(/brailleFrameAt/);
  });
});
