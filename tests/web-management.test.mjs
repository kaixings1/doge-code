import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import http from 'node:http';
import { allowManagementRequest, equalSecret } from '../src/workbuddy-web.mjs';

const home = mkdtempSync(join(tmpdir(), 'wb-web-regression-'));
const originalEnv = { ...process.env };
for (const key of Object.keys(process.env)) if (key.startsWith('WORKBUDDY_')) delete process.env[key];
process.env.WORKBUDDY_PROXY_HOME = home;
const realFetch = globalThis.fetch;
let upstreamCalls = 0;
let behavior = 'ok';
const terminal = 'data: {"id":"offline","model":"auto","choices":[{"index":0,"delta":{"content":"测试成功"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
// Strict outbound isolation: no real account, token, billing call, or model request leaves this test.
globalThis.fetch = async (url, options) => {
  const address = new URL(url);
  if (address.hostname === '127.0.0.1') return realFetch(url, options);
  if (address.hostname !== 'upstream.test.invalid') throw new Error(`Unexpected external request: ${address.hostname}`);
  if (address.pathname === '/v2/chat/completions') {
    upstreamCalls++;
    if (behavior === 'fail' || (behavior === 'recover' && upstreamCalls === 1)) {
      return new Response(JSON.stringify({ error: { message: 'the model provider is temporarily unavailable, please retry later or switch to another model' } }), { status: 500 });
    }
    const text = behavior === 'stream-error'
      ? 'data: {"error":{"message":"stream terminated before completion"}}\n\n'
      : terminal;
    return new Response(text, { headers: { 'Content-Type': 'text/event-stream' } });
  }
  return new Response(JSON.stringify({ code: 0, data: {} }), { headers: { 'Content-Type': 'application/json' } });
};
const { createServer } = await import('../server.mjs');
const server = createServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
let activeKey = '';
const call = async (path, { method = 'GET', body, key = activeKey, headers = {} } = {}) => {
  const res = await realFetch(`${base}${path}`, { method, headers: {
    ...(key ? { 'X-API-Key': key } : {}),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers,
  }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { /* static content or SSE */ }
  return { status: res.status, headers: res.headers, text, json: data };
};
const getLogs = async () => (await call('/api/logs?limit=500')).json.data.entries;
const chat = stream => call('/v1/chat/completions', { method: 'POST', body: {
  model: 'auto', stream, messages: [{ role: 'user', content: 'Hello offline test' }],
} });

after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = realFetch;
  for (const key of Object.keys(process.env)) if (key.startsWith('WORKBUDDY_')) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) if (key.startsWith('WORKBUDDY_')) process.env[key] = value;
  rmSync(home, { recursive: true, force: true });
});

