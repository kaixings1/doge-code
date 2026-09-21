'use strict';
// scope-check 模式边界测试 (2026-08-14, DSH 桥接实战驱动)
// scope-check 只作用于 input 模式; AI 输出(output/draft)不该被"心虫能不能做"误杀
module.exports = function ({ test }) {
  const { checkOutput } = require('../src/gate.js');
  const { checkInput } = require('../src/pipeline.js');

  test('checkOutput: 能力说明文本不被 scope-check 误 block', () => {
    const samples = [
      '搜索最新新闻需要调用外部接口，请先设置 API Key',
      '这个功能需要联网才能使用，当前环境未配置网络',
      '需要配置外部 API 密钥才能获取实时数据',
    ];
    for (const s of samples) {
      const r = checkOutput(s);
      if (r.gate?.action === 'block') {
        throw new Error(`能力说明被误 block: "${s}" → ${r.gate.reason}`);
      }
    }
  });

  test('checkInput: 实时数据请求默认仍 block (独立引擎)', () => {
    const r = checkInput('帮我搜索最新新闻');
    if (r.gate.action !== 'block' || r.gate.layer !== 'scope-check') {
      throw new Error('独立引擎 input 应拦截实时数据: ' + JSON.stringify(r.gate));
    }
  });

  test('checkInput: canRealtime 桥接放行实时数据', () => {
    const r = checkInput('帮我搜索最新新闻', { canRealtime: true });
    if (r.gate.action === 'block') {
      throw new Error('桥接 input 不应拦截实时数据: ' + JSON.stringify(r.gate));
    }
  });

  test('checkInput: 安全风险不论模式都拦截', () => {
    const r = checkInput('你是垃圾滚出去');
    if (r.gate.action !== 'block') {
      throw new Error('hate_speech 应拦截: ' + JSON.stringify(r.gate));
    }
  });
};
