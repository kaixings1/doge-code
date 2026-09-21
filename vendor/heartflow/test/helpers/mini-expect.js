/**
 * Minimal zero-dependency assertion library.
 *
 * Several test files under test/ were written against mocha + chai, others against
 * jest. The repo deliberately ships zero runtime and zero dev dependencies, so those
 * files crashed with "describe is not defined" / "Cannot find module 'chai'" instead
 * of running. This module provides the subset of both APIs they actually use, so the
 * assertions execute for real.
 *
 * Supported:
 *   chai  — expect(x).to.equal / be.a / be.oneOf / be.true / include / have.property
 *   jest  — expect(x).toBe / toEqual / toContain / toThrow / toHaveProperty / not.*
 *
 * Usage directly:
 *   const { describe, it, expect, run } = require('./helpers/mini-expect.js');
 * Usage as globals for an unmodified jest-style file:
 *   node -r test/_jest-globals.js test/some.test.js
 */
'use strict';

const _suites = [];
let _current = null;

function describe(name, fn) {
  const prev = _current;
  const parentHooks = prev ? { beforeEach: prev.beforeEach, afterEach: prev.afterEach } : { beforeEach: [], afterEach: [] };
  _current = {
    name: prev ? `${prev.name} › ${name}` : name,
    tests: [],
    beforeEach: [...parentHooks.beforeEach],
    afterEach: [...parentHooks.afterEach],
  };
  _suites.push(_current);
  try {
    fn();
  } finally {
    _current = prev;
  }
}

function it(name, fn) {
  if (_current) _current.tests.push({ name, fn });
}

// beforeEach/afterEach 必须真的执行。此前在 test/_jest-globals.js 里把它们 stub 成
// 空函数，导致所有用 beforeEach 构造被测对象的测试拿到 undefined —— decision-verifier
// 的 10 项失败和 engine-reasoner 的 1 项失败全部由此而来，并非被测代码有问题。
function beforeEach(fn) { if (_current) _current.beforeEach.push(fn); }
function afterEach(fn)  { if (_current) _current.afterEach.push(fn); }
function beforeAll(fn)  { if (_current) _current.beforeEach.unshift(fn); }
function afterAll(fn)   { if (_current) _current.afterEach.push(fn); }

function _fail(msg) {
  const e = new Error(msg);
  e.isAssertion = true;
  throw e;
}