test('Web assets, redirect, CSP, and allowlisted static paths', async () => {
  for (const path of ['/', '/index.html', '/admin/', '/theme.js', '/web-api.js', '/web.css', '/app.js', '/logs-panel.js', '/desensitize-panel.js']) {
    const response = await call(path);
    assert.equal(response.status, 200, path);
  }
  const page = await call('/');
  assert.match(page.text, /Web 管理台/);
  assert.match(page.text, /web-api.js/);
  assert.doesNotMatch(page.text, /value="embedded"/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  const head = await call('/', { method: 'HEAD' });
  assert.equal(head.text, '');
  for (const path of ['/server.mjs', '/package.json', '/src/workbuddy-auth.mjs', '/..%2fserver.mjs', '/desktop/main.cjs']) {
    assert.equal((await call(path)).status, 404);
  }
});

test('management rejects foreign origins and rebinding without breaking OpenAI CORS', async () => {
  assert.equal((await call('/api/session', { headers: { Origin: 'https://foreign.invalid' } })).status, 403);
  assert.equal((await call('/api/config', { method: 'POST', body: {}, headers: { Origin: 'null' } })).status, 403);
  const rebindStatus = await new Promise((resolve, reject) => {
    http.get(`${base}/api/session`, { headers: { Host: 'evil.invalid' } }, res => {
      res.resume(); resolve(res.statusCode);
    }).on('error', reject);
  });
  assert.equal(rebindStatus, 403);
  assert.equal((await call('/api/session', { headers: { Origin: base } })).status, 200);
  assert.equal((await call('/api/session')).headers.get('access-control-allow-origin'), null);
  assert.equal((await call('/v1/models')).headers.get('access-control-allow-origin'), '*');
});

test('API key enable, validate, rotate; protect session/endpoints and redact health', async () => {
  assert.equal((await call('/api/config', { method: 'POST', body: '{broken' })).status, 400);
  assert.equal((await call('/api/config', { method: 'POST', body: { apiKey: 'short' } })).status, 400);
  assert.equal((await call('/api/config', { method: 'POST', body: { apiKey: 'offline-key-12345' } })).status, 200);
  activeKey = 'offline-key-12345';
  for (const path of ['/api/config', '/api/session', '/api/accounts', '/api/endpoints', '/api/logs/download']) {
    const rejected = await call(path, { key: '' });
    assert.equal(rejected.status, 401, path);
    assert.equal(rejected.json.error.type, 'invalid_api_key');
    assert.equal((await call(path)).status, 200, path);
  }
  const health = await call('/health', { key: '' });
  assert.equal(health.status, 200);
  assert.equal(health.json.authRequired, true);
  assert.equal(health.json.login, undefined);
  assert.equal((await call('/api/config', { headers: { Origin: 'https://foreign.invalid' } })).status, 403);
  assert.equal((await call('/api/config', { method: 'POST', body: { apiKey: 'rotated-key-67890' } })).status, 200);
  assert.equal((await call('/api/config')).status, 401);
  activeKey = 'rotated-key-67890';
  assert.equal((await call('/api/config')).status, 200);
});

test('add and switch test accounts using existing HTTP contracts', async () => {
  for (const id of ['alpha', 'beta']) {
    const added = await call('/api/accounts', { method: 'POST', body: {
      auth: { accessToken: 'FAKE-TEST-TOKEN', expiresAt: Date.now() + 3_600_000 },
      account: { uid: id, nickname: `Test ${id}` }, endpoint: 'https://upstream.test.invalid',
    } });
    assert.equal(added.status, 200);
  }
  assert.equal((await call('/api/accounts/current', { method: 'POST', body: { id: 'user-beta' } })).status, 200);
  const state = (await call('/api/session')).json.data;
  assert.equal(state.accounts.currentAccountId, 'user-beta');
  assert.equal(state.accounts.accounts.length, 2);
  assert.equal(state.accounts.accounts[0].accessToken, undefined);
});

test('recovered 500 yields a success entry, correlated warning, and no false final error', async () => {
  behavior = 'recover'; upstreamCalls = 0;
  await call('/api/logs', { method: 'DELETE' });
  const result = await chat(false);
  assert.equal(result.status, 200);
  assert.equal(result.json.choices[0].message.content, '测试成功');
  const requestId = result.headers.get('x-request-id');
  assert.ok(requestId);
  const entries = (await getLogs()).filter(e => e.data?.requestId === requestId);
  assert.equal(entries.filter(e => e.level === 'error').length, 0);
  assert.equal(entries.filter(e => e.data.outcome === 'retry').length, 1);
  assert.equal(entries.filter(e => e.data.outcome === 'success').length, 1);
  assert.equal(entries.find(e => e.data.outcome === 'success').data.attempts, 2);
  const search = await call(`/api/logs?keyword=${requestId}&outcome=success`);
  assert.equal(search.json.data.entries.length, 1);
});

test('persistent 500 produces exactly one final error; a later success keeps its own ID', async () => {
  behavior = 'fail'; upstreamCalls = 0;
  await call('/api/logs', { method: 'DELETE' });
  const failed = await chat(false);
  assert.equal(failed.status, 500);
  assert.equal(upstreamCalls, 3);
  const id = failed.headers.get('x-request-id');
  assert.equal(failed.json.error.request_id, id);
  let entries = await getLogs();
  assert.equal(entries.filter(e => e.data?.requestId === id && e.level === 'error').length, 1);
  assert.equal(entries.filter(e => /上游错误 HTTP/.test(e.message)).length, 0);
  behavior = 'ok';
  const succeeded = await chat(true);
  assert.equal(succeeded.status, 200);
  assert.match(succeeded.text, /\[DONE\]/);
  assert.notEqual(succeeded.headers.get('x-request-id'), id);
  entries = await getLogs();
  assert.ok(entries.some(e => e.data?.requestId === id && e.data?.outcome === 'failed'));
  assert.ok(entries.some(e => e.data?.requestId === succeeded.headers.get('x-request-id') && e.data?.outcome === 'success'));
});

test('SSE errors are logged as failure despite HTTP headers having been sent', async () => {
  behavior = 'stream-error'; upstreamCalls = 0;
  const result = await chat(true);
  assert.equal(result.status, 200); // already-sent SSE headers cannot be replaced
  assert.match(result.text, /stream terminated before completion/);
  assert.match(result.text, /"error"/);
  assert.equal(upstreamCalls, 1);
  const id = result.headers.get('x-request-id');
  const entries = (await getLogs()).filter(e => e.data?.requestId === id);
  assert.equal(entries.filter(e => e.data.outcome === 'failed').length, 1);
  assert.equal(entries.filter(e => e.data.outcome === 'success').length, 0);
});

test('key comparison and remote management security boundary', () => {
  assert.equal(equalSecret('a', 'a'), true);
  assert.equal(equalSecret('a', 'aa'), false);
  assert.equal(equalSecret(['a'], 'a'), false);
  const req = { headers: { host: '192.0.2.1:3065' }, socket: { localAddress: '192.0.2.1', remoteAddress: '192.0.2.2' } };
  assert.equal(allowManagementRequest(req, { host: '192.0.2.1' }), false);
  assert.equal(allowManagementRequest(req, { host: '192.0.2.1', apiKey: 'configured' }), true);
});

test('OpenAI chat 路由也应用 haiku/sonnet/opus 三档映射改写', async () => {
  // 把三档都映射到白名单内已有的 deepseek-v4-flash
  const set = await call('/api/config', { method: 'POST', body: {
    modelMapping: { haiku: 'deepseek-v4-flash', sonnet: 'deepseek-v4-flash', opus: 'deepseek-v4-flash' },
  } });
  assert.equal(set.status, 200);

  // 命中关键词且目标已注册 → 改写成功并转发（200，不再 400）
  behavior = 'ok';
  const ok = await call('/v1/chat/completions', { method: 'POST', body: {
    model: 'claude-3-5-sonnet-20241022', stream: true,
    messages: [{ role: 'user', content: 'hi' }],
  } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));

  // 映射到未注册目标时，保持「点名即严格路由」契约：原模型名 400，不静默改写
  const set2 = await call('/api/config', { method: 'POST', body: {
    modelMapping: { haiku: 'gemini-2.5-pro', sonnet: 'gemini-2.5-pro', opus: 'gemini-2.5-pro' },
  } });
  assert.equal(set2.status, 200);
  const bad = await call('/v1/chat/completions', { method: 'POST', body: {
    model: 'claude-3-opus-20240229', stream: true,
    messages: [{ role: 'user', content: 'hi' }],
  } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error.message, /claude-3-opus/);

  // 还原为默认映射，避免影响其他用例
  await call('/api/config', { method: 'POST', body: { modelMapping: { haiku: 'gemini-2.5-flash-nothinking', sonnet: 'gemini-2.5-pro', opus: 'gemini-2.5-pro' } } });
});

test('modelMapping 可通过 /api/config 持久化并回显', async () => {
  // 设置合法映射
  const set = await call('/api/config', { method: 'POST', body: {
    modelMapping: { haiku: 'qwen-turbo', sonnet: 'qwen-plus', opus: 'qwen-max' },
  } });
  assert.equal(set.status, 200, JSON.stringify(set.json));
  assert.equal(set.json.data.modelMapping.sonnet, 'qwen-plus');

  // GET 回显当前生效映射
  const get = await call('/api/config');
  assert.equal(get.status, 200);
  assert.equal(get.json.data.modelMapping.sonnet, 'qwen-plus');

  // 非法映射被拒绝
  const bad = await call('/api/config', { method: 'POST', body: { modelMapping: { haiku: '' } } });
  assert.equal(bad.status, 400);
});

test('translateThinking 可通过 /api/config 持久化并回显', async () => {
  // 默认应为 true（显性开启）
  const before = await call('/api/config');
  assert.equal(before.status, 200);
  assert.equal(before.json.data.translateThinking, true);

  // 关闭 thinking 透传
  const set = await call('/api/config', { method: 'POST', body: { translateThinking: false } });
  assert.equal(set.status, 200, JSON.stringify(set.json));
  assert.equal(set.json.data.translateThinking, false);

  // GET 回显当前生效值
  const get = await call('/api/config');
  assert.equal(get.json.data.translateThinking, false);

  // 非布尔值被拒绝
  const bad = await call('/api/config', { method: 'POST', body: { translateThinking: 'yes' } });
  assert.equal(bad.status, 400);

  // 恢复默认
  const restore = await call('/api/config', { method: 'POST', body: { translateThinking: true } });
  assert.equal(restore.status, 200);
  assert.equal(restore.json.data.translateThinking, true);
});

test('/api/providers 返回国内供应商预设与三档映射', async () => {
  const res = await call('/api/providers');
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.ok(Array.isArray(res.json.data.cnPresetProviders) && res.json.data.cnPresetProviders.length >= 10);
  assert.ok(res.json.data.defaultModelMapping.haiku && res.json.data.defaultModelMapping.sonnet);
  assert.deepEqual(res.json.data.fixedModelRules.map(r => r.keyword).sort(), ['haiku', 'opus', 'sonnet']);
});
