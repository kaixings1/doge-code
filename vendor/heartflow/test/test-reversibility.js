const { checkReversibility } = require('../src/reversibility.js');
const assert = require('assert');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

test('empty input returns safe defaults', () => {
  const r = checkReversibility('');
  assert.deepStrictEqual(r, { score: 0, issues: [], summary: 'empty input' });
});

test('irreversible ops without gate are flagged', () => {
  const r = checkReversibility('delete table users; drop table orders;');
  assert.strictEqual(r.issues.length, 2);
  assert.strictEqual(r.issues[0].type, 'irreversible_no_gate');
  assert.strictEqual(r.issues[1].type, 'irreversible_no_gate');
});

test('irreversible ops with backup/rollback are not flagged', () => {
  const r = checkReversibility('delete table users with backup and rollback plan.');
  assert.strictEqual(r.issues.length, 0);
});

test('batch ops without scope or backup are flagged', () => {
  const r = checkReversibility('batch process all records.');
  assert.strictEqual(r.issues.length, 2);
  assert.strictEqual(r.issues[0].type, 'batch_no_scope_or_backup');
  assert.strictEqual(r.issues[1].type, 'batch_no_scope_or_backup');
});

test('production config without warning is flagged', () => {
  const r = checkReversibility('env API_KEY=xxx');
  assert.strictEqual(r.issues.length, 1);
  assert.strictEqual(r.issues[0].type, 'prod_config_no_warning');
});

test('clean plan passes', () => {
  const r = checkReversibility('add index idx_name on users(name);');
  assert.strictEqual(r.issues.length, 0);
  assert.strictEqual(r.score, 1);
});
