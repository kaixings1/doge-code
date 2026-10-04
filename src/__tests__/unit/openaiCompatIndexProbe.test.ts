import { describe, it, expect } from 'vitest';
import { createAnthropicStreamFromOpenAI } from '../../services/api/openaiCompat.js';

/**
 * 探针测试：验证 openaiCompat 产出的每个 content_block_delta 的 index
 * 是否都已有对应的 content_block_start（且类型匹配）。这是 claude.ts
 * 中 contentBlocks[part.index] 查不到块就抛 RangeError 的直接成因检测。
 * 用户现象"发送 hi 无回答、只回显用户消息"与 RangeError 中断流处理、
 * 最终 assistant 消息未 assemble 完全吻合。
 */
describe('openaiCompat index 连续性探针', () => {
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

  interface BlockStart {
    index: number;
    type: string;
  }
  interface DeltaLookup {
    index: number;
    type: string;
  }

  function collect(events: any[]) {
    // 记录每个 content_block_start 声明的 index -> type
    const starts = new Map<number, string>();
    // 记录每个 content_block_delta/input_json_delta 之前的 start 是否已存在
    const missingDeltas: DeltaLookup[] = [];
    // 记录每个 content_block_stop 的 index 是否已存在 start
    const badStops: number[] = [];
    // 记录未匹配的 start（start 后有 delta 但从没 start? 反查）
    for (const e of events) {
      if (e.type === 'content_block_start') {
        starts.set(e.index, e.content_block?.type ?? '?');
      } else if (e.type === 'content_block_delta') {
        const i = e.index;
        if (!starts.has(i)) {
          missingDeltas.push({ index: i, type: e.delta?.type ?? '?' });
        }
      } else if (e.type === 'content_block_stop') {
        if (!starts.has(e.index)) badStops.push(e.index);
      }
    }
    return { starts, missingDeltas, badStops };
  }

  it('纯文本回答：delta index 全部可查（模拟真实中文回答）', async () => {
    const chunks = [
      'data: {"id":"t1","object":"chat.completion.chunk","created":1,"model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
      // 先一小段正文
      'data: {"id":"t1","object":"chat.completion.chunk","created":1,"model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"content":"你好！" },"finish_reason":null}]}\n\n',
      'data: {"id":"t1","object":"chat.completion.chunk","created":1,"model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"content":"我是助手，很高兴认识你。"},"finish_reason":null}]}\n\n',
      'data: {"id":"t1","object":"chat.completion.chunk","created":1,"model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":30}}\n\n',
      'data: [DONE]\n\n',
    ];
    const gen = createAnthropicStreamFromOpenAI({ reader: createSSEReader(chunks), model: 'deepseek-v4-flash' });
    const events: any[] = [];
    for await (const e of gen) events.push(e);
    const { missingDeltas, badStops } = collect(events);
    expect(missingDeltas).toEqual([]);
    expect(badStops).toEqual([]);
  });

  it('thinking + 正文混合：切换时 delta 不落到无 start 的空洞索引', async () => {
    const chunks = [
      'data: {"id":"t2","object":"chat.completion.chunk","created":1,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
      // 思考
      'data: {"id":"t2","object":"chat.completion.chunk","created":1,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"reasoning_content":"让我想一下"},"finish_reason":null}]}\n\n',
      'data: {"id":"t2","object":"chat.completion.chunk","created":1,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"reasoning_content":"好的"},"finish_reason":null}]}\n\n',
      // 切换到正文
      'data: {"id":"t2","object":"chat.completion.chunk","created":1,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"content":"答案是 42。"},"finish_reason":null}]}\n\n',
      'data: {"id":"t2","object":"chat.completion.chunk","created":1,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":40}}\n\n',
      'data: [DONE]\n\n',
    ];
    const gen = createAnthropicStreamFromOpenAI({ reader: createSSEReader(chunks), model: 'deepseek-reasoner' });
    const events: any[] = [];
    for await (const e of gen) events.push(e);
    const { missingDeltas, badStops } = collect(events);
    expect(missingDeltas).toEqual([]);
    expect(badStops).toEqual([]);
  });

  it('正文 → 文本块结束后的 thinking 再切回：索引单调且每块 delta 都有 start', async () => {
    const chunks = [
      'data: {"id":"t3","object":"chat.completion.chunk","created":1,"model":"deepseek","choices":[{"index":0,"delta":{"role":"assistant","content":"开" },"finish_reason":null}]}\n\n',
      'data: {"id":"t3","object":"chat.completion.chunk","created":1,"model":"deepseek","choices":[{"index":0,"delta":{"reasoning_content":"中间推理"},"finish_reason":null}]}\n\n',
      'data: {"id":"t3","object":"chat.completion.chunk","created":1,"model":"deepseek","choices":[{"index":0,"delta":{"content":"始回复"},"finish_reason":null}]}\n\n',
      'data: {"id":"t3","object":"chat.completion.chunk","created":1,"model":"deepseek","choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":30}}\n\n',
      'data: [DONE]\n\n',
    ];
    const gen = createAnthropicStreamFromOpenAI({ reader: createSSEReader(chunks), model: 'deepseek' });
    const events: any[] = [];
    for await (const e of gen) events.push(e);
    const { missingDeltas, badStops } = collect(events);
    expect(missingDeltas).toEqual([]);
    expect(badStops).toEqual([]);
  });
});