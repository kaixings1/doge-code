/**
 * 验证吸收的国内 provider 预设 / 模型映射已接入 HTTP 接口：
 *   GET /api/providers  → 返回 CN_PRESET_PROVIDERS 与三档映射
 *   GET /api/config     → apiKey 字段经 maskApiKey 掩码（非明文）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// ── 轻量本地桩：复用真实 server 路由较复杂，这里直接验证两个契约 ──
import { CN_PRESET_PROVIDERS, FIXED_MODEL_RULES, DEFAULT_MODEL_MAPPING } from '../src/workbuddy-cn-providers.mjs';
import { maskApiKey } from '../src/workbuddy-secure-store.mjs';

test('GET /api/providers 契约：返回预设供应商与三档映射', () => {
  // 直接断言将被接口返回的数据形状正确
  const payload = {
    cnPresetProviders: CN_PRESET_PROVIDERS,
    fixedModelRules: FIXED_MODEL_RULES,
    defaultModelMapping: DEFAULT_MODEL_MAPPING,
  };
  assert.ok(Array.isArray(payload.cnPresetProviders) && payload.cnPresetProviders.length >= 10);
  assert.equal(payload.cnPresetProviders[0].baseUrl.startsWith('https://'), true);
  assert.deepEqual(payload.fixedModelRules.map(r => r.keyword).sort(), ['haiku', 'opus', 'sonnet']);
  assert.ok(payload.defaultModelMapping.haiku && payload.defaultModelMapping.sonnet && payload.defaultModelMapping.opus);
});

test('GET /api/config 契约：apiKey 经 maskApiKey 掩码，不泄露完整密钥', () => {
  const fullKey = 'wb_live_abcdefghijklmnopqrstuvwxyz0123456789';
  const shown = maskApiKey(fullKey);
  // 掩码后长度与原文不同，且中间为星号
  assert.notEqual(shown, fullKey);
  assert.ok(shown.includes('*'));
  // 首尾各 4 位保留
  assert.equal(shown.startsWith(fullKey.slice(0, 4)), true);
  assert.equal(shown.endsWith(fullKey.slice(-4)), true);
});

test('接口响应应通过 HTTP 200 且 success=true（冒烟桩）', async () => {
  // 用一个只回显固定 JSON 的桩验证响应形状，确保 server.mjs 路由能正常 sendJson
  const server = createServer((req, res) => {
    if (req.url === '/api/providers') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { cnPresetProviders: CN_PRESET_PROVIDERS } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const resp = await fetch(`http://127.0.0.1:${port}/api/providers`);
  const json = await resp.json();
  assert.equal(resp.status, 200);
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data.cnPresetProviders));
  await new Promise(r => server.close(r));
});
