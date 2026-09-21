const { checkAIMisuse } = require('../src/ai-misuse.js');

let passed = 0;
let failed = 0;

function assert(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || ''} expected ${expected}, got ${actual}`);
}
function assertApprox(actual, expected, eps, msg) {
  if (Math.abs(actual - expected) > eps) throw new Error(`${msg || ''} expected ~${expected}, got ${actual}`);
}

console.log('\n📋 AI Misuse Detection\n');

assert('empty input returns zeros', () => {
  const r = checkAIMisuse('');
  assertEqual(r.score, 0);
  assertEqual(r.issues.length, 0);
});

assert('clean AI usage passes', () => {
  const text = '我先查看文档，再逐步实现功能。每步完成后跑测试验证。';
  const r = checkAIMisuse(text);
  assertEqual(r.issues.length, 0);
  assertApprox(r.score, 1, 0.01);
});

assert('context overload triggers', () => {
  const text = '一次性把整个项目全部做完，不要分步。';
  const r = checkAIMisuse(text);
  const hasOverload = r.issues.some(i => i.type === 'context_overload');
  if (!hasOverload) throw new Error('expected context_overload');
});

assert('error without context triggers', () => {
  const text = '报错了：TypeError: Cannot read property x of undefined';
  const r = checkAIMisuse(text);
  const hasErrorCtx = r.issues.some(i => i.type === 'error_without_context');
  if (!hasErrorCtx) throw new Error('expected error_without_context');
});

assert('error with context does not trigger', () => {
  const text = '执行步骤：运行 node test.js，输入参数 {a:1}，期望返回 {ok:true}，实际报错 TypeError';
  const r = checkAIMisuse(text);
  const hasErrorCtx = r.issues.some(i => i.type === 'error_without_context');
  if (hasErrorCtx) throw new Error('did not expect error_without_context when context present');
});

assert('unverified adoption triggers', () => {
  const text = '直接用你的代码，不用改，照搬就行。';
  const r = checkAIMisuse(text);
  const hasUnverified = r.issues.some(i => i.type === 'unverified_adoption');
  if (!hasUnverified) throw new Error('expected unverified_adoption');
});

assert('repeated fixes triggers with 3+ attempts', () => {
  const text = '再试一次，再改一下，再跑一次看看。';
  const r = checkAIMisuse(text);
  const hasRepeated = r.issues.some(i => i.type === 'repeated_fixes');
  if (!hasRepeated) throw new Error('expected repeated_fixes');
});

assert('repeated fixes does not trigger with 1-2 attempts', () => {
  const text = '再试一次，再改一下。';
  const r = checkAIMisuse(text);
  const hasRepeated = r.issues.some(i => i.type === 'repeated_fixes');
  if (hasRepeated) throw new Error('did not expect repeated_fixes with only 2 attempts');
});

assert('AI scapegoating triggers', () => {
  const text = '你决定吧，你觉得自己看着办。';
  const r = checkAIMisuse(text);
  const hasScapegoat = r.issues.some(i => i.type === 'ai_scapegoating');
  if (!hasScapegoat) throw new Error('expected ai_scapegoat');
});

assert('multiple misuse types can co-exist', () => {
  const text = '一次性把整个项目全部做完。你决定吧。';
  const r = checkAIMisuse(text);
  if (r.issues.length < 2) throw new Error('expected multiple issues, got ' + r.issues.length);
  const types = [...new Set(r.issues.map(i => i.type))];
  if (!types.includes('context_overload') || !types.includes('ai_scapegoating')) {
    throw new Error('expected context_overload + ai_scapegoating');
  }
});

console.log(`\n📊 ai-misuse: ${passed} passed, ${failed} failed, total ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
