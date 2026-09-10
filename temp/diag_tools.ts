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

// 场景A：纯正文（多句多行）—— 验证丢换行
// 场景B：正文 + tool_calls（正规工具调用）—— 验证 index 连续
// 场景C：正文 + XML pending 未闭合直到 finish —— 触发 wrapPendingToolXml
const S = {
  A: [
    { role: 'assistant', content: '' },
    { content: '第一句话有句号。\n' },
    { content: '第二句没有句号但是有换行\n' },
    { content: '第三句最后' },
  ],
  B: [
    { role: 'assistant', content: '' },
    { content: '准备调用工具。\n' },
    { content: '' },
  ],
  C: [
    { role: 'assistant', content: '' },
    { content: '开始调用<function=Bash>\n' },
    { content: '<parameter=command>echo hi' },
    { content: '流结束了还要有正文\n' },
    { content: '更多正文第二段' },
  ],
};

function buildFrames(contentSeq: any[], withToolCalls = false, finishReason = 'stop') {
  const frames: string[] = [
    'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
  ];
  for (const c of contentSeq) frames.push(
    'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":' +
      JSON.stringify(c) + ',"finish_reason":null}]}\n\n',
  );
  if (withToolCalls) {
    frames.push(
      'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"Bash","arguments":"{\\"command\\":\\"echo hi\\"}"}}]},"finish_reason":null}]}\n\n',
    );
    frames.push(
      'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":5,"completion_tokens":10}}\n\n',
    );
  } else {
    frames.push(
      'data: {"id":"t","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":""},"finish_reason":"' +
        finishReason + '"}],"usage":{"prompt_tokens":5,"completion_tokens":10}}\n\n',
    );
  }
  frames.push('data: [DONE]\n\n');
  return frames;
}

async function run(name: string, frames: string[]) {
  const reader = createSSEReader(frames);
  const gen = createAnthropicStreamFromOpenAI({ reader, model: 'm' });
  const events: any[] = [];
  let err: any = null;
  try {
    for await (const ev of gen) events.push(ev);
  } catch (e) { err = (e as Error).message; }
  console.log(`\n===== 场景 ${name} =====`);
  if (err) console.log('!!! 抛异常:', err);
  const text = events
    .filter((e: any) => e.type === 'content_block_delta' && e.delta?.type === 'text_delta')
    .map((e: any) => e.delta.text).join('|');
  console.log('文本delta序列:', JSON.stringify(text.replace(/\n/g, '\\n')));
  console.log('index序列      :', events
    .filter((e: any) => e.type === 'content_block_start' || e.type === 'content_block_stop')
    .map((e: any) => `${e.type === 'content_block_start' ? 'S' : 'E'}[${e.index}:${e.content_block?.type ?? ''}]`).join(' '));
}

run('A-纯正文(验证丢换行)', buildFrames(S.A));
run('B-正文+tool_calls', buildFrames(S.B, true));
run('C-正文+XML pending残留', buildFrames(S.C, false));