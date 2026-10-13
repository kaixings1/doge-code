/**
 * Anthropic 路由端到端回归测试（mock 上游，无真实网络）。
 *
 * 锁住此前修复的回归：非流式 /v1/messages 必须返回 Anthropic message 格式
 * （含 thinking 块），而非把上游 OpenAI 响应原样透传为 chat.completion 格式。
 *
 * 做法：重写 globalThis.fetch 拦截上游（copilot.tencent.com 等）请求，
 * 对 /v2/chat/completions 返回含 reasoning_content 的 OpenAI SSE，其余返回假成功。
 * 启动真实 server（注入最小登录态 + apiKey 认证），分别请求 /v1/messages（非流式）
 * 与 /v1/chat/completions，断言两者格式互不串台。
 *
 * 运行: node --test tests/anthropic-route-e2e.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

// ── 拦截上游 fetch（必须在 import server 之前）──
const realFetch = globalThis.fetch;
// 上游返回的含推理的 OpenAI SSE：先 reasoning_content，再 content，最后 usage + finish
const UPSTREAM_SSE = [
  'data: {"id":"wb-1","model":"hy4-preview","choices":[{"index":0,"delta":{"reasoning_content":"思考杭州的介绍"}}]}\n\n',
  'data: {"choices":[{"index":0,"delta":{"reasoning_content":"组织一句简介"}}]}\n\n',
  'data: {"choices":[{"index":0,"delta":{"content":"杭州是浙江省省会，以西湖闻名的创新之城。"}}]}\n\n',
  'data: {"usage":{"prompt_tokens":71,"completion_tokens":200,"prompt_tokens_details":{"cached_tokens":5}},"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
  'data: [DONE]\n\n',
].join('');

globalThis.fetch = async (url, options) => {
  const address = new URL(url);
  // 本地请求（server 自身）走真实 fetch
  if (address.hostname === '127.0.0.1') return realFetch(url, options);
  // 上游对话接口：返回含 reasoning 的 SSE
  if (address.pathname === '/v2/chat/completions') {
    return new Response(UPSTREAM_SSE, { headers: { 'Content-Type': 'text/event-stream' } });
  }
  // 其余上游接口（鉴权 state / token refresh / 计费 / 签到等）：返回假成功，避免启动崩溃
  return new Response(JSON.stringify({ code: 0, data: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 36e5, id: 'u1', uid: 'u1', nickname: 't', usageLeft: '1', totalLeft: '1' } }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

const home = mkdtempSync(join(tmpdir(), 'wb-anth-e2e-'));
process.env.WORKBUDDY_PROXY_HOME = home;
// 隔离真实环境：不继承可能已设置的 WORKBUDDY_* 变量（仅保留 HOME 本身）
for (const key of Object.keys(process.env)) {
  if (key.startsWith('WORKBUDDY_') && key !== 'WORKBUDDY_PROXY_HOME') delete process.env[key];
}
// 注入一个有效登录态：server 的 getCurrentSession 优先级为
//   环境变量 WORKBUDDY_TOKEN > 账号存储 > auth.json
// 故直接用环境变量注入（最高优先级），无需扰动产线账号文件。
// 上游 fetch 已对所有非对话请求返回假成功，token 不会被真正校验。
process.env.WORKBUDDY_TOKEN = 'AT-test';
process.env.WORKBUDDY_REFRESH_TOKEN = 'RT-test';
process.env.WORKBUDDY_USER_ID = 'u1';
// 启用 apiKey 认证以验证鉴权不影响路由格式
mkdirSync(join(home, 'data'), { recursive: true });
writeFileSync(join(home, 'data', 'config.json'), JSON.stringify({ apiKey: 'testkey123' }), 'utf8');
const API_KEY = 'testkey123';

const { createServer } = await import('../server.mjs');
const server = createServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

const call = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const extraHeaders = body != null ? { 'Content-Type': 'application/json' } : {};
  const res = await realFetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY, ...extraHeaders, ...headers },
    ...(body != null ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { /* SSE 或非 JSON */ }
  return { status: res.status, text, json: data };
};

test('非流式 /v1/messages 返回 Anthropic message 格式（含 thinking 块），非 OpenAI 格式', async () => {
  const res = await call('/v1/messages', {
    method: 'POST',
    headers: { 'anthropic-version': '2023-06-01' },
    body: { model: 'auto', max_tokens: 200, messages: [{ role: 'user', content: '用一句话介绍杭州' }], stream: false },
  });
  assert.equal(res.status, 200, `应 200，实际 ${res.status} 响应：${res.text.slice(0, 300)}`);
  const msg = res.json;
  // 必须是 Anthropic message，绝不能是 OpenAI chat.completion
  assert.equal(msg?.type, 'message', `应返回 Anthropic message，实际顶层结构：${JSON.stringify(msg).slice(0, 200)}`);
  assert.equal(msg?.role, 'assistant');
  assert.ok(Array.isArray(msg?.content), 'content 应为数组');
  // 含 thinking 块（reasoning_content 透传）
  const thinking = (msg.content || []).find(b => b.type === 'thinking');
  assert.ok(thinking, '应含 thinking 块');
  assert.equal(thinking.signature, '', 'thinking 块应补空 signature');
  assert.ok((thinking.thinking || '').includes('杭州'), 'thinking 块应含推理内容');
  // 含 text 块
  const text = (msg.content || []).find(b => b.type === 'text');
  assert.ok(text, '应含 text 块');
  assert.ok((text.text || '').includes('杭州'), 'text 块应含正文');
  // 关键负向断言：不得是 OpenAI 格式（这正是修复前的回归）
  assert.notEqual(msg?.object, 'chat.completion', '不得返回 OpenAI chat.completion 格式');
  assert.ok(!Array.isArray(msg?.choices), '不得含 OpenAI choices 数组');
  // 缓存 token 统计
  assert.equal(msg?.usage?.cache_read_input_tokens, 5, '缓存 token 应透传');
});

test('OpenAI /v1/chat/completions 路由仍返回 OpenAI 格式（不被 anthropic 改动影响）', async () => {
  const res = await call('/v1/chat/completions', {
    method: 'POST',
    body: { model: 'auto', messages: [{ role: 'user', content: '你好' }], max_tokens: 50, stream: false },
  });
  assert.equal(res.status, 200, `应 200，实际 ${res.status} 响应：${res.text.slice(0, 200)}`);
  const j = res.json;
  assert.equal(j?.object, 'chat.completion', 'OpenAI 路由应保持 chat.completion 格式');
  assert.ok(Array.isArray(j?.choices), '应含 choices 数组');
  assert.equal(j.choices[0].message.role, 'assistant');
});

test.after(async () => {
  // 优雅关闭：先关所有连接再等 close 事件（与 web-management 一致）。
  // 该文件在 package.json 的 test:e2e 中以独立子进程运行，不与其它
  // import server 的测试共享 uv 句柄，故可安全关闭。
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  rmSync(home, { recursive: true, force: true });
  globalThis.fetch = realFetch;
});
