// plan-gate.js — 轻量计划门禁（来自 dev-expert Step2）
// HeartFlow 在进入复杂任务前自动校验计划是否含完整校验/回滚/安全项

function checkPlanGate(plan) {
  if (!plan || typeof plan !== 'object') return { pass: false, missing: ['plan object required'], score: 0 };

  const missing = [];
  const checks = {
    steps: Array.isArray(plan.steps) && plan.steps.length > 0,
    verify: plan.steps?.every((s, i) => s.verify || s.exit || s.done),
    rollback: plan.steps?.every((s) => s.rollback || s.done === 'no-op'),
    security: plan.steps?.every((s) => s.security || s.security === 'N/A'),
    batch: !plan.batch || (typeof plan.batch === 'object' && (plan.batch.checkpoint || plan.batch.strategy)),
  };

  for (const [k, ok] of Object.entries(checks)) {
    if (!ok) missing.push(k);
  }

  const score = Object.values(checks).filter(Boolean).length / Object.keys(checks).length;
  return {
    pass: missing.length === 0,
    missing,
    score,
    summary: missing.length === 0 ? 'PLAN-GATE 通过' : `PLAN-GATE 未通过：缺少 ${missing.join('、')}`,
  };
}

module.exports = { checkPlanGate };
