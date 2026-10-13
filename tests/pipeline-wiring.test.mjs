/**
 * 管线接线测试 —— 验证 pipeline 真的接进了 upstream-client，且行为等价。
 *
 * 与 pipeline.test.mjs 的分工：
 *   pipeline.test.mjs   测管线本身（纯逻辑，不碰网络）
 *   本文件              测接线（管线 × upstream-client，用 mock fetch）
 *
 * 核心断言是**等价性**：注入管线后，转发出去的请求体必须与
 * 不注入管线（走原写死两步）时完全一致。这是"重构不改行为"的硬证据。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkBuddyUpstreamClient } from '../src/workbuddy-upstream-client.mjs';
import { createPipeline, createBuiltinStages } from '../src/workbuddy-pipeline.mjs';

const auth = {
  baseUrl: 'https://unit-test.invalid',
  getCurrentSession: async () => ({ auth: { accessToken: 'TEST-ONLY' }, account: { uid: 'test' } }),
  buildAuthHeaders: () => ({ Authorization: 'Bearer TEST-ONLY' }),
};

const frame = obj => `data: ${JSON.stringify(obj)}\n\n`;
const good = frame({
  id: 'test-completion', model: 'auto',
  choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }],
}) + 'data: [DONE]\n\n';

function resMock() {
  return {
    status: 0, headersSent: false, writableEnded: false, chunks: [],
    writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
    write(chunk) { this.chunks.push(String(chunk)); return true; },
    end(chunk = '') { this.chunks.push(String(chunk)); this.writableEnded = true; },
    get text() { return this.chunks.join(''); },
  };
}

/** 跑一次转发，返回实际发往上游的请求体（已 JSON.parse） */
async function capturedBody({ body, options = {} }) {
  const calls = [];
  const client = createWorkBuddyUpstreamClient({
    auth,
    fetchImpl: async (_url, init) => { calls.push(init); return new Response(good, { headers: { 'Content-Type': 'text/event-stream' } }); },
    transientRetryDelaysMs: [0, 0],
    log: () => {},
    ...options,
  });
  await client.forwardChatCompletions({
    req: {}, res: resMock(), body,
    controller: new AbortController(),
    requestMeta: { requestId: 'req-1', attempts: 0, retryCount: 0, model: body.model || 'auto' },
  });
  return { sent: JSON.parse(calls[0].body), client, callCount: calls.length };
}

// ─── 等价性：注入管线 vs 不注入 ────────────────────────────

/** 覆盖正常/边界/需加工的输入 */
const BODIES = [
  { name: '首条已是 system', body: { model: 'auto', messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }] } },
  { name: '首条是 user（需补 system）', body: { model: 'auto', messages: [{ role: 'user', content: 'u' }] } },
  { name: '含 x-anthropic 元数据行', body: { model: 'auto', messages: [{ role: 'system', content: 'x-anthropic-billing-header: cc_version=1\nyou are helpful' }] } },
  { name: '多条消息混合', body: { model: 'auto', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }] } },
  { name: 'messages 为空（异常输入）', body: { model: 'auto', messages: [] } },
];

for (const c of BODIES) {
  test(`等价性：${c.name} —— 注入管线与不注入的转发体一致`, async () => {
    const withoutPipeline = await capturedBody({ body: structuredClone(c.body) });
    const withPipeline = await capturedBody({
      body: structuredClone(c.body),
      options: { pipeline: createPipeline({ stages: createBuiltinStages({}) }) },
    });
    assert.deepEqual(
      withPipeline.sent.messages,
      withoutPipeline.sent.messages,
      '注入管线后发往上游的 messages 必须与原来一致（重构不得改行为）',
    );
    assert.equal(withPipeline.sent.model, withoutPipeline.sent.model);
    assert.equal(withPipeline.sent.stream, true, '上游恒为流式');
  });
}

test('等价性：stream 字段恒被改写为 true（管线不影响该行为）', async () => {
  const a = await capturedBody({ body: { model: 'auto', stream: false, messages: [{ role: 'user', content: 'u' }] } });
  const b = await capturedBody({
    body: { model: 'auto', stream: false, messages: [{ role: 'user', content: 'u' }] },
    options: { pipeline: createPipeline({ stages: createBuiltinStages({}) }) },
  });
  assert.equal(a.sent.stream, true);
  assert.equal(b.sent.stream, true);
});

test('等价性：其它字段（temperature/tools）不被管线改动', async () => {
  const body = {
    model: 'auto', temperature: 0.7, max_tokens: 512,
    tools: [{ type: 'function', function: { name: 'f', parameters: {} } }],
    messages: [{ role: 'user', content: 'u' }],
  };
  const a = await capturedBody({ body: structuredClone(body) });
  const b = await capturedBody({
    body: structuredClone(body),
    options: { pipeline: createPipeline({ stages: createBuiltinStages({}) }) },
  });
  assert.equal(b.sent.temperature, 0.7);
  assert.equal(b.sent.max_tokens, 512);
  assert.deepEqual(b.sent.tools, a.sent.tools);
});

