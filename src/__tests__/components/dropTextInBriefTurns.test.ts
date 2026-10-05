import { describe, it, expect } from 'vitest';
import { dropTextInBriefTurns } from '../../components/Messages';

// 构造 assistant 消息：单 block
function asst(type: string, opts: { text?: string; name?: string } = {}) {
  return {
    type: 'assistant',
    uuid: 'a-' + Math.random().toString(36).slice(2),
    message: { content: [type === 'text' ? { type: 'text', text: opts.text ?? '' } : { type: 'tool_use', name: opts.name }] },
  } as any;
}

describe('dropTextInBriefTurns', () => {
  it('没有 Brief 调用时原样返回（正文保留）', () => {
    const msgs = [
      { type: 'user', message: { content: [{ type: 'text', text: 'hi' }] }, isMeta: false } as any,
      asst('thinking'),
      asst('text', { text: '你好！有什么我可以帮你的吗？' }),
    ];
    const out = dropTextInBriefTurns(msgs, ['SendUserMessage']);
    expect(out).toHaveLength(3); // 一个都不能丢
    expect(JSON.stringify(out)).toContain('你好！有什么我可以帮你的吗？');
  });

  it('同一轮调用了 SendUserMessage 时，丢弃该轮正文（上游设计）', () => {
    const msgs = [
      { type: 'user', message: { content: [{ type: 'text', text: 'hi' }] }, isMeta: false } as any,
      asst('text', { text: '工作笔记正文' }),
      asst('tool_use', { name: 'SendUserMessage' }),
    ];
    const out = dropTextInBriefTurns(msgs, ['SendUserMessage']);
    // 该轮 text 被丢弃，tool_use 保留
    expect(JSON.stringify(out)).not.toContain('工作笔记正文');
    expect(out.some((m: any) => m.message?.content?.[0]?.type === 'tool_use')).toBe(true);
  });

  it('跨轮隔离：前轮调用 Brief，不影响后轮正文', () => {
    const msgs = [
      // 第 1 轮：有 Brief
      { type: 'user', message: { content: [{ type: 'text', text: 'q1' }] }, isMeta: false } as any,
      asst('text', { text: '第1轮正文' }),
      asst('tool_use', { name: 'SendUserMessage' }),
      // 第 2 轮：无 Brief
      { type: 'user', message: { content: [{ type: 'text', text: 'q2' }] }, isMeta: false } as any,
      asst('thinking'),
      asst('text', { text: '第2轮正文' }),
    ];
    const out = dropTextInBriefTurns(msgs, ['SendUserMessage']);
    expect(JSON.stringify(out)).not.toContain('第1轮正文');
    // 第 2 轮正文必须保留
    expect(JSON.stringify(out)).toContain('第2轮正文');
  });
});
