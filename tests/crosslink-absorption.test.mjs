/**
 * 吸收自 CrossLink（HotRiceNoodles/CrossLink, Go/Apache-2.0）的三项能力测试：
 *   1. reasoning_content → Anthropic thinking 块（流式 + 非流式，默认开启，WORKBUDDY_TRANSLATE_THINKING=0 可关）
 *   2. 混合语言 token 估算（CJK 1.5 / ASCII 4 chars per token）
 *   3. 缓存 token 统计（cache_read/creation_input_tokens）
 *   4. 风险分类语义不变（classify 仍返回既有 kind，不重造）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnthropicStreamTranslator, eventsToMessage, estimateTokens } from '../src/workbuddy-anthropic-tools.mjs';
import { openaiToAnthropicCompletion } from '../src/workbuddy-anthropic-adapter.mjs';
import { classify } from '../src/workbuddy-risk.mjs';

const ORIG_ENV = process.env.WORKBUDDY_TRANSLATE_THINKING;
// 默认开启（仅显式 '0' 关闭）。setThinking('1'|'0'|null) 控制；null = 恢复测试前环境
function setThinking(value, fn) {
  const apply = (v) => { if (v == null) { if (ORIG_ENV == null) delete process.env.WORKBUDDY_TRANSLATE_THINKING; else process.env.WORKBUDDY_TRANSLATE_THINKING = ORIG_ENV; } else process.env.WORKBUDDY_TRANSLATE_THINKING = v; };
  apply(value);
  try { return fn(); } finally { apply(null); }
}

test('token 估算：CJK 1.5 + ASCII 4 chars/token 混合（对齐 CrossLink）', () => {
  assert.equal(estimateTokens('Hello world'), 2); // ASCII 11 → floor(11/4)=2
  assert.equal(estimateTokens('世界'), 2);          // CJK 2 → ceil(2/1.5)=2
  assert.equal(estimateTokens('Hello 世界'), 3);    // ASCII 6 + CJK 2 → 1 + 2 = 3
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens(undefined), 0);
});

test('流式：默认开启时 reasoning_content 转 thinking 块', () => {
  const t = new AnthropicStreamTranslator('claude-3-5-sonnet', 10);
  const events = [
    ...t.push({ choices: [{ delta: { reasoning_content: '让我想想' } }] }),
    ...t.push({ choices: [{ delta: { content: '答案' } }] }),
    ...t.push({ choices: [{ delta: { content: '', finish_reason: 'end_turn' } }] }),
    ...t.finish(),
  ];
  const startThinking = events.find(e => e.event === 'content_block_start' && e.data.content_block.type === 'thinking');
  assert.ok(startThinking, '应有 thinking 块 content_block_start');
  assert.equal(startThinking.data.content_block.signature, '', 'thinking 块应含占位 signature 维持结构合法');
  const thinkingDeltas = events.filter(e => e.event === 'content_block_delta' && e.data.delta.type === 'thinking_delta');
  assert.equal(thinkingDeltas.length, 1);
  assert.equal(thinkingDeltas[0].data.delta.thinking, '让我想想');
  const msg = eventsToMessage(events);
  assert.equal(msg.content[0].type, 'thinking');
  assert.equal(msg.content[0].thinking, '让我想想');
  assert.equal(msg.content[1].type, 'text');
});

test('流式：显式 WORKBUDDY_TRANSLATE_THINKING=0 时 reasoning_content 被忽略', () => {
  setThinking('0', () => {
    const t = new AnthropicStreamTranslator('claude-3-5-sonnet', 10);
    const events = [
      ...t.push({ choices: [{ delta: { reasoning_content: '隐藏推理' } }] }),
      ...t.push({ choices: [{ delta: { content: '答案' } }] }),
      ...t.finish(),
    ];
    assert.equal(events.filter(e => e.data?.content_block?.type === 'thinking').length, 0);
    const msg = eventsToMessage(events);
    assert.ok(!msg.content.some(b => b.type === 'thinking'));
  });
});

test('非流式：openaiToAnthropicCompletion 转 thinking + 缓存 token（默认开启）', () => {
  const resp = {
    choices: [{ message: { content: '最终答案', reasoning_content: '推理过程' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 2, cache_creation_tokens: 1 } },
  };
  const msg = openaiToAnthropicCompletion(resp, 'claude-3-5-sonnet');
  assert.equal(msg.content[0].type, 'thinking');
  assert.equal(msg.content[0].thinking, '推理过程');
  assert.equal(msg.content[0].signature, '');
  assert.equal(msg.content[1].type, 'text');
  assert.equal(msg.usage.cache_read_input_tokens, 2);
  assert.equal(msg.usage.cache_creation_input_tokens, 1);
});

test('流式缓存 token：usage 携带 cache_read/creation_input_tokens', () => {
  setThinking('0', () => {
    const t = new AnthropicStreamTranslator('claude-3-5-sonnet', 10);
    const events = [
      ...t.push({ usage: { prompt_tokens: 7, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 3 } }, choices: [{ delta: { content: 'hi' } }] }),
      ...t.finish(),
    ];
    const msg = eventsToMessage(events);
    assert.equal(msg.usage.cache_read_input_tokens, 3);
    assert.equal(msg.usage.input_tokens, 7);
  });
});

test('风险分类语义不变（对齐 CrossLink persistent/transient，不重造）', () => {
  const quota = classify(402, null, 'insufficient_quota');
  assert.equal(quota.kind, 'quota_exhausted');
  assert.equal(quota.scope, 'account');
  assert.ok(quota.delay >= 60000);
  const rl = classify(429, null, 'rate_limit');
  assert.equal(rl.kind, 'rate_limited');
  assert.ok(rl.delay >= 60000);
  const ua = classify(503, null, 'upstream unavailable');
  assert.equal(ua.kind, 'upstream_unavailable');
  assert.ok(ua.delay < 60000);
});

/**
 * 回归测试：修复前，非流式 Anthropic 路由（/v1/messages, stream:false）在
 * forwardChatCompletions 内部直接把聚合后的 OpenAI 响应写给客户端，导致返回的是
 * OpenAI chat.completion 格式而非 Anthropic message 格式，thinking 块透传也失效。
 *
 * 修复后，非流式分支应逐帧把上游 OpenAI chunk 喂给 AnthropicStreamTranslator，
 * 由调用方（server.mjs handleAnthropicRequest）折叠成 Anthropic message。
 * 这里复现该折叠逻辑，锁住「产出 type:message 且含 thinking + text 块」的契约。
 */
