/**
 * ai-writing-tell.test.js — AI 写作特征检测 e2e 验证
 *
 * 1. detect() 直接调用
 * 2. mcp-server 源码级接线验证（handleAITelling + heartflow_ai_writing_tell）
 * 3. discriminate() 聚合 ai_writing_tell 维度
 */

const path = require('path');
const fs = require('fs');

const HF_DIR = path.join(__dirname, '..');

module.exports = function ({ test, assertTrue, assertEqual, assertDefined }) {
  test('detect: AI 模板化开头必须命中', () => {
    const { detect } = require(path.join(HF_DIR, 'src/shield/ai-writing-tell.js'));
    const r = detect('Certainly! In the rapidly evolving world of AI, synergy is paramount.');
    assertTrue(r.count > 0, 'should hit AI tell signals');
    assertTrue(r.findings.length > 0, 'findings should not be empty');
    assertEqual(r.module, 'ai-writing-tell');
  });

  test('detect: 正常文本不误报', () => {
    const { detect } = require(path.join(HF_DIR, 'src/shield/ai-writing-tell.js'));
    const r = detect('honestly the code works on my machine; no fluff, just logs.');
    assertEqual(r.count, 0);
  });

  test('mcp server: handleAITelling + heartflow_ai_writing_tell 已接线', () => {
    const mcpSrc = fs.readFileSync(path.join(HF_DIR, 'src', 'mcp-server.js'), 'utf8');
    assertTrue(mcpSrc.includes('function handleAITelling'), 'handler function missing');
    assertTrue(mcpSrc.includes("name: 'heartflow_ai_writing_tell'"), 'TOOL definition missing');
    assertTrue(mcpSrc.includes('heartflow_ai_writing_tell: handleAITelling'), 'handler mapping missing');
  });

  test('discriminate: ai_writing_tell 维度出现在 findings', () => {
    const { discriminate } = require(path.join(HF_DIR, 'src/index.js'));
    const r = discriminate('Certainly! In the rapidly evolving world of AI, synergy is paramount.', []);
    const top = r.findings?.[0];
    assertDefined(top, 'findings must exist');
    assertEqual(top.dimension, 'ai_writing_tell');
  });
};