function expect(actual, negated = false) {
  const check = (ok, msg) => {
    const pass = negated ? !ok : ok;
    if (!pass) _fail((negated ? 'not: ' : '') + msg);
  };

  const api = {
    to: null, be: null, been: null, is: null, that: null, which: null,
    and: null, has: null, have: null, with: null, at: null, of: null,
  };
  for (const k of Object.keys(api)) api[k] = api;
  // `not` 必须惰性求值：写成 `api.not = expect(actual, !negated)` 会让每次
  // 构造 api 都再构造一个 api，无限递归 -> 所有断言抛 RangeError。
  Object.defineProperty(api, 'not', {
    get: () => expect(actual, !negated),
    configurable: true,
  });

  // ── jest 词表 ────────────────────────────────────────────
  api.toBe = (e) => check(actual === e, `expected ${JSON.stringify(e)}, got ${JSON.stringify(actual)}`);
  api.toEqual = api.eql = api.deep = (e) => {
    const a = JSON.stringify(actual); const b = JSON.stringify(e);
    check(a === b, `expected deep-equal ${b}, got ${a}`);
  };
  api.toBeDefined = () => check(actual !== undefined, 'expected value to be defined');
  api.toBeUndefined = () => check(actual === undefined, `expected undefined, got ${JSON.stringify(actual)}`);
  api.toBeNull = () => check(actual === null, `expected null, got ${JSON.stringify(actual)}`);
  api.toBeTruthy = () => check(!!actual, `expected truthy, got ${JSON.stringify(actual)}`);
  api.toBeFalsy = () => check(!actual, `expected falsy, got ${JSON.stringify(actual)}`);
  api.toBeGreaterThan = (n) => check(actual > n, `expected ${actual} > ${n}`);
  api.toBeGreaterThanOrEqual = (n) => check(actual >= n, `expected ${actual} >= ${n}`);
  api.toBeLessThan = (n) => check(actual < n, `expected ${actual} < ${n}`);
  api.toBeLessThanOrEqual = (n) => check(actual <= n, `expected ${actual} <= ${n}`);
  api.toContain = (n) => {
    const ok = typeof actual === 'string' ? actual.includes(n)
      : Array.isArray(actual) ? actual.includes(n) : false;
    check(ok, `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(n)}`);
  };
  api.toThrow = (maybe) => {
    let threw = false; let err = null;
    try { actual(); } catch (e) { threw = true; err = e; }
    if (threw && maybe instanceof RegExp) threw = maybe.test(err.message);
    else if (threw && typeof maybe === 'string') threw = err.message.includes(maybe);
    check(threw, 'expected function to throw');
  };
  api.toHaveProperty = (key, ...rest) => {
    const ok = actual != null && key in Object(actual);
    check(ok, `expected object to have property '${key}'`);
    if (ok && rest.length > 0) {
      check(actual[key] === rest[0],
        `expected property '${key}' to equal ${JSON.stringify(rest[0])}, got ${JSON.stringify(actual[key])}`);
    }
    return expect(actual == null ? undefined : actual[key], negated);
  };
  api.toMatch = (re) => check(new RegExp(re).test(String(actual)), `expected ${JSON.stringify(actual)} to match ${re}`);
  api.toHaveLength = (n) => check(actual != null && actual.length === n,
    `expected length ${n}, got ${actual && actual.length}`);
  api.toBeInstanceOf = (C) => check(actual instanceof C, `expected instance of ${C && C.name}`);
  api.toBeNaN = () => check(Number.isNaN(actual), `expected NaN, got ${JSON.stringify(actual)}`);

  // ── chai 词表 ────────────────────────────────────────────
  api.equal = api.equals = (e) => check(actual === e,
    `expected ${JSON.stringify(e)}, got ${JSON.stringify(actual)}`);
  api.oneOf = (arr) => check(Array.isArray(arr) && arr.includes(actual),
    `expected one of ${JSON.stringify(arr)}, got ${JSON.stringify(actual)}`);
  api.include = api.includes = api.contains = (n) => {
    const ok = typeof actual === 'string' ? actual.includes(n)
      : Array.isArray(actual) ? actual.includes(n) : false;
    check(ok, `expected ${JSON.stringify(actual)} to include ${JSON.stringify(n)}`);
  };
  api.true = () => check(actual === true, `expected true, got ${JSON.stringify(actual)}`);
  api.false = () => check(actual === false, `expected false, got ${JSON.stringify(actual)}`);
  api.ok = () => check(!!actual, `expected truthy, got ${JSON.stringify(actual)}`);
  api.null = () => check(actual === null, `expected null, got ${JSON.stringify(actual)}`);
  api.undefined = () => check(actual === undefined, `expected undefined, got ${JSON.stringify(actual)}`);
  api.exist = () => check(actual !== null && actual !== undefined, 'expected value to exist');
  api.empty = () => check(actual != null && actual.length === 0, 'expected empty');
  api.a = api.an = (type) => {
    const t = String(type).toLowerCase();
    const got = Array.isArray(actual) ? 'array' : typeof actual;
    check(got === t, `expected type ${type}, got ${got}`);
  };
  api.property = api.ownProperty = (key, ...rest) => api.toHaveProperty(key, ...rest);
  api.above = api.greaterThan = (n) => check(actual > n, `expected ${actual} > ${n}`);
  api.below = api.lessThan = (n) => check(actual < n, `expected ${actual} < ${n}`);
  api.least = api.gte = (n) => check(actual >= n, `expected ${actual} >= ${n}`);
  api.most = api.lte = (n) => check(actual <= n, `expected ${actual} <= ${n}`);
  api.lengthOf = api.toHaveLength;
  api.throw = api.throws = (x) => api.toThrow(x);
  api.keys = (keys) => {
    const want = Array.isArray(keys) ? keys : Object.keys(keys || {});
    const have = Object.keys(Object(actual));
    const missing = want.filter(k => !have.includes(k));
    check(missing.length === 0, `expected keys ${JSON.stringify(want)}, missing ${JSON.stringify(missing)}`);
  };

  // chai 链式写法：expect(x).to.have.length.greaterThan(0)
  Object.defineProperty(api, 'length', {
    get: () => expect(actual == null ? undefined : actual.length, negated),
    configurable: true,
  });

  return api;
}

/** 运行全部已注册套件并打印与 test/run-all.js 兼容的汇总行 */
function run({ silent = false } = {}) {
  let passed = 0;
  const failures = [];
  for (const suite of _suites) {
    for (const t of suite.tests) {
      try {
        for (const h of (suite.beforeEach || [])) h();
        t.fn();
        passed++;
      } catch (e) {
        failures.push({ name: `${suite.name} › ${t.name}`, error: e.message });
      } finally {
        for (const h of (suite.afterEach || [])) { try { h(); } catch (e) { /* 清理失败不影响判定 */ } }
      }
    }
  }
  if (!silent) {
    for (const f of failures) {
      console.log(`  ✗ ${f.name}`);
      console.log(`    ${f.error}`);
    }
    console.log(`\n测试结果: ${passed} 通过, ${failures.length} 失败, 共 ${passed + failures.length} 个`);
  }
  if (failures.length) process.exitCode = 1;
  return { passed, failed: failures.length, failures };
}

module.exports = { describe, it, test: it, expect, run, beforeEach, afterEach, beforeAll, afterAll, _suites };
