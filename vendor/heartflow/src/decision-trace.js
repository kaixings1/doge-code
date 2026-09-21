/**
 * checkDecisionTrace - 决策轨迹验证器
 *
 * Validates that a decision record actually contains enough evidence
 * to be considered a real decision, not just a preference or guess.
 *
 * Required fields:
 * - options (array, >=2)
 * - chosen / selected / decision (the actual choice)
 * - reasoning or rationale (why)
 * - At least one of: risk / feasibility / confidence / consequence
 *
 * Also detects:
 * - D1. No real options (single-opinion disguised as decision)
 * - D2. No reasoning (decision without justification)
 * - D3. All options identical in score (decision engine did not actually discriminate)
 */

function checkDecisionTrace(decision) {
  if (!decision || typeof decision !== 'object') {
    return { score: 0, issues: [], summary: '输入为空或非对象' };
  }

  const issues = [];

  const options = decision.options || decision.alternatives || decision.candidates || [];
  const chosen = decision.chosen || decision.selected || decision.decision || decision.choice || null;
  const reasoning = decision.reasoning || decision.rationale || decision.why || '';
  const risk = decision.risk !== undefined ? decision.risk : null;
  const feasibility = decision.feasibility !== undefined ? decision.feasibility : null;
  const confidence = decision.confidence !== undefined ? decision.confidence : null;
  const consequence = decision.consequence_value || decision.consequence || null;

  // D1: not enough options
  if (!Array.isArray(options) || options.length < 2) {
    issues.push({
      type: 'insufficient_options',
      severity: 0.85,
      detail: `决策仅含 ${Array.isArray(options) ? options.length : 0} 个候选选项，无法构成真实决策`
    });
  }

  // D2: missing choice
  if (chosen === null || chosen === undefined || chosen === '') {
    issues.push({
      type: 'missing_choice',
      severity: 0.8,
      detail: 'decision trace 未明确记录最终选择（chosen / selected / decision 字段缺失）'
    });
  }

  // D3: missing reasoning
  if (!reasoning || reasoning.trim().length < 10) {
    issues.push({
      type: 'missing_reasoning',
      severity: 0.7,
      detail: 'decision trace 缺少可读的推理说明（reasoning / rationale 为空或过短）'
    });
  }

  // D4: all options same score
  if (Array.isArray(options) && options.length >= 2) {
    const scoreKey = Object.keys(options[0] || {}).find(k => /score|value|rating|weight| merit/i.test(k));
    if (scoreKey) {
      const scores = options.map(o => Number(o[scoreKey])).filter(v => !Number.isNaN(v));
      if (scores.length >= 2) {
        const unique = new Set(scores.map(v => Math.round(v * 1000))).size;
        if (unique === 1) {
          issues.push({
            type: 'identical_scores',
            severity: 0.6,
            detail: `所有候选选项的 ${scoreKey} 完全相同（${scores[0]}），决策引擎未真正判别`
          });
        }
      }
    }
  }

  // D5: missing risk/feasibility/confidence/consequence
  const evidenceFields = [risk, feasibility, confidence, consequence];
  if (!evidenceFields.some(v => v !== null && v !== undefined && v !== '')) {
    issues.push({
      type: 'missing_evidence_fields',
      severity: 0.55,
      detail: 'decision trace 缺少风险/可行性/置信度/后果中的至少一项证据字段'
    });
  }

  const score = issues.length === 0 ? 1 : Math.max(0, 1 - issues.reduce((sum, i) => sum + i.severity, 0) / issues.length);

  const summary = issues.length === 0
    ? '决策轨迹完整，包含选项/选择/推理/证据'
    : `决策证据不足：${[...new Set(issues.map(i => i.type))].join('、')}`;

  return { score, issues, summary };
}

module.exports = { checkDecisionTrace };
