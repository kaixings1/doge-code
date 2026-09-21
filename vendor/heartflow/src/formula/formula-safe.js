/**
 * formula-safe.js — HeartFlow 公式库安全包装器
 *
 * 原则：
 *  1. 只替换真正有增益的位置
 *  2. 公式库失败时静默回退到原计算
 *  3. 优先走 formula-bridge 已有实现，不依赖 formula-calculator 的符号解析
 */

const { getCognitiveBridge } = require('./cognitive-bridge.js');

class FormulaSafe {
  constructor() {
    this._bridge = getCognitiveBridge();
  }

  _safe(fnName, fallback) {
    try {
      const fn = this._bridge && this._bridge[fnName];
      if (typeof fn === 'function') {
        const result = fn.apply(this, Array.prototype.slice.call(arguments, 2));
        if (typeof result === 'number' && isFinite(result)) return result;
      }
    } catch (_) {
      // 公式库不可用或该公式暂时不可算，回退
    }
    return typeof fallback === 'function' ? fallback() : fallback;
  }

  // ─── 认知 / 决策公式 ─────────────────────────────────────────────────────────

  shannonEntropy(probabilities, fallback) {
    return this._safe('shannonEntropy', fallback, probabilities);
  }

  expectedUtility(outcomes, fallback) {
    return this._safe('expectedUtility', fallback, outcomes);
  }

  bayesUpdate(pBgivenA, pA, pB, fallback) {
    return this._safe('bayesUpdate', fallback, pBgivenA, pA, pB);
  }

  bayesFactor(pEgivenH1, pEgivenH0, fallback) {
    return this._safe('bayesFactor', fallback, pEgivenH1, pEgivenH0);
  }

  ddmDecisionTime(x0, t0, a, z, s, fallback) {
    return this._safe('ddmDecisionTime', fallback, x0, t0, a, z, s);
  }

  ddmErrorRate(x0, t0, a, z, s, fallback) {
    return this._safe('ddmErrorRate', fallback, x0, t0, a, z, s);
  }

  sMeasure(a, b, fallback) {
    return this._safe('sMeasure', fallback, a, b);
  }

  // ─── 记忆 / 学习公式 ─────────────────────────────────────────────────────────

  ebbinghausRetention(t, S, fallback) {
    return this._safe('ebbinghausRetention', () => fallback(), t || 0, S || 1);
  }

  // ─── 决策/学习/认知公式 ─────────────────────────────────────────────────────────

  rescorlaWagner(alpha, beta, lambda, sumV, fallback) {
    return this._safe('rescorlaWagner', fallback, alpha, beta, lambda, sumV);
  }

  stdpUpdate(deltaT, params, fallback) {
    return this._safe('stdpUpdate', fallback, deltaT, params?.aPlus, params?.aMinus, params?.tauPlus, params?.tauMinus, params?.currentWeight);
  }

  hickLaw(n, a, b, fallback) {
    return this._safe('hickLaw', fallback, n, a, b);
  }

  fittsLaw(distance, width, a, b, fallback) {
    return this._safe('fittsLaw', fallback, distance, width, a, b);
  }

  weberFechner(intensity, k, i0, fallback) {
    return this._safe('weberFechner', fallback, intensity, k, i0);
  }

  qUpdate(oldQ, reward, maxNextQ, alpha, gamma, fallback) {
    return this._safe('qUpdate', fallback, oldQ, reward, maxNextQ, alpha, gamma);
  }

  ebbinghausRetention(t, S, fallback) {
    return this._safe('ebbinghausRetention', () => fallback(), t || 0, S || 1);
  }

  // ─── 逻辑替换入口 ────────────────────────────────────────────────────────────

  /**
   * 统一替换入口：按公式ID分发到 bridge 方法
   * @param {string} formulaId
   * @param {Array} args
   * @param {*} fallback
   */
  compute(formulaId, args, fallback) {
    const map = {
      shannon_entropy: (a, fb) => this.shannonEntropy(a, fb),
      expected_utility: (a, fb) => this.expectedUtility(a, fb),
      bayesian_updating: (a, fb) => this.bayesUpdate(a[0], a[1], a[2], fb),
      bayes_factor: (a, fb) => this.bayesFactor(a[0], a[1], fb),
      ddm_decision_time: (a, fb) => this.ddmDecisionTime(...a, fb),
      ddm_error_rate: (a, fb) => this.ddmErrorRate(...a, fb),
      s_measure: (a, fb) => this.sMeasure(a[0], a[1], fb),
      ebbinghaus_forgetting: (a, fb) => this.ebbinghausRetention(a[0], a[1], fb),
    };
    const fn = map[formulaId];
    if (!fn) return typeof fallback === 'function' ? fallback() : fallback;
    return fn(args, fallback);
  }
}

let _instance = null;
function getFormulaSafe() {
  if (!_instance) _instance = new FormulaSafe();
  return _instance;
}

module.exports = { FormulaSafe, getFormulaSafe };
