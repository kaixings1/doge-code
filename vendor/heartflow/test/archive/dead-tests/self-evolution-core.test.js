// ARCHIVED 2026-09-17 — UNRESOLVED HANG, not a deleted-module case.
// Diagnosis so far:
//   - the module itself loads fine: require('.../self-evolution-core.js') = 27ms
//   - the test hangs >120s inside `await core.learn('self-upgrade test')`
//   - root path ruled out: switching from process.cwd() to an empty mkdtemp dir
//     still hangs, so it is not an unbounded repo scan
//   - module references an arXiv explorer path (rateLimited / lastFetchError /
//     HTTP 429), so a network call without a timeout is the leading suspect
// Next step: bound the arXiv/network call in learn() with a timeout, then move this
// file back to test/. An unrunnable test is not coverage.

const assert = require('assert');
const fs = require('fs');

async function run() {
  const { SelfEvolutionCore } = require('../src/cortex/self-evolution/self-evolution-core.js');
  // 用临时目录而不是 process.cwd()：core 以 rootPath 为扫描根，传仓库根会让 learn()
  // 遍历整个仓库（含 47MB 语料与 node_modules），runner 里表现为超时挂起。
  // 同目录下的 upgrade-engine-self-record.test.js 也用 mkdtempSync，保持一致。
  const os = require('os');
  const path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-sec-'));
  const core = new SelfEvolutionCore(root);

  // Test 1: learn() returns structure
  const learning = await core.learn('self-upgrade test');
  assert.ok(typeof learning.summary === 'string', 'summary should be string');
  assert.ok(learning.weaknesses !== undefined, 'weaknesses should exist');

  // Test 2: weaknesses contains todoCount and untestedCount
  assert.ok(typeof learning.weaknesses.todoCount === 'number', 'todoCount should be number');
  assert.ok(Array.isArray(learning.weaknesses.untestedModules), 'untestedModules should be array');

  // Test 3: arxivGaps behavior (null or skipped when disabled)
  assert.ok(learning.arxivGaps === null || learning.arxivGaps.skipped, 'arxivGaps should be null or skipped');

  console.log('PASS self-evolution-core.test.js (3 cases)');
}
run().catch(e => { console.error('FAIL:', e); process.exit(1); });
