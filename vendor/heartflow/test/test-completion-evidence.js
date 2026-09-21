const { checkCompletionEvidence } = require('../src/completion-evidence.js');

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
  if (actual !== expected) {
    throw new Error(`${msg || ''} expected ${expected}, got ${actual}`);
  }
}

function assertApprox(actual, expected, eps, msg) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${msg || ''} expected ~${expected}, got ${actual}`);
  }
}

console.log('\n📋 Completion Evidence\n');

// Test 1: empty input
assert('empty input returns zeros', () => {
  const r = checkCompletionEvidence('');
  assertEqual(r.score, 0);
  assertEqual(r.issues.length, 0);
});

// Test 2: complete delivery with evidence
assert('complete delivery passes', () => {
  const text = '已完成修复。验证：node test/run-all.js 410 passed, 0 failed。commit abc1234def 已推送 origin/main。';
  const r = checkCompletionEvidence(text);
  assertEqual(r.issues.length, 0);
  assertApprox(r.score, 1, 0.01);
});

// Test 3: empty completion claim
assert('empty completion claim triggers', () => {
  const text = '已完成修复，你可以使用了。';
  const r = checkCompletionEvidence(text);
  if (r.issues.length === 0) throw new Error('expected at least one issue');
  const hasEmpty = r.issues.some(i => i.type === 'empty_completion');
  if (!hasEmpty) throw new Error('expected empty_completion issue');
  assertApprox(r.score, 0.3, 0.2);
});

// Test 4: "all passed" without numbers
assert('all passed without numbers triggers', () => {
  const text = 'All tests passed. 确认正常。';
  const r = checkCompletionEvidence(text);
  const hasUnverified = r.issues.some(i => i.type === 'unverified_all_pass');
  if (!hasUnverified) throw new Error('expected unverified_all_pass issue');
});

// Test 5: vague completion
assert('vague completion triggers', () => {
  const text = '可以了，没问题。';
  const r = checkCompletionEvidence(text);
  const hasVague = r.issues.some(i => i.type === 'vague_completion');
  if (!hasVague) throw new Error('expected vague_completion issue');
});

console.log(`\n📊 completion-evidence: ${passed} passed, ${failed} failed, total ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
