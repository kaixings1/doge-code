const { evaluateRules } = require('./src/knowledge/classics-value-mapper.js');
const samples = [
  ['liji-yueji', '乐者，天地之和也；礼者，天地之序也。'],
  ['zhuangzi-qiushu', '井蛙不可以语于海者，拘于虚也；夏虫不可以语于冰者，笃于时也。'],
  ['diamond-sutra', '应无所住而生其心。']
];
for (const [id, s] of samples) {
  const r = evaluateRules(s);
  console.log(id, '=>', JSON.stringify({
    domain: r.domain,
    classicalRelevant: r.classicalRelevant,
    ruleCount: r.ruleCount,
    findings: r.findings.map(f => ({ id: f.ruleId, reason: f.reason, signal: f.signal, wisdom: f.wisdom_dimension }))
  }));
}
