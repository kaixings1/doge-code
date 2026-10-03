import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import {
  createOpenAICompatStream,
  createAnthropicStreamFromOpenAI,
} from '../../services/api/openaiCompat.js';

/**
 * 端到端实测：真实 HTTP 上游 + 真实 fetch，验证「冒号结尾 + [DONE]」
 * 场景下内容不被重复输出。
 *
 * 历史：曾因「冒号等待期」机制在 [DONE] 时抛 APIConnectionError 触发重试，
 * 导致同一段内容出现两份。该机制已移除，[DONE] 一律正常收尾。
 * 本测试保护「单轮只请求一次上游、内容只出现一份」这一行为。
 */
describe('E2E: 冒号 + premature [DONE] 不重复输出', () => {
  let server: Server;
  let baseURL: string;
  let requestCount = 0;

  // 上游行为：返回一段以冒号结尾的文本，随后立即发 [DONE]
  function sseChunk(content: string): string {
    return `data: {"id":"e2e","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":${JSON.stringify(content)}},"finish_reason":null}]}\n\n`;
  }

  beforeAll(async () => {
    server = createServer((req, res) => {
      requestCount++;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // 每个请求都返回相同内容；若发生重试，requestCount 会 > 1
      res.write(sseChunk('结果如下：'));
      res.write('data: [DONE]\n\n');
      res.end();
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseURL = `http://127.0.0.1:${port}/v1/chat/completions`;
  });

  afterAll(async () => {
    await new Promise<void>(r => server.close(() => r()));
  });

  it('上游请求只发生一次，输出内容只出现一份', async () => {
    const reader = await createOpenAICompatStream(
      { apiKey: 'test', baseURL, fetch: globalThis.fetch },
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      new AbortController().signal,
    );

    const gen = createAnthropicStreamFromOpenAI({ reader, model: 'm' });

    const events: any[] = [];
    for await (const ev of gen) events.push(ev);

    const textOut = events
      .filter(e => e.type === 'content_block_delta' && e.delta?.type === 'text_delta')
      .map(e => e.delta.text)
      .join('');

    // 只调用一次上游（重复渲染的旧缺陷会让 count 变 2）
    expect(requestCount).toBe(1);
    // 内容只出现一份
    expect(textOut).toBe('结果如下：');
    // 出现次数统计：'结果如下：' 在输出中只应出现一次
    expect(textOut.split('结果如下：').length - 1).toBe(1);
  });
});
