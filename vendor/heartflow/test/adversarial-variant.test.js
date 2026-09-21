/**
 * test/adversarial-variant.test.js — 对抗变体检测器测试
 *
 * 启发来源：Hermes 专访「任何模型都可越狱，因为你有无限次尝试」
 * 验证：零宽/同形字/全角/组合字符/数字混淆/词拆分 六类变体全部检出
 */
module.exports = function ({ test }) {
  const { checkAdversarialVariant } = require('../src/shield/adversarial-variant.js');
  const { checkOutput } = require('../src/pipeline.js');

  test('零宽字符检出（高危）', () => {
    const r = checkAdversarialVariant('h\u200Be\u200Cll\u200Do');
    if (r.action !== 'rewrite') throw new Error(`期望rewrite，实际${r.action}`);
    if (r.risk !== 'high') throw new Error(`期望high，实际${r.risk}`);
    if (!r.signals.some(s => s.id === 'zero_width')) throw new Error('缺 zero_width 信号');
  });

  test('同形字检出（高危）', () => {
    const r = checkAdversarialVariant('k\u0438ll them all'); // ки = 西里尔
    if (r.action !== 'rewrite') throw new Error(`期望rewrite，实际${r.action}`);
    if (!r.signals.some(s => s.id === 'homoglyph')) throw new Error('缺 homoglyph 信号');
  });

  test('全角字符检出', () => {
    const r = checkAdversarialVariant('\uFF48\uFF41\uFF54\uFF45 speech'); // ｈａｔｅ
    if (r.action === 'pass') throw new Error('全角字符未检出');
    if (!r.signals.some(s => s.id === 'fullwidth')) throw new Error('缺 fullwidth 信号');
  });

  test('组合字符检出', () => {
    const r = checkAdversarialVariant('cafe\u0301 test');
    if (!r.signals.some(s => s.id === 'combining')) throw new Error('缺 combining 信号');
  });

  test('数字混淆检出', () => {
    const r = checkAdversarialVariant('成功率 \uFF19\uFF19\uFF10\uFF10%'); // ９９００
    if (!r.signals.some(s => s.id === 'digit_obfus')) throw new Error('缺 digit_obfus 信号');
  });

  test('词拆分检出', () => {
    const r = checkAdversarialVariant('h a t e speech');
    if (r.action === 'pass') throw new Error('词拆分未检出');
    if (!r.signals.some(s => s.id === 'word_split')) throw new Error('缺 word_split 信号');
  });

  test('正常文本不误报', () => {
    const r = checkAdversarialVariant('今天天气不错，我们讨论一下技术方案。');
    if (r.action !== 'pass') throw new Error(`正常文本误报: ${r.action}`);
  });

  test('英文正常文本不误报', () => {
    const r = checkAdversarialVariant('This is a normal English sentence about technology.');
    if (r.action !== 'pass') throw new Error(`英文正常文本误报: ${r.action}`);
  });

  test('归一化建议可用（NFKC 折叠）', () => {
    const r = checkAdversarialVariant('\u2018hello\u2019'); // 弯引号
    if (r.normalized !== "'hello'") throw new Error(`归一化结果错误: ${JSON.stringify(r.normalized)}`);
  });

  test('pipeline 集成：零宽字符触发 rewrite 层', () => {
    const r = checkOutput('h\u200Be\u200Cll\u200Do world');
    if (r.gate.action !== 'rewrite') throw new Error(`期望pipeline rewrite，实际${r.gate.action}`);
    if (!(r.checked_by || []).some(l => l.layer === 'adversarial-variant')) {
      throw new Error('pipeline checked_by 缺 adversarial-variant 层');
    }
  });

  test('pipeline 集成：正常文本不受影响', () => {
    const r = checkOutput('请帮我分析这段代码的性能问题。');
    if (r.gate.action === 'block') throw new Error(`正常文本被 block: ${r.gate.reason}`);
  });
};
