// test-plan-gate.js — plan-gate 测试

const { checkPlanGate } = require('../src/plan-gate.js');

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
function assertTrue(value, msg) { if (!value) throw new Error(`${msg || ''} 期望 truthy，实际 ${value}`); }
function assertEq(actual, expected, msg) { if (actual !== expected) throw new Error(`${msg || ''} 期望 ${expected}，实际 ${actual}`); }

test('empty input', () => {
  const r = checkPlanGate(null);
  assertEq(r.pass, false);
  assertTrue(r.missing.includes('plan object required'));
});

test('minimal valid plan passes', () => {
  const r = checkPlanGate({
    steps: [
      { verify: 'cmd', rollback: '.bak', security: 'N/A', done: 'ok' },
    ],
  });
  assertEq(r.pass, true);
  assertEq(r.score, 1);
});

test('missing verify/exit/down fails', () => {
  const r = checkPlanGate({
    steps: [
      { verify: 'cmd', rollback: '.bak', security: 'N/A' },
      { rollback: '.bak', security: 'N/A' },
    ],
  });
  assertEq(r.pass, false);
  assertTrue(r.missing.includes('verify'));
});

test('missing security fails unless explicitly N/A', () => {
  const r = checkPlanGate({
    steps: [
      { verify: 'cmd', rollback: '.bak', security: 'N/A' },
      { verify: 'cmd', rollback: '.bak' },
    ],
  });
  assertEq(r.pass, false);
  assertTrue(r.missing.includes('security'));
});

test('batch checkpoint required when batch present', () => {
  const r = checkPlanGate({
    batch: {},
    steps: [
      { verify: 'cmd', rollback: '.bak', security: 'N/A', done: 'ok' },
    ],
  });
  assertEq(r.pass, false);
  assertTrue(r.missing.includes('batch'));
});
