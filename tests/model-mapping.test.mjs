/**
 * 验证 haiku/sonnet/opus 三档模型映射已接入 Anthropic→OpenAI 转换。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anthropicToOpenAI } from '../src/workbuddy-anthropic-adapter.mjs';
import { DEFAULT_MODEL_MAPPING } from '../src/workbuddy-cn-providers.mjs';

test('anthropicToOpenAI: 未传映射时保留原始 model', () => {
  const out = anthropicToOpenAI({ model: 'claude-3-5-sonnet-20241022', messages: [] });
  assert.equal(out.model, 'claude-3-5-sonnet-20241022');
});

test('anthropicToOpenAI: 命中 sonnet 关键词改写为目标模型', () => {
  const out = anthropicToOpenAI(
    { model: 'claude-3-5-sonnet-20241022', messages: [] },
    'auto',
    DEFAULT_MODEL_MAPPING,
  );
  assert.equal(out.model, DEFAULT_MODEL_MAPPING.sonnet);
});

test('anthropicToOpenAI: 命中 haiku/opus 关键词分别改写', () => {
  const haiku = anthropicToOpenAI({ model: 'claude-3-haiku-xxx', messages: [] }, 'auto', DEFAULT_MODEL_MAPPING);
  const opus = anthropicToOpenAI({ model: 'claude-3-opus-xxx', messages: [] }, 'auto', DEFAULT_MODEL_MAPPING);
  assert.equal(haiku.model, DEFAULT_MODEL_MAPPING.haiku);
  assert.equal(opus.model, DEFAULT_MODEL_MAPPING.opus);
});

test('anthropicToOpenAI: 自定义映射表生效', () => {
  const custom = { haiku: 'qwen-turbo', sonnet: 'qwen-plus', opus: 'qwen-max' };
  const out = anthropicToOpenAI({ model: 'claude-3-5-sonnet-latest', messages: [] }, 'auto', custom);
  assert.equal(out.model, 'qwen-plus');
});

test('anthropicToOpenAI: 非 Claude 模型原样透传', () => {
  const out = anthropicToOpenAI({ model: 'gpt-4o-mini', messages: [] }, 'auto', DEFAULT_MODEL_MAPPING);
  assert.equal(out.model, 'gpt-4o-mini');
});

test('anthropicToOpenAI: 未点名 model 用 defaultModel 回退', () => {
  const out = anthropicToOpenAI({ messages: [] }, 'deepseek-v4-flash', DEFAULT_MODEL_MAPPING);
  assert.equal(out.model, 'deepseek-v4-flash');
});
