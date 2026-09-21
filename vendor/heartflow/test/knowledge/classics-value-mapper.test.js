/**
 * test/knowledge/classics-value-mapper.test.js
 */
const {
  evaluate,
  evaluateRules,
  searchClassicsBatch,
  parseHit,
  matchDomain,
  searchClassics,
  mapToDimensions,
  evaluateWithClassics,
  CLASSICAL_RULES,
  DOMAIN_RULES
} = require('../../src/knowledge/classics-value-mapper');

module.exports = function({ test }) {
  const failures = [];
  const cases = [
    ['matchDomain detects confucian governance', () => {
      const r = matchDomain('为政以德');
      if (!r || r.id !== 'confucian-governance') throw new Error('expected confucian-governance');
    }],
    ['matchDomain detects buddhist suffering', () => {
      const r = matchDomain('苦集灭道');
      if (!r || r.id !== 'buddhist-suffering') throw new Error('expected buddhist-suffering');
    }],
    ['matchDomain returns null for non-classics', () => {
      const r = matchDomain('deploy kubernetes cluster');
      if (r) throw new Error('expected null for non-classics');
    }],
    ['evaluateRules returns structured result with confucian claim', () => {
      const out = evaluateRules('省刑罚，薄税敛，深耕易耨，壮者以暇日修其孝悌忠信。');
      if (!out.classicalRelevant) throw new Error('expected classicalRelevant=true');
      if (!Array.isArray(out.findings)) throw new Error('findings should be array');
    }],
    ['searchClassicsBatch returns hits', () => {
      const out = searchClassicsBatch(['仁政', '孝悌'], '儒藏/四书');
      if (!Array.isArray(out.hits)) throw new Error('hits should be array');
      if (out.keywords.length < 2) throw new Error('keywords length');
    }],
    ['parseHit parses file:line:raw', () => {
      const p = parseHit('/root/.hermes/skills/daizhigev20/儒藏/四书/论语集解义疏.txt:60:子曰');
      if (p.file !== '/root/.hermes/skills/daizhigev20/儒藏/四书/论语集解义疏.txt') throw new Error('file');
      if (p.line !== 60) throw new Error('line');
      if (!p.raw.startsWith('子曰')) throw new Error('raw');
    }],
    ['parseHit tolerates null/number/unparsable', () => {
      if (parseHit(null) !== null) throw new Error('null');
      if (parseHit(123) !== null) throw new Error('number');
      if (!parseHit('no-colon-here').file) throw new Error('unparsable');
    }],
    ['evaluateWithClassics alias works', () => {
      const out = evaluateWithClassics('老吾老以及人之老，幼吾幼以及人之幼。');
      if (!out.classicalRelevant) throw new Error('expected classicalRelevant');
    }],
    ['DOMAIN_RULES covers major subdirs', () => {
      const ids = DOMAIN_RULES.map(r => r.id);
      const required = [
        'confucian-governance','buddhist-suffering','justice-and-fate',
        'confucian-xiaojing','confucian-mengxue','confucian-xiushen',
        'confucian-jingxue','confucian-yuejing','confucian-xiaoxue',
        'buddhist-qianlong','buddhist-jiaxing','buddhist-xuzang','buddhist-cangwai'
      ];
      for (const id of required) { if (!ids.includes(id)) throw new Error(`missing ${id}`); }
    }],
    ['CLASSICAL_RULES count >= 20', () => {
      if (CLASSICAL_RULES.length < 20) throw new Error(`got ${CLASSICAL_RULES.length}`);
    }]
  ];

  for (const [name, fn] of cases) {
    try { fn(); } catch (e) { failures.push(`${name}: ${e.message}`); }
  }
  if (failures.length) {
    console.log('FAILURES:', failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`classics-value-mapper: ${cases.length} cases passed`);
  }
};