// ─── 管线真的被执行了 ─────────────────────────────────────

test('注入管线后 lastPipelineTrace 有内容', async () => {
  const { client } = await capturedBody({
    body: { model: 'auto', messages: [{ role: 'user', content: 'u' }] },
    options: { pipeline: createPipeline({ stages: createBuiltinStages({}) }) },
  });
  const trace = client.lastPipelineTrace();
  assert.ok(Array.isArray(trace), 'trace 应为数组');
  assert.ok(trace.length > 0, '管线应至少执行了一个 stage');
  assert.ok(trace.some(s => s.name === 'ensure-system'), 'trace 应含 ensure-system');
});

test('未注入管线时 lastPipelineTrace 为 null（走兜底路径）', async () => {
  const { client } = await capturedBody({ body: { model: 'auto', messages: [{ role: 'user', content: 'u' }] } });
  assert.equal(client.lastPipelineTrace(), null);
});

test('禁用全部 stage 时 trace 无改动，但请求仍发出', async () => {
  const pipeline = createPipeline({
    stages: createBuiltinStages({}),
    disabled: ['ensure-system', 'strip-meta'],
  });
  const { sent, client, callCount } = await capturedBody({
    body: { model: 'auto', messages: [{ role: 'user', content: 'u' }] },
    options: { pipeline },
  });
  assert.equal(callCount, 1, '即使全禁用也要正常转发');
  // 全禁用后首条仍是 user —— 证明 ensure-system 确实没跑
  assert.equal(sent.messages[0].role, 'user');
  assert.equal(client.lastPipelineTrace().some(s => s.changed), false);
});

test('只禁用 strip-meta 时其负责的元数据行被保留（证明禁用真的生效）', async () => {
  // 用 x-anthropic-custom-foo: 而非 billing-header —— 后者会被
  // sanitize-identity 兜底删除，测不出 strip-meta 的开关状态。
  // 这个用例专门验证「非 billing 的 anthropic 头只归 strip-meta 管」。
  const body = () => ({
    model: 'auto',
    messages: [{ role: 'system', content: 'x-anthropic-custom-foo: v=1\nkeep' }],
  });

  const enabled = await capturedBody({
    body: body(),
    options: { pipeline: createPipeline({ stages: createBuiltinStages({}) }) },
  });
  const disabled = await capturedBody({
    body: body(),
    options: { pipeline: createPipeline({ stages: createBuiltinStages({}), disabled: ['strip-meta'] }) },
  });

  assert.equal(/x-anthropic-/.test(enabled.sent.messages[0].content), false, '启用时应剥离');
  assert.equal(/x-anthropic-/.test(disabled.sent.messages[0].content), true, '禁用时应保留');
  assert.notEqual(enabled.sent.messages[0].content, disabled.sent.messages[0].content, '两者必须可区分');
});

test('禁用 strip-meta 时 billing 头仍被 sanitize-identity 兜底剥离', async () => {
  // 这条固化「双重防护」设计：strip-meta 是可关闭的主防线，
  // 但即便它被关掉，最常见的 billing 头形态仍由 sanitize-identity 兜住。
  const { sent, client } = await capturedBody({
    body: { model: 'auto', messages: [{ role: 'system', content: 'x-anthropic-billing-header: cc_version=1\nkeep' }] },
    options: { pipeline: createPipeline({ stages: createBuiltinStages({}), disabled: ['strip-meta'] }) },
  });
  assert.equal(/x-anthropic-billing-header:/.test(sent.messages[0].content), false, '兜底应剥离 billing 头');
  assert.match(sent.messages[0].content, /keep/, '其余文本必须保留');
  assert.ok(
    client.lastPipelineTrace().some(s => s.name === 'sanitize-identity' && s.changed),
    'trace 应显示是 sanitize-identity 做的',
  );
});

test('两个 stage 全禁用时 billing 头才会原样透传', async () => {
  const { sent } = await capturedBody({
    body: { model: 'auto', messages: [{ role: 'system', content: 'x-anthropic-billing-header: cc_version=1\nkeep' }] },
    options: {
      pipeline: createPipeline({
        stages: createBuiltinStages({}),
        disabled: ['strip-meta', 'sanitize-identity'],
      }),
    },
  });
  assert.match(sent.messages[0].content, /x-anthropic-billing-header:/, '两道防线都关时才透传');
});

test('含图片的请求被管线短路，图片数据不被破坏', async () => {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
  const body = {
    model: 'auto',
    messages: [{
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } }],
    }],
  };
  const { sent, client } = await capturedBody({
    body,
    options: { pipeline: createPipeline({ stages: createBuiltinStages({}) }) },
  });
  assert.equal(
    sent.messages[0].content[0].image_url.url,
    `data:image/png;base64,${base64}`,
    'base64 必须逐字节不变 —— 插入零宽空格会损坏图片',
  );
  const trace = client.lastPipelineTrace();
  assert.equal(trace.length, 1);
  assert.equal(trace[0].name, '__binary__');
});

