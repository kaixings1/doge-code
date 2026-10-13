import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkBuddyUpstreamClient } from '../src/workbuddy-upstream-client.mjs';

const auth = {
  baseUrl: 'https://unit-test.invalid',
  getCurrentSession: async () => ({ auth: { accessToken: 'TEST-ONLY' }, account: { uid: 'test' } }),
  buildAuthHeaders: () => ({ Authorization: 'Bearer TEST-ONLY' }),
};
const delta = (content, finish = null, extra = {}) => ({
  id: 'test-completion', model: 'auto',
  choices: [{ index: 0, delta: { content }, finish_reason: finish }], ...extra,
});
const frame = obj => `data: ${JSON.stringify(obj)}\n\n`;
const good = frame(delta('你好', 'stop')) + 'data: [DONE]\n\n';
const response = text => new Response(text, { headers: { 'Content-Type': 'text/event-stream' } });
const unavailable = status => new Response(JSON.stringify({ error: { message: 'the model provider is temporarily unavailable, please retry later or switch to another model' } }), { status });
function resMock() {
  return {
    status: 0, headersSent: false, writableEnded: false, chunks: [],
    writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
    write(chunk) { this.chunks.push(String(chunk)); return true; },
    end(chunk = '') { this.chunks.push(String(chunk)); this.writableEnded = true; },
    get text() { return this.chunks.join(''); },
  };
}
function fixture(fetchImpl, options = {}) {
  const events = [], logs = [];
  const client = createWorkBuddyUpstreamClient({ auth, fetchImpl, transientRetryDelaysMs: [0, 0],
    log: (...args) => logs.push(args.join(' ')), logEvent: event => events.push(event), ...options });
  const requestMeta = { requestId: 'request-unit-1', attempts: 0, retryCount: 0, model: 'auto' };
  const run = (stream = false, more = {}) => client.forwardChatCompletions({
    req: {}, res: resMock(), body: { model: 'auto', stream, messages: [{ role: 'user', content: 'test' }] },
    controller: new AbortController(), requestMeta, ...more,
  });
  return { client, requestMeta, events, logs, run };
}

for (const stream of [false, true]) {
  test(`HTTP 500 then success: stream=${stream}, same request ID and model, warnings only`, async () => {
    const calls = [];
    const f = fixture(async (_url, init) => {
      calls.push(init);
      return calls.length === 1 ? unavailable(500) : response(good);
    });
    const res = resMock();
    await f.run(stream, { res });
    assert.equal(res.status, 200);
    assert.match(res.text, /你好/);
    assert.equal(calls.length, 2);
    assert.equal(f.requestMeta.retryCount, 1);
    assert.equal(f.requestMeta.attempts, 2);
    assert.ok(calls.every(call => call.headers['X-Request-ID'] === 'request-unit-1'));
    assert.ok(calls.every(call => JSON.parse(call.body).model === 'auto'));
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].level, 'warn');
    assert.equal(f.events[0].data.outcome, 'retry');
    assert.equal(f.logs.length, 0);
  });
}

test('persistent 500 exhausts exactly two retries and does not create a fake success', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return unavailable(500); });
  const res = resMock();
  await assert.rejects(f.run(false, { res }), error => error.statusCode === 500 && /temporarily unavailable/.test(error.message));
  assert.equal(calls, 3);
  assert.equal(res.headersSent, false);
  assert.equal(f.events.filter(e => e.data.outcome === 'retry').length, 2);
  assert.equal(f.events.filter(e => e.level === 'error').length, 0); // the HTTP handler logs the final error
});

for (const status of [400, 401, 403, 429, 501]) {
  test(`HTTP ${status} is not treated as transient provider unavailability`, async () => {
    let calls = 0;
    const f = fixture(async () => { calls++; return unavailable(status); });
    await assert.rejects(f.run(), error => error.statusCode === status);
    assert.equal(calls, 1);
  });
}

test('unknown network failure is not blindly replayed', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; throw new Error('socket reset'); });
  await assert.rejects(f.run(), /socket reset/);
  assert.equal(calls, 1);
});

