import { describe, it, expect, vi } from 'vitest';
import { createAnthropicStreamFromOpenAI } from '../../services/api/openaiCompat.js';

/**
 * 覆盖 openaiCompat.ts 的「冒号等待期 + [DONE]」分支（:749-762）。
 *
 * 上游文本以 ':'/'：' 结尾 → 启动 20 秒等待期；期间收到 [DONE] 则等满
 * 确认期。等待期结束时按「是否已产出过内容」分流：
 *
 *   - 已产出内容（nextContentIndex > 0）→ 按正常结束处理，不重试。
 *     依据：此时用户已看到部分内容，抛错重试会让模型重新生成，
 *     表现为「同一段内容执行两遍」。
 *   - 从未产出（nextContentIndex === 0）→ 抛 APIConnectionError 触发重试。
 *
 * 注意：冒号文本会被 flushBufferedText 按冒号切分并送出（':' 命中
 * sentenceEndRegex，见 :646），因此「冒号结尾 + [DONE]」的真实场景下
 * nextContentIndex 通常已 > 0，走「不重试」分支。
 */
describe('createAnthropicStreamFromOpenAI — colon grace + [DONE]', () => {
  function createSSEReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
    const stream = new ReadableStream({
      pull(controller) {
        if (chunks.length > 0) {
          controller.enqueue(new TextEncoder().encode(chunks.shift()!));
        } else {
          controller.close();
        }
      },
    });
    return stream.getReader();
  }

  function colonChunk(text: string): string {
    return `data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":${JSON.stringify(text)}},"finish_reason":null}]}\n\n`;
  }

  it('冒号结尾 + [DONE]（已有内容产出）→ 不抛错，已渲染内容被保留', async () => {
    vi.useFakeTimers();
    try {
      const chunks = [
        colonChunk('结果如下：'),
        'data: [DONE]\n\n',
      ];
      const gen = createAnthropicStreamFromOpenAI({ reader: createSSEReader(chunks), model: 'm' });

      const events: any[] = [];
      const consume = (async () => {
        for await (const ev of gen) events.push(ev);
      })();

      await vi.advanceTimersByTimeAsync(25000);
      await consume; // 不应抛出：已有产出 → 不重试

      const textDeltas = events
        .filter(e => e.type === 'content_block_delta' && e.delta?.type === 'text_delta')
        .map(e => e.delta.text)
        .join('');
      // 已渲染的文本必须保留（重试会把它重复渲染成两份）
      expect(textDeltas).toContain('结果如下：');
      expect(events.map(e => e.type)).toContain('message_stop');
    } finally {
      vi.useRealTimers();
    }
  });

  it('冒号结尾后紧接更多文本（非 [DONE]）→ 不抛错，文本完整产出', async () => {
    vi.useFakeTimers();
    try {
      const chunks = [
        colonChunk('结果是：'),
        colonChunk('42'),
        'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
        'data: [DONE]\n\n',
      ];
      const gen = createAnthropicStreamFromOpenAI({ reader: createSSEReader(chunks), model: 'm' });

      const events: any[] = [];
      const consume = (async () => {
        for await (const ev of gen) events.push(ev);
      })();

      await vi.advanceTimersByTimeAsync(25000);
      await consume;

      const textDeltas = events
        .filter(e => e.type === 'content_block_delta' && e.delta?.type === 'text_delta')
        .map(e => e.delta.text)
        .join('');

      expect(textDeltas).toContain('结果是：');
      expect(textDeltas).toContain('42');
      expect(events.map(e => e.type)).toContain('message_stop');
    } finally {
      vi.useRealTimers();
    }
  });
});
