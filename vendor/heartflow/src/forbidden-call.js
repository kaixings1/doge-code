// forbidden-call.js — 禁止未确认即委派检测
// 规则：在主 Agent 未先自行确认目标/边界/验收口径前，禁止直接委派子 Agent 做理解类任务

function checkForbiddenCall(text) {
  if (!text || typeof text !== 'string') return { count: 0, hits: [], score: 0, summary: 'empty' };

  const hits = [];
  const patterns = [
    { kind: 'delegate_unknown', re: /delegate_task\s*\(/i, msg: '委派子 Agent 前需先确认目标/边界/验收口径' },
    { kind: 'subagent', re: /subagent\s*\(/i, msg: '子代理调用需显式任务简报（目标/输入/输出/验证）' },
    { kind: 'agent_spawn', re: /agent\s+spawn|spawn\s+agent/i, msg: 'spawn agent 前须有明确验收标准' },
    { kind: 'auto_delegate', re: /auto\s*delegate|auto_delegat/i, msg: '自动委派需包含回退/失败路径' },
  ];

  for (const p of patterns) {
    const m = text.match(p.re);
    if (m) hits.push({ kind: p.kind, match: m[0], message: p.msg });
  }

  const count = hits.length;
  const score = Math.min(1, count * 0.3);
  return {
    count,
    hits,
    score,
    summary: count === 0 ? '未发现禁止委派' : `发现 ${count} 处需人工确认的委派/子代理调用`,
  };
}

module.exports = { checkForbiddenCall };
