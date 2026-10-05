import { describe, it, expect } from 'vitest';
import { collapseHookSummaries } from '../../utils/collapseHookSummaries.js';

// 构造一个带 hookLabel 的摘要（只有 hookLabel !== undefined 的摘要才会被合并）
function summary(hookLabel: string, outputs: Array<{ hookName: string; output: string }>) {
  return {
    type: 'system' as const,
    subtype: 'stop_hook_summary' as const,
    hookLabel,
    hookCount: 1,
    hookInfos: [],
    hookErrors: [],
    hookOutputs: outputs,
    preventedContinuation: false,
    hasOutput: outputs.length > 0,
    totalDurationMs: 10,
    timestamp: new Date().toISOString(),
    uuid: 'u-' + Math.random().toString(36).slice(2),
  } as any;
}

describe('collapseHookSummaries', () => {
  it('不同 hookLabel 的摘要不合并', () => {
    const a = summary('A', []);
    const b = summary('B', []);
    const out = collapseHookSummaries([a, b]);
    expect(out).toHaveLength(2);
  });

  it('相同 hookLabel 的摘要合并，hookOutputs 跨组按内容去重', () => {
    const same = { hookName: 'self-improve', output: '提醒内容' };
    const a = summary('PostToolUse', [same]);
    const b = summary('PostToolUse', [same]); // 相同内容
    const c = summary('PostToolUse', [{ hookName: 'other', output: '另一条' }]);
    const out = collapseHookSummaries([a, b, c]);
    expect(out).toHaveLength(1);
    const merged = out[0] as any;
    // 相同 output 只保留一条；不同的保留
    expect(merged.hookOutputs).toHaveLength(2);
    expect(merged.hookOutputs.map((o: any) => o.output).sort()).toEqual(['另一条', '提醒内容']);
    expect(merged.hookCount).toBe(3);
  });

  it('非摘要消息原样保留', () => {
    const plain = { type: 'user', uuid: 'x' } as any;
    const out = collapseHookSummaries([plain]);
    expect(out).toEqual([plain]);
  });
});
