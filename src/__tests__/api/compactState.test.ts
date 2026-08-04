import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markPostCompaction, onPostCompaction } from '../../commands/compact/src/bootstrap/state.js';

describe('markPostCompaction', () => {
  beforeEach(() => {
    // 确保每次测试前没有遗留回调（通过触发一次清空）
    markPostCompaction();
  });

  it('执行注册的回调并清空队列', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    onPostCompaction(cb1);
    onPostCompaction(cb2);
    markPostCompaction();
    expect((cb1 as any).mock.calls.length).toBe(1);
    expect((cb2 as any).mock.calls.length).toBe(1);

    // 队列已清空，再次调用不再触发
    markPostCompaction();
    expect((cb1 as any).mock.calls.length).toBe(1);
  });

  it('onPostCompaction 返回取消注册函数', () => {
    const cb = vi.fn();
    const off = onPostCompaction(cb);
    off();
    markPostCompaction();
    expect((cb as any).mock.calls.length).toBe(0);
  });

  it('回调抛错不中断其他回调', () => {
    const cb1 = vi.fn(() => {
      throw new Error('boom');
    });
    const cb2 = vi.fn();
    onPostCompaction(cb1);
    onPostCompaction(cb2);
    markPostCompaction();
    expect((cb2 as any).mock.calls.length).toBe(1);
  });

  it('无回调时安全调用', () => {
    expect(() => markPostCompaction()).not.toThrow();
  });
});
