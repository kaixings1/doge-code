/**
 * formula-module.js — HeartFlow 公式模块
 * 真实接入 FormulaEngine，替换空壳 stub
 * 兼容旧调用：search('string') 和 search({keyword, limit})
 */

const { FormulaEngine } = require('./formula-engine.js');
const path = require('path');

class FormulaModule {
  constructor(opts = {}) {
    this.opts = opts || {};
    const formulasFile = opts.formulasFile || path.join(__dirname, '..', '..', 'formulas', 'formulas.json');
    this.engine = new FormulaEngine({ formulasFile });
    this.engine.init();
  }

  searchFormulas(q, opts) {
    return this.engine.searchFormulas(q, opts);
  }

  search(q, opts) {
    if (!q && !opts) return { success: true, matched: true, count: 0, results: [] };
    if (typeof q === 'string') {
      return this.engine.searchFormulas(q, opts || {});
    }
    if (typeof q === 'object' && q !== null) {
      const keyword = q.keyword || q.q || q.query || '';
      return this.engine.searchFormulas(keyword, q);
    }
    return { success: true, matched: true, count: 0, results: [] };
  }

  calculate(formulaId, params, opts) {
    if (typeof formulaId === 'object' && formulaId !== null) {
      const id = formulaId.formulaId || formulaId.id || formulaId.formula || '';
      const p = formulaId.params || formulaId.values || {};
      const o = formulaId.options || {};
      return this.engine.calculate(id, p, o);
    }
    return this.engine.calculate(formulaId, params || {}, opts || {});
  }

  getStatus() {
    return this.engine.getStatus();
  }

  getCategories() {
    return this.engine.getCategories();
  }

  getByCategory(category, subcategory) {
    return this.engine.getFormulasByCategory(category, subcategory);
  }

  getDetails(id) {
    return this.engine.getFormulaDetails(id);
  }

  healthCheck() {
    const count = this.engine.search.formulas ? this.engine.search.formulas.length : 0;
    return { ok: true, formulaCount: count };
  }

  loadFormulas() {
    return this.engine.search.loadFormulas();
  }
}

module.exports = { FormulaModule };
