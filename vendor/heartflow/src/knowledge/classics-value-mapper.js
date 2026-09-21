/**
 * src/knowledge/classics-value-mapper.js
 *
 * 思想心虫古典知识接入 v2：
 * 1. 复用 classics-rules.js 的检索/判别/解析能力，不做第二套实现
 * 2. 扩展域覆盖到 daizhigev20 全部可读子目录
 * 3. 提供 evaluateWithClassics(input) 供 pipeline/thought-chain 统一调用
 */

const { evaluateRules, searchClassicsBatch, parseHit, CLASSICAL_RULES, DOMAIN_RULES, matchDomain } = require('./classics-rules');

module.exports = {
  evaluateRules,
  searchClassicsBatch,
  parseHit,
  matchDomain,
  searchClassics: (keyword, scope) => searchClassicsBatch([keyword], scope),
  mapToDimensions: (rule) => rule ? rule.dimensions : [],
  CLASSICAL_RULES,
  DOMAIN_RULES,
  evaluate: evaluateRules,
  evaluateWithClassics: evaluateRules,
};
