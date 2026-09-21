/**
 * Formula Search — 公式搜索引擎（全量公式库版本）
 * 自动加载 formulas/ 目录下所有 JSON，不再只读 formulas.json
 */

const fs = require('../utils/safe-fs');
const path = require('path');

class FormulaSearch {
  constructor(options = {}) {
    this.formulasFile = options.formulasFile || path.join(__dirname, '..', '..', 'formulas', 'formulas.json');
    this.formulasDir = options.formulasDir || path.join(__dirname, '..', '..', 'formulas');
    this.formulas = null; // 懒加载
    this._loadErrors = [];
  }

  _readJsonFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      return data.formulas || [];
    } catch (error) {
      this._loadErrors.push({ file: path.basename(filePath), error: error.message });
      return [];
    }
  }

  loadFormulas() {
    if (this.formulas) return this.formulas;
    const all = [];
    const seen = new Set();
    let files = 0;

    try {
      const entries = fs.readdirSync(this.formulasDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const filePath = path.join(this.formulasDir, entry.name);
        const items = this._readJsonFile(filePath);
        if (!Array.isArray(items)) continue;
        files++;
        for (const item of items) {
          const id = item.id || null;
          if (id && seen.has(id)) continue;
          if (id) seen.add(id);
          all.push(item);
        }
      }
    } catch (error) {
      console.warn('[FormulaSearch] 目录扫描失败，回退单文件:', error.message);
      const items = this._readJsonFile(this.formulasFile);
      for (const item of items) {
        const id = item.id || null;
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        all.push(item);
      }
    }

    this.formulas = all;
    if (this._loadErrors.length) {
      console.warn(`[FormulaSearch] 完成，${files} 个文件，${all.length} 条公式，${this._loadErrors.length} 个文件解析失败`);
    } else {
      console.log(`[FormulaSearch] 完成，${files} 个文件，${all.length} 条公式`);
    }
    return this.formulas;
  }

  _ensureLoaded() {
    if (!this.formulas) this.loadFormulas();
  }

  /**
   * 搜索公式（关键词）
   */
  search(keyword, options = {}) {
    const {
      language = 'both',
      category = null,
      difficulty = null,
      limit = 10
    } = options;

    this._ensureLoaded();
    let results = this.formulas;

    if (keyword) {
      const lowerKeyword = keyword.toLowerCase();
      results = results.filter(formula => {
        const nameMatch =
            (formula.name && formula.name.toLowerCase().includes(lowerKeyword)) ||
            (formula.name_en && formula.name_en.toLowerCase().includes(lowerKeyword));

        const formulaMatch =
            (formula.formula && formula.formula.toLowerCase().includes(lowerKeyword));

        const idMatch =
            (formula.id && formula.id.toLowerCase().includes(lowerKeyword));

        const descMatch =
            (formula.description && formula.description.toLowerCase().includes(lowerKeyword)) ||
            (formula.description_en && formula.description_en.toLowerCase().includes(lowerKeyword));

        const varMatch =
            (formula.variables && Object.values(formula.variables).some(v =>
              (v.name && v.name.toLowerCase().includes(lowerKeyword)) ||
              (v.name_en && v.name_en.toLowerCase().includes(lowerKeyword))
            )) ||
            (formula.constants && Object.values(formula.constants).some(c =>
              (c.name && c.name.toLowerCase().includes(lowerKeyword)) ||
              (c.name_en && c.name_en.toLowerCase().includes(lowerKeyword))
            ));

        const appMatch =
            (formula.applications && formula.applications.some(app =>
              app.toLowerCase().includes(lowerKeyword)
            )) ||
            (formula.examples && formula.examples.some(ex =>
              (ex.problem && ex.problem.toLowerCase().includes(lowerKeyword)) ||
              (ex.solution && ex.solution.toLowerCase().includes(lowerKeyword))
            ));

        return nameMatch || formulaMatch || idMatch || descMatch || varMatch || appMatch;
      });
    }

    if (category) {
      results = results.filter(f =>
        f.category === category ||
        f.subcategory === category ||
        (f.tags && f.tags.includes(category))
      );
    }

    if (difficulty) {
      results = results.filter(f => f.difficulty === difficulty);
    }

    if (limit && limit > 0) {
      results = results.slice(0, limit);
    }

    return {
      success: true,
      matched: true,
      count: results.length,
      results: results.map(f => ({
        id: f.id,
        name: f.name,
        name_en: f.name_en || '',
        formula: f.formula,
        category: f.category,
        subcategory: f.subcategory,
        difficulty: f.difficulty || 'intermediate'
      }))
    };
  }

  /**
   * 获取所有分类
   */
  getCategories() {
    this._ensureLoaded();
    const cats = new Set();
    this.formulas.forEach(f => {
      if (f.category) cats.add(f.category);
      if (f.subcategory) cats.add(`${f.category}/${f.subcategory}`);
    });
    return [...cats].sort();
  }

  /**
   * 根据 ID 获取公式
   */
  getById(id) {
    this._ensureLoaded();
    return this.formulas.find(f => f.id === id) || null;
  }

  /**
   * 根据分类获取公式
   */
  getByCategory(category, limit = 0) {
    this._ensureLoaded();
    let results = this.formulas.filter(f =>
      f.category === category ||
      f.subcategory === category
    );
    if (limit > 0) {
      results = results.slice(0, limit);
    }
    return {
      success: true,
      count: results.length,
      results: results
    };
  }

  /**
   * 获取公式详情
   */
  getDetails(id) {
    const formula = this.getById(id);
    if (!formula) {
      return { error: `公式 ${id} 未找到` };
    }
    return {
      success: true,
      formula: formula
    };
  }
}

module.exports = { FormulaSearch };