test('非流式 Anthropic 路由：逐帧折叠产出 Anthropic message（含 thinking 块）', () => {
  const t = new AnthropicStreamTranslator('hy4-preview', 71);
  // 模拟上游 SSE 逐帧（OpenAI 格式）：先 reasoning_content，再 content，最后 usage + finish
  const sseChunks = [
    { id: 'wb-1', model: 'hy4-preview', choices: [{ delta: { reasoning_content: '用户在问杭州。' }, index: 0 }] },
    { choices: [{ delta: { reasoning_content: '我组织一句简介。' }, index: 0 }] },
    { choices: [{ delta: { content: '杭州是浙江省省会，' }, index: 0 }] },
    { choices: [{ delta: { content: '以西湖闻名的创新之城。' }, index: 0 }] },
    { usage: { prompt_tokens: 71, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 5 } }, choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] },
  ];
  const events = [];
  for (const chunk of sseChunks) {
    for (const ev of t.push(chunk)) events.push(ev);
  }
  const msg = eventsToMessage([...events, ...t.finish()]);

  // 必须是 Anthropic message 结构，而非 OpenAI chat.completion
  assert.equal(msg.type, 'message', '应返回 Anthropic message 格式');
  assert.equal(msg.role, 'assistant');
  assert.equal(msg.model, 'hy4-preview');
  assert.equal(msg.stop_reason, 'end_turn');

  // 块顺序：thinking 在前，text 在后
  assert.equal(msg.content[0].type, 'thinking', '首块应为 thinking');
  assert.equal(msg.content[0].signature, '', 'thinking 块应补空 signature 维持结构合法');
  assert.equal(msg.content[0].thinking, '用户在问杭州。我组织一句简介。');
  assert.equal(msg.content[1].type, 'text', '次块应为 text');
  assert.equal(msg.content[1].text, '杭州是浙江省省会，以西湖闻名的创新之城。');

  // 缓存 token 统计透传
  assert.equal(msg.usage.input_tokens, 71);
  assert.equal(msg.usage.output_tokens, 200);
  assert.equal(msg.usage.cache_read_input_tokens, 5);
});
