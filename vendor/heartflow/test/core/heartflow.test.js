// 零依赖版本：原先依赖 jest 的 describe/expect 全局，在 Node 下直接
// "ReferenceError: describe is not defined"，属于永远不会通过的僵尸测试。
const assert = require('assert');

const mod = require('../../src/core/heartflow.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

test('模块可加载', () => {
  assert.ok(mod, 'heartflow 模块应可 require');
});

test('导出 HeartFlow 构造器或工厂函数', () => {
  const ctor = mod.HeartFlow || mod.createHeartFlow;
  assert.strictEqual(typeof ctor, 'function');
});

test('实例可启动并自报版本', async () => {
  const hf = mod.createHeartFlow ? mod.createHeartFlow({ silent: true }) : new mod.HeartFlow({ silent: true });
  const s = hf.start();
  if (s && typeof s.then === 'function') return s.then(() => {
    assert.ok(hf.version, '应能读到版本号');
    if (hf.shutdown) hf.shutdown();
  });
  assert.ok(hf.version, '应能读到版本号');
  if (hf.shutdown) hf.shutdown();
});

(async () => {
  await new Promise(r => setTimeout(r, 50));
  console.log(`\n测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 个`);
  if (failed) process.exitCode = 1;
})();
