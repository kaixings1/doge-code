import { describe, it, expect } from 'vitest';
import { createAnthropicStreamFromOpenAI } from '../../services/api/openaiCompat.js';

/**
 * 回归测试：文本以冒号结尾不应打断流。
 *
 * 历史：openaiCompat.ts 曾实现「冒号结尾 → 启动 20 秒等待期」机制，
 * 在收到 [DONE] 时 await sleep(最多 20 秒) 并可能抛 APIConnectionError。
 * 该机制有三处缺陷（见 commit 说明）：(1) 判据「单个 delta 末字符是冒号」
 * 与「上游是否 premature」无因果关系，中文里冒号极其常见；
 * (2) await sleep 阻塞了整个流读取循环，正常「冒号后停顿再续传」的上游
 * 会让界面卡住数秒；(3) 上一版新增的 nextContentIndex > 0 守卫恒真，
 * 使真正的 premature 不再重试。机制已整体移除，[DONE] 一律正常收尾。
 *
 * 本文件锁定移除后的行为：冒号出现与否，都不影响流的完整性与及时性。
 */
describe('createAnthropicStreamFromOpenAI — 冒号结尾不打断流', () => {
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

  function collectText(events: any[]): string {
    return events
      .filter(e => e.type === 'content_block_delta' && e.delta?.type === 'text_delta')
      .map(e => e.delta.text)
      .join('');
  }

  it('冒号结尾 + [DONE]：不抛错，已渲染内容保留、正常收尾', async () => {
    const chunks = [colonChunk('结果如下：'), 'data: [DONE]\n\n'];
    const gen = createAnthropicStreamFromOpenAI({ reader: createSSEReader(chunks), model: 'm' });

    const events: any[] = [];
    for await (const ev of gen) events.push(ev);

    expect(collectText(events)).toContain('结果如下：');
    expect(events.map(e => e.type)).toContain('message_stop');
  });

  it('冒号结尾后紧接更多文本：文本完整产出，不被冒号切断', async () => {
    const chunks = [
      colonChunk('结果是：'),
      colonChunk('42'),
      'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ];
    const gen = createAnthropicStreamFromOpenAI({ reader: createSSEReader(chunks), model: 'm' });

    const events: any[] = [];
    for await (const ev of gen) events.push(ev);

    const text = collectText(events);
    expect(text).toContain('结果是：');
    expect(text).toContain('42');
    expect(events.map(e => e.type)).toContain('message_stop');
  });

  it('冒号结尾 + [DONE]：不产生任何内容重复（单轮只出现一次）', async () => {
    const chunks = [colonChunk('结果如下：'), 'data: [DONE]\n\n'];
    const gen = createAnthropicStreamFromOpenAI({ reader: createSSEReader(chunks), model: 'm' });

    const events: any[] = [];
    for await (const ev of gen) events.push(ev);

    const text = collectText(events);
    // '结果如下：' 只应出现一次；重试/重复渲染会使其出现两次
    expect(text.split('结果如下：').length - 1).toBe(1);
  });
});
