/**
 * 吸收自 claude-code-nexus 的国内 provider 预设 + 模型映射单元测试。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CN_PRESET_PROVIDERS,
  FIXED_MODEL_RULES,
  DEFAULT_MODEL_MAPPING,
  findTargetModel,
  isValidModelMapping,
} from '../src/workbuddy-cn-providers.mjs';
import { maskApiKey } from '../src/workbuddy-secure-store.mjs';

test('CN_PRESET_PROVIDERS 含国内主流供应商且 baseUrl 合法', () => {
  assert.ok(Array.isArray(CN_PRESET_PROVIDERS));
  assert.ok(CN_PRESET_PROVIDERS.length >= 10);
  for (const p of CN_PRESET_PROVIDERS) {
    assert.ok(p.name && p.baseUrl && p.baseUrl.startsWith('https://'));
  }
  // 关键供应商存在
  const names = CN_PRESET_PROVIDERS.map((p) => p.name);
  for (const must of ['通义千问', '豆包', 'Kimi', '智谱清言', '腾讯混元']) {
    assert.ok(names.includes(must), `缺少预设供应商: ${must}`);
  }
});

test('FIXED_MODEL_RULES 含 haiku/sonnet/opus 三档', () => {
  const keywords = FIXED_MODEL_RULES.map((r) => r.keyword);
  assert.deepEqual(keywords.sort(), ['haiku', 'opus', 'sonnet']);
});

test('findTargetModel 子串命中 haiku/sonnet/opus', () => {
  assert.equal(findTargetModel('claude-3-5-haiku-20241022'), DEFAULT_MODEL_MAPPING.haiku);
  assert.equal(findTargetModel('claude-3-5-sonnet-20241022'), DEFAULT_MODEL_MAPPING.sonnet);
  assert.equal(findTargetModel('claude-3-opus-20240229'), DEFAULT_MODEL_MAPPING.opus);
});

test('findTargetModel 未命中原样返回', () => {
  assert.equal(findTargetModel('gpt-4o-mini'), 'gpt-4o-mini');
  assert.equal(findTargetModel(''), '');
});

test('findTargetModel 支持自定义映射表', () => {
  const custom = { haiku: 'qwen-turbo', sonnet: 'qwen-plus', opus: 'qwen-max' };
  assert.equal(findTargetModel('claude-3-5-sonnet-latest', custom), 'qwen-plus');
});

test('isValidModelMapping 校验完整性', () => {
  assert.equal(isValidModelMapping(DEFAULT_MODEL_MAPPING), true);
  assert.equal(isValidModelMapping({ haiku: '', sonnet: 'x', opus: 'y' }), false);
  assert.equal(isValidModelMapping({ haiku: 'x' }), false);
  assert.equal(isValidModelMapping(null), false);
});

test('maskApiKey 来自 secure-store（展示掩码）', () => {
  assert.equal(maskApiKey('sk-ant-abcdefghijklmnop'), 'sk-a***************mnop');
  assert.equal(maskApiKey('short'), '*****');
  assert.equal(maskApiKey(''), '********');
});
