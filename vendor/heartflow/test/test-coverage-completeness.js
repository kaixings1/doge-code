// test-coverage-completeness.js — 覆盖完整性检测器测试

const { checkCoverageCompleteness } = require('../src/coverage-completeness.js');

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); } catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
function assertTrue(value, msg) { if (!value) throw new Error(`${msg || ''} 期望 truthy，实际 ${value}`); }
function assertGt(actual, n, msg) { if (!(actual > n)) throw new Error(`${msg || ''} 期望 >${n}，实际 ${actual}`); }
function assertEq(actual, expected, msg) { if (actual !== expected) throw new Error(`${msg || ''} 期望 ${expected}，实际 ${actual}`); }

test('empty input', () => {
  const r = checkCoverageCompleteness('');
  assertEq(r.score, 0, 'score');
  assertEq(r.gaps.length, 0, 'gaps');
});

test('symmetric pair missing delete', () => {
  const text = 'function createUser() {}\nfunction updateUser() {}';
  const r = checkCoverageCompleteness(text);
  assertGt(r.gaps.length, 0, 'gaps');
  assertTrue(r.gaps.some(g => g.type === 'symmetric' && g.missing === 'delete'), '应缺少delete');
});

test('data shape missing形态', () => {
  const text = 'function handle(input) { return input; }';
  const r = checkCoverageCompleteness(text);
  assertGt(r.gaps.length, 0, 'gaps');
  assertTrue(r.gaps.some(g => g.type === 'data_shape'), '应缺数据形态');
});

test('branch missing else', () => {
  const text = 'if (err) { return; }\nif (ok) { return; }';
  const r = checkCoverageCompleteness(text);
  assertGt(r.gaps.length, 0, 'gaps');
  assertTrue(r.gaps.some(g => g.type === 'branch'), '应缺else');
});

test('swallow catch', () => {
  const text = 'try{}catch(e){}\ntry{}catch(e){}\ntry{}catch(e){}\ntry{}catch(e){}\ntry{}catch(e){}\ntry{}catch(e){}\ntry{}catch(e){}';
  const r = checkCoverageCompleteness(text);
  assertTrue(r.gaps.some(g => g.type === 'swallow_catch'), '应检测多 swallow catch');
});

test('complete code passes', () => {
  const text = `function create() {}
function delete() {}
function start() {}
function stop() {}
if (err) { return; } else { next(); }
if (ok) { return; } else { next(); }
try {} catch (e) { log(e); }`;
  const r = checkCoverageCompleteness(text);
  assertEq(r.score, 0, 'score');
});
