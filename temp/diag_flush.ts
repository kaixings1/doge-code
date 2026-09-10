import { createAnthropicStreamFromOpenAI } from '../src/services/api/openaiCompat.js';

function createSSEReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const stream = new ReadableStream({
    pull(controller) {
      if (chunks.length > 0) controller.enqueue(new TextEncoder().encode(chunks.shift()!));
      else controller.close();
    },
  });
  return stream.getReader();
}

// 用 JSON.stringify 精确编码 delta.content，避免换行/引号干扰 SSE 解析
const contentSeq = [
  '第一句没有标点没有换行',
  '这也是正文需要保留',
  '并且这里有关键换行\n第二行内容',
  '此处太长了没有标点也没有换行但是长时间积累',
];

const frames: string[] = [
  'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
];
for (const c of contentSeq) {
  frames.push(
    'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":' +
      JSON.stringify(c) + '},"finish_reason":null}]}\n\n',
  );
}
frames.push(
  'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":50}}\n\n',
);
frames.push('data: [DONE]\n\n');

const reader = createSSEReader(frames);
const gen = createAnthropicStreamFromOpenAI({ reader, model: 'm' });
const events: any[] = [];
try { for await (const ev of gen) events.push(ev); } catch (e) { console.log('异常:', (e as Error).message); }

const received = events
  .filter((e: any) => e.type === 'content_block_delta' && e.delta?.type === 'text_delta')
  .map((e: any) => e.delta.text)
  .join('');
const expected = contentSeq.join('');
console.log('发送端:', JSON.stringify(expected.replace(/\n/g, '\\n')));
console.log('收到  :', JSON.stringify(received.replace(/\n/g, '\\n')));
console.log('一致  :', expected === received);
console.log('delta 段数:', events.filter((e:any)=>e.type==='content_block_delta' && e.delta?.type==='text_delta').length);