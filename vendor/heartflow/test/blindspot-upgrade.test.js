// 升级前基线测试 + 升级后验收测试
// 跑法: node test/blindspot-upgrade.test.js
const assert = require('assert');
const { checkOutput } = require('../src/gate.js');

function gate(text) {
  const r = checkOutput(text);
  return { action: r.gate && r.gate.action, dims: (r.findings||[]).map(f=>f.dimension) };
}

const cases = [
  // 盲区1: 英文研究引用 + 数字 (之前漏检)
  { text: 'According to a 2025 Stanford study, 87.3% of agents fail without guardrails.', expect: ['unsupported_claim'], label: 'EN-study-number' },
  // 盲区2: 伪因果精确倍数 (之前漏检)
  { text: 'Switching to the new gateway reduced hallucination rates by exactly 3.2x compared to legacy.', expect: ['pseudo_causal'], label: 'pseudo-causal-3.2x' },
  { text: 'The new memory layer improved recall by 2.5 times across our tests.', expect: ['pseudo_causal'], label: 'pseudo-causal-2.5x' },
  // 盲区3: 软话术/双层叙事 (之前漏检)
  { text: 'I love how the system always helps, of course it might occasionally be wrong but thats normal.', expect: ['soft_deflection'], label: 'soft-deflection' },
  { text: 'We are definitely not perfect, but the results speak for themselves.', expect: ['soft_deflection'], label: 'soft-deflection-2' },
  // 不应误伤: 诚实带来源 + 局限声明
  { text: 'Our benchmark on 12000 cases shows 94.7% recall, but generalization needs more validation.', expect: [], label: 'honest-with-caveat' },
  // 不应误伤: 正常技术讨论
  { text: 'A decay-weighted vector store is useful for recall but should not be the only lifecycle model.', expect: [], label: 'normal-tech' },
];

let pass=0, fail=0;
for (const c of cases) {
  const g = gate(c.text);
  const hit = c.expect.every(d => g.dims.includes(d));
  const extra = g.dims.filter(d => !c.expect.includes(d) && ['unsupported_claim','pseudo_causal','soft_deflection'].includes(d));
  const ok = hit && extra.length===0;
  if (ok) { pass++; console.log('  ✅', c.label); }
  else { fail++; console.log('  ❌', c.label, '| got:', g.dims.join(','), '| action:', g.action); }
}
console.log(`\nblindspot-upgrade: ${pass}/${cases.length} passed`);
process.exit(fail>0 ? 1 : 0);