test('管线 stage 抛错时请求仍能发出（错误隔离到端到端）', async () => {
  const pipeline = createPipeline({
    log: () => {},
    stages: [
      { name: 'boom', apply: () => { throw new Error('故意炸'); } },
      ...createBuiltinStages({}),
    ],
  });
  const { sent, client, callCount } = await capturedBody({
    body: { model: 'auto', messages: [{ role: 'user', content: 'u' }] },
    options: { pipeline },
  });
  assert.equal(callCount, 1, '一个 stage 崩了不应让整个请求失败');
  assert.equal(sent.messages[0].role, 'system', 'boom 之后的 ensure-system 应照常生效');
  assert.ok(client.lastPipelineTrace().some(s => s.error), 'trace 应记录该错误');
});

// ─── 非聊天端点也走管线 ───────────────────────────────────

test('completions 端点也经过管线（无 messages 时空转，但链路已接）', async () => {
  const calls = [];
  const client = createWorkBuddyUpstreamClient({
    auth,
    fetchImpl: async (_url, init) => { calls.push(init); return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } }); },
    transientRetryDelaysMs: [0, 0],
    log: () => {},
    pipeline: createPipeline({ stages: createBuiltinStages({}) }),
  });
  await client.forwardCompletions({
    req: {}, res: resMock(),
    body: { model: 'auto', prompt: '补全这段代码', stream: false },
    controller: new AbortController(),
    requestMeta: { requestId: 'req-c', attempts: 0, retryCount: 0, model: 'auto' },
  });
  assert.equal(calls.length, 1, '请求必须发出');
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.prompt, '补全这段代码', 'prompt 必须原样透传（当前 stage 不处理它）');
  assert.ok(client.lastPipelineTrace(), 'completions 路径也应产生 trace');
});

test('embeddings 端点经过管线且 body 不被改动', async () => {
  const calls = [];
  const client = createWorkBuddyUpstreamClient({
    auth,
    fetchImpl: async (_url, init) => { calls.push(init); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); },
    transientRetryDelaysMs: [0, 0],
    log: () => {},
    pipeline: createPipeline({ stages: createBuiltinStages({}) }),
  });
  await client.forwardEmbeddings({
    req: {}, res: resMock(),
    body: { model: 'auto', input: '要转向量' },
    controller: new AbortController(),
    requestMeta: { requestId: 'req-e', attempts: 0, retryCount: 0, model: 'auto' },
  });
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.input, '要转向量');
  assert.ok(client.lastPipelineTrace(), 'embeddings 路径也应产生 trace');
});

test('images 端点含二进制字段时管线短路，不破坏数据', async () => {
  const calls = [];
  const client = createWorkBuddyUpstreamClient({
    auth,
    fetchImpl: async (_url, init) => { calls.push(init); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); },
    transientRetryDelaysMs: [0, 0],
    log: () => {},
    pipeline: createPipeline({ stages: createBuiltinStages({}) }),
  });
  const prompt = '画一只猫';
  await client.forwardImageGenerations({
    req: {}, res: resMock(),
    body: { model: 'auto', prompt, image: 'data:image/png;base64,iVBORw0KGgo=' },
    controller: new AbortController(),
    requestMeta: { requestId: 'req-i', attempts: 0, retryCount: 0, model: 'auto' },
  });
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.prompt, prompt, 'prompt 必须逐字不变');
  assert.equal(sent.image, 'data:image/png;base64,iVBORw0KGgo=', 'base64 必须逐字不变');
});

test('无 pipeline 时非聊天端点照常工作（兜底路径）', async () => {
  const calls = [];
  const client = createWorkBuddyUpstreamClient({
    auth,
    fetchImpl: async (_url, init) => { calls.push(init); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); },
    transientRetryDelaysMs: [0, 0],
    log: () => {},
  });
  await client.forwardCompletions({
    req: {}, res: resMock(),
    body: { model: 'auto', prompt: 'x' },
    controller: new AbortController(),
    requestMeta: { requestId: 'req-n', attempts: 0, retryCount: 0, model: 'auto' },
  });
  assert.equal(calls.length, 1);
  assert.equal(client.lastPipelineTrace(), null);
});

// ─── model 传参 ───────────────────────────────────────────

test('管线 ctx 收到正确的 model 与 requestId', async () => {
  let seen = null;
  const pipeline = createPipeline({
    stages: [{
      name: 'probe',
      when: (_body, ctx) => { seen = ctx; return false; },
      apply: () => null,
    }],
  });
  await capturedBody({
    body: { model: 'hy3', messages: [{ role: 'user', content: 'u' }] },
    options: { pipeline },
  });
  assert.equal(seen.model, 'hy3');
  assert.equal(seen.phase, 'request');
  assert.equal(seen.requestId, 'req-1');
});

test('model 为空时 ctx.model 为空串（不抛错）', async () => {
  let seen = null;
  const pipeline = createPipeline({
    stages: [{ name: 'probe', when: (_b, ctx) => { seen = ctx; return false; }, apply: () => null }],
  });
  await capturedBody({
    body: { messages: [{ role: 'user', content: 'u' }] },
    options: { pipeline },
  });
  assert.equal(seen.model, '');
});
