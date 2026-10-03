import { describe, it, expect, vi } from 'vitest';
import { createAnthropicStreamFromOpenAI } from '../../services/api/openaiCompat.js';

/**
 * 覆盖 openaiCompat.ts 的「冒号等待期 + [DONE]」分支（:749-762）。
 *
 * 该分支此前零测试覆盖。本文件锁定【当前真实行为】，作为行为文档：
 *
 *   上游文本以 ':'/'：' 结尾 → 启动 20 秒等待期。
 *   若等待期内收到 [DONE]（即无新数据到达）→ 抛 APIConnectionError，
 *   由外层 withRetry 触发整轮重试。
 *
 * ⚠️ 已知观察（非断言，供后续决策）：
 *   冒号文本会被 flushBufferedText 按冒号切分并送出（':' 命中
 *   sentenceEndRegex，见 :646），因此真实 premature 场景下用户其实
 *   已看到部分内容，重试后该内容可能被重新渲染。是否要改为「已有产出
 *   则不重试」尚未定论，本次仅记录行为，不改实现。
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

  it('冒号结尾 + [DONE] → 抛 APIConnectionError（当前行为：触发重试）', async () => {
    vi.useFakeTimers();
    try {
      const chunks = [
        colonChunk('结果如下：'),
        'data: [DONE]\n\n',
      ];
      const gen = createAnthropicStreamFromOpenAI({ reader: createSSEReader(chunks), model: 'm' });

      const collected: any[] = [];
      const consume = (async () => {
        try {
          for await (const ev of gen) collected.push(ev);
          return 'completed';
        } catch (e) {
          return e;
        }
      })();

      // 推进时钟越过 20 秒等待期
      await vi.advanceTimersByTimeAsync(25000);
      const outcome = await consume;

      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).constructor.name).toBe('APIConnectionError');
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
      await consume; // 不应抛出

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
