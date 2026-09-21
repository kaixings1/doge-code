/**
 * Preload that installs describe/it/expect as globals for jest-style test files.
 *
 * About 22 files under test/ were written for jest (expect(x).toBe(...)) but the repo
 * ships no devDependencies, so they all died with "describe is not defined" and were
 * silently skipped by the old runner. Loading this file with `node -r` gives them the
 * globals they expect, and the summary is printed when the process exits — so the
 * files run unmodified.
 *
 * Usage: node -r test/_jest-globals.js test/some-jest-style.test.js
 */
'use strict';

const M = require('./helpers/mini-expect.js');

global.describe = M.describe;
global.it = M.it;
global.test = M.it;
global.expect = M.expect;
// 必须是真实实现：stub 成空函数会让所有依赖 beforeEach 构造被测对象的测试
// 拿到 undefined（decision-verifier / engine-reasoner 的失败根因）。
global.beforeEach = M.beforeEach;
global.afterEach = M.afterEach;
global.beforeAll = M.beforeAll;
global.afterAll = M.afterAll;

let _printed = false;
process.on('exit', () => {
  if (_printed) return;
  _printed = true;
  M.run();
});
