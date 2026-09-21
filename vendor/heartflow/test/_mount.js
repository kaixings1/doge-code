/**
 * Mount a test file that exports `function ({ test, assertEqual, ... }) {}`
 * and run it in its own process.
 *
 * The runner uses this instead of `require()`-ing such files itself, so that the
 * engine modules and memory graphs each test creates are reclaimed when the child
 * exits. Requiring ~137 engine-loading files into one process previously exhausted
 * the heap and got the runner OOM-killed mid-run — which is why the reported test
 * totals used to vary from run to run.
 *
 * Usage: node test/_mount.js <absolute-path-to-test-file>
 */
'use strict';

const path = require('path');
const H = require('./_harness.js');

const target = process.argv[2];
if (!target) {
  console.log('测试结果: 0 通过, 1 失败, 共 1 个');
  console.log('  ✗ _mount.js: missing target file argument');
  process.exit(1);
}

let mod;
try {
  mod = require(path.resolve(target));
} catch (e) {
  console.log(`  ✗ ${path.basename(target)}: 加载失败 ${e.message}`);
  console.log('测试结果: 0 通过, 1 失败, 共 1 个');
  process.exit(1);
}

try {
  if (typeof mod === 'function') {
    mod(H.harness);
  }
} catch (e) {
  console.log(`  ✗ ${path.basename(target)}: 挂载异常 ${e.message}`);
  console.log('测试结果: 0 通过, 1 失败, 共 1 个');
  process.exit(1);
}

H.summarize().then(() => process.exit(process.exitCode || 0));