test('cancel during backoff stops further attempts promptly', async () => {
  let calls = 0;
  const controller = new AbortController();
  const f = fixture(async () => { calls++; return unavailable(503); }, {
    transientRetryDelaysMs: [60_000],
    logEvent: () => queueMicrotask(() => controller.abort(new Error('client canceled'))),
  });
  await f.run(false, { controller });
  assert.equal(calls, 1);
});

test('an already aborted request never contacts the upstream', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return response(good); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.run(false, { controller }));
  assert.equal(calls, 0);
});

for (const stream of [false, true]) {
  test(`UTF-8 split into single bytes and final frame without newline: stream=${stream}`, async () => {
    const bytes = new TextEncoder().encode(frame(delta('中文完整', 'stop')) + 'data: [DONE]');
    let index = 0;
    const source = new ReadableStream({ pull(c) { if (index < bytes.length) c.enqueue(bytes.slice(index, ++index)); else c.close(); } });
    const f = fixture(async () => response(source));
    const res = resMock();
    await f.run(stream, { res });
    assert.match(res.text, /中文完整/);
    assert.doesNotMatch(res.text, /�/);
  });

  test(`ignore any stray error after a valid DONE: stream=${stream}`, async () => {
    const f = fixture(async () => response(good + frame({ error: { message: 'late transport error' } })));
    const res = resMock();
    await f.run(stream, { res });
    assert.match(res.text, /你好/);
    assert.doesNotMatch(res.text, /late transport/);
  });

  test(`a stream error before DONE is still a real failure, never retried: stream=${stream}`, async () => {
    let calls = 0;
    const f = fixture(async () => { calls++; return response(frame(delta('partial')) + frame({ error: { message: 'stream failed' } })); });
    await assert.rejects(f.run(stream), /stream failed/);
    assert.equal(calls, 1);
  });

  test(`truncated/empty/malformed streams must not fabricate success: stream=${stream}`, async () => {
    for (const text of ['', frame(delta('partial')), 'data: not-json\n\n', 'data: [DONE]\n\n']) {
      const f = fixture(async () => response(text));
      await assert.rejects(f.run(stream), error => error.statusCode === 502);
    }
  });
}

test('reasoning coalescing retains finish_reason, role, usage and text', async () => {
  const text = frame({ id: 'x', choices: [{ index: 0, delta: { role: 'assistant' } }] })
    + frame({ id: 'x', choices: [{ index: 0, delta: { reasoning_content: '先' } }] })
    + frame({ id: 'x', choices: [{ index: 0, delta: { reasoning_content: '想' } }] })
    + frame({ id: 'x', choices: [{ index: 0, delta: { reasoning_content: '好' }, finish_reason: 'stop' }], usage: { total_tokens: 3 } })
    + 'data: [DONE]\n\n';
  const f = fixture(async () => response(text));
  const res = resMock();
  await f.run(true, { res });
  assert.match(res.text, /先想/);
  assert.match(res.text, /"reasoning_content":"好"/);
  assert.match(res.text, /"finish_reason":"stop"/);
  assert.match(res.text, /"role":"assistant"/);
  assert.match(res.text, /"total_tokens":3/);
  assert.equal(res.text.match(/\[DONE\]/g).length, 1);
});

test('three identical requests remain serial; a canceled waiter never jumps the queue', async () => {
  let calls = 0, running = 0, maxRunning = 0, releaseFirst;
  const first = new Promise(resolve => { releaseFirst = resolve; });
  const f = fixture(async () => {
    calls++; running++; maxRunning = Math.max(maxRunning, running);
    if (calls === 1) await first;
    running--;
    return response(good);
  });
  const canceled = new AbortController();
  const a = f.run(false, { dedupeKey: 'same' });
  const b = f.run(false, { dedupeKey: 'same', controller: canceled });
  const rejected = assert.rejects(b);
  const c = f.run(false, { dedupeKey: 'same' });
  canceled.abort();
  releaseFirst();
  await Promise.all([a, rejected, c]);
  assert.equal(calls, 2);
  assert.equal(maxRunning, 1);
});

test('other POST endpoints do not acquire automatic 5xx retries', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return unavailable(500); });
  await assert.rejects(f.client.forwardEmbeddings({ req: {}, res: resMock(), body: {}, controller: new AbortController() }));
  assert.equal(calls, 1);
});
