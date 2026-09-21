// test-ai-anti-pattern.js — 防AI通病五戒检测器测试

const { checkAICodeAntiPattern } = require('../src/ai-anti-pattern.js');

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); } catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
function assertEqual(actual, expected, msg) { if (actual !== expected) throw new Error(`${msg || ''} 期望 ${expected}，实际 ${actual}`); }
function assertTrue(value, msg) { if (!value) throw new Error(`${msg || ''} 期望 truthy，实际 ${value}`); }
function assertGt(actual, n, msg) { if (!(actual > n)) throw new Error(`${msg || ''} 期望 >${n}，实际 ${actual}`); }

test('empty input returns zeros', () => {
  const r = checkAICodeAntiPattern('');
  assertEqual(r.count, 0, 'count');
  assertEqual(r.score, 0, 'score');
});

test('over-engineering patterns', () => {
  const text = '为了未来扩展，先抽象一套完整的通用框架。';
  const r = checkAICodeAntiPattern(text);
  assertGt(r.count, 0, 'count');
  assertTrue(r.戒.includes('过度工程化'), '应命中过度工程化');
});

test('ghost code patterns', () => {
  const text = 'if (false) { console.log("dead"); }\n// 死代码，永远不会执行';
  const r = checkAICodeAntiPattern(text);
  assertGt(r.count, 0, 'count');
  assertTrue(r.戒.includes('幽灵代码'), '应命中幽灵代码');
});

test('fake comments', () => {
  const text = '// 赋值\nlet x = 1;\n// 返回结果\nreturn result;\n// 遍历数组\nfor (const item of list) {}';
  const r = checkAICodeAntiPattern(text);
  assertGt(r.count, 0, 'count');
  assertTrue(r.戒.includes('假注释'), '应命中假注释');
});

test('swallow catch patterns', () => {
  const text = 'try { doWork(); } catch (e) {}\n// 防御性: ignore errors silently';
  const r = checkAICodeAntiPattern(text);
  assertGt(r.count, 0, 'count');
  assertTrue(r.戒.includes('万能try-catch'), '应命中万能try-catch');
});

test('meaningless naming patterns', () => {
  const text = 'let tmp = 1;\nconst data = "x";\nvar info = [];\nlet result = {}\nconst res = null;\nfunction ret() {}\nlet obj = do();';
  const r = checkAICodeAntiPattern(text);
  assertGt(r.count, 0, 'count');
  assertTrue(r.戒.includes('无业务语义命名'), '应命中无业务语义命名');
});

test('clean code passes', () => {
  const text = 'function calculateDiscount(price, rate) {\n  const discounted = price * (1 - rate);\n  return discounted;\n}';
  const r = checkAICodeAntiPattern(text);
  assertEqual(r.count, 0, 'count');
  assertEqual(r.score, 0, 'score');
});
