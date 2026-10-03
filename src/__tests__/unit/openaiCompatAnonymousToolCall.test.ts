import { describe, it, expect } from 'vitest';
import { createAnthropicStreamFromOpenAI } from '../../services/api/openaiCompat.js';

/**
 * 回归：上游把正文错编进「匿名 tool_calls」时，正文不得丢失。
 *
 * 真实现象（实测日志）：某上游对带 tools 的请求返回的每一帧都是
 *   delta.content = ""、tool_calls[0].function.name = ""，
 *   而用户可见的文字全在 tool_calls[0].function.arguments 里，
 *   直到 finish_reason="tool_calls"。
 * 旧逻辑据此发出一个 name 为空串的 tool_use 块，正文区无 text 块 → 界面只剩用户输入。
 *
 * 修复：延迟转正 —— 仅当某 index 出现过非空 name 才认定为工具调用；
 * 流结束时仍无 name 的，其 arguments 降级为正文文本。
 */

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

/** 匿名 tool_call 分片：name 为空，正文塞在 arguments */
function anonChunk(args: string): string {
  return `data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":"","tool_calls":[{"index":0,"function":{"name":"","arguments":${JSON.stringify(args)}}}]},"finish_reason":""}]}\n\n`;
}

/** 合法 tool_call 首片：带 name */
function namedChunk(name: string, args: string): string {
  return `data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":"","tool_calls":[{"index":0,"id":"call_1","function":{"name":${JSON.stringify(name)},"arguments":${JSON.stringify(args)}}}]},"finish_reason":""}]}\n\n`;
}

/** 续传分片：同一 index，无 name，只有 arguments 碎片 */
function contChunk(args: string): string {
  return `data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":${JSON.stringify(args)}}}]},"finish_reason":""}]}\n\n`;
}

function textOf(events: any[]): string {
  return events
    .filter(e => e.type === 'content_block_delta' && e.delta?.type === 'text_delta')
    .map(e => e.delta.text)
    .join('');
}

async function collect(chunks: string[]) {
  const gen = createAnthropicStreamFromOpenAI({ reader: createSSEReader(chunks), model: 'm' });
  const events: any[] = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

describe('createAnthropicStreamFromOpenAI — 匿名 tool_calls 降级为正文', () => {
  it('全程无 name 的 tool_calls：arguments 作为文本产出，不产生 tool_use 块', async () => {
    const events = await collect([
      anonChunk('查看'),
      anonChunk('日志'),
      anonChunk('尾部'),
      'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":""},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    // 正文必须完整出现
    expect(textOf(events)).toContain('查看日志尾部');
    // 不得出现任何 tool_use 内容块（旧逻辑会发一个 name="" 的块）
    const toolStarts = events.filter(
      e => e.type === 'content_block_start' && e.content_block?.type === 'tool_use',
    );
    expect(toolStarts.length).toBe(0);
    // 正常收尾
    expect(events.map(e => e.type)).toContain('message_stop');
  });

  it('合法 tool_call（首片带 name）：仍产出 tool_use 块，arguments 不被当正文', async () => {
    const events = await collect([
      namedChunk('Bash', '{"command":'),
      contChunk('"ls"}'),
      'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":""},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const toolStarts = events.filter(
      e => e.type === 'content_block_start' && e.content_block?.type === 'tool_use',
    );
    expect(toolStarts.length).toBe(1);
    expect(toolStarts[0].content_block.name).toBe('Bash');

    // arguments 拼接完整
    const json = events
      .filter(e => e.type === 'content_block_delta' && e.delta?.type === 'input_json_delta')
      .map(e => e.delta.partial_json)
      .join('');
    expect(json).toBe('{"command":"ls"}');

    // 正文文本不应混入工具参数
    expect(textOf(events)).not.toContain('ls');
  });

  it('name 迟到（先匿名分片、后带 name）：已累积分片作为前缀补发，不丢失', async () => {
    const events = await collect([
      contChunk('{"command":'),
      namedChunk('Bash', '"ls"}'),
      'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":""},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const toolStarts = events.filter(
      e => e.type === 'content_block_start' && e.content_block?.type === 'tool_use',
    );
    expect(toolStarts.length).toBe(1);
    expect(toolStarts[0].content_block.name).toBe('Bash');

    const json = events
      .filter(e => e.type === 'content_block_delta' && e.delta?.type === 'input_json_delta')
      .map(e => e.delta.partial_json)
      .join('');
    // 前缀 '{"command":' 不得丢失
    expect(json).toBe('{"command":"ls"}');
  });

  it('无 finish_reason、直接 [DONE]：匿名内容同样降级为文本', async () => {
    const events = await collect([
      anonChunk('hello '),
      anonChunk('world'),
      'data: [DONE]\n\n',
    ]);

    expect(textOf(events)).toContain('hello world');
    const toolStarts = events.filter(
      e => e.type === 'content_block_start' && e.content_block?.type === 'tool_use',
    );
    expect(toolStarts.length).toBe(0);
  });
});
