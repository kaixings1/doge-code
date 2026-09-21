// 智能升级引擎 - 重复TODO注释清理验证
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '-', e.message); }
}

const file = path.join(__dirname, '..', 'src', 'cortex', 'smart-upgrade-engine.js');
const content = fs.readFileSync(file, 'utf8');

ok('无重复 _boundedSet TODO 注释块', () => {
  const matches = content.match(/TODO: 超长函数 _boundedSet/g) || [];
  const matches2 = content.match(/TODO: _boundedSet/g) || [];
  const total = matches.length + matches2.length;
  // 不变量是"无重复"（<=1），不是"必须存在"——注释已被合法清理，0 也满足。
  assert.ok(total <= 1, `预期最多1处, 实际 ${total} 处`);
});

ok('TODO 注释数量不超过 1（重复清理的不变量）', () => {
  // 原断言要求该 TODO 注释必须存在，但注释已被合法清理掉，属于快照式过期断言。
  // 本用例真正要守的不变量是"没有重复的 TODO 块"，即数量 <= 1（0 也满足）。
  const n = (content.match(/TODO: [^\n]*_boundedSet/g) || []).length;
  assert.ok(n <= 1, `预期最多1处, 实际 ${n} 处`);
});

ok('引擎仍可加载', () => {
  assert.doesNotThrow(() => require('../src/cortex/smart-upgrade-engine.js'));
});

console.log(`\nsmart-upgrade-cleanup: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
