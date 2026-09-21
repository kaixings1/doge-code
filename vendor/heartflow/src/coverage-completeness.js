// coverage-completeness.js — 覆盖完整性枚举检测器
// 来源: dev-expert execution-safety.md「覆盖完整性枚举闸门」
// 检测四类覆盖缺口：对称操作/数据形态/调用方/分支空转

function checkCoverageCompleteness(text) {
  if (!text || typeof text !== 'string') return { score: 0, gaps: [], summary: 'empty' };

  const gaps = [];

  // 1. 对称操作缺口
  const symmetricPairs = [
    ['create', 'delete'], ['start', 'stop'], ['open', 'close'],
    ['init', 'destroy'], ['add', 'remove'], ['push', 'pop'],
    ['encode', 'decode'], ['encrypt', 'decrypt'], ['write', 'read'],
    ['acquire', 'release'], ['lock', 'unlock'], ['begin', 'end'],
  ];
  for (const [a, b] of symmetricPairs) {
    const hasA = new RegExp(`\\b${a}\\w*\\b`, 'i').test(text);
    const hasB = new RegExp(`\\b${b}\\w*\\b`, 'i').test(text);
    if (hasA && !hasB) gaps.push({ type: 'symmetric', missing: b, pair: `${a}/${b}`, severity: 0.6 });
    if (!hasA && hasB) gaps.push({ type: 'symmetric', missing: a, pair: `${a}/${b}`, severity: 0.6 });
  }

  // 2. 数据形态覆盖缺口（仅当代码明显在处理输入/变量时才检查）
  const processesData = /\b(param|arg|input|data|value|item|obj|json|body|req|res)\b/i.test(text);
  if (processesData) {
    const dataShapes = ['null', 'undefined', 'empty', 'array', 'object', 'string', 'number', 'boolean', 'NaN', 'Infinity'];
    const missingShapes = dataShapes.filter(m => !new RegExp(`\\b${m}\\b`, 'i').test(text));
    if (missingShapes.length >= 5) {
      gaps.push({ type: 'data_shape', missing: missingShapes, severity: 0.4 });
    }
  }

  // 3. 分支空转（if 后 return 且之后无 else）
  const branchGaps = [];
  const ifReturnPat = /if\s*\([^)]+\)\s*\{[^}]*return[^}]*\}/g;
  let m;
  while ((m = ifReturnPat.exec(text)) !== null) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 80);
    const hasElse = /\}\s*else\s*\{/.test(after) || /^\s*else\s*\{/.test(after);
    if (!hasElse) branchGaps.push(m[0].slice(0, 30));
  }
  if (branchGaps.length > 0) {
    gaps.push({ type: 'branch', missing: 'else', count: branchGaps.length, examples: branchGaps.slice(0, 3), severity: 0.3 });
  }

  // 4. 空 catch 吞异常（已 partly covered by ai-anti-pattern, 这里做补充计数）
  const swallowCatches = text.match(/catch\s*\([^)]*\)\s*\{\s*\}/g) || [];
  if (swallowCatches.length > 2) {
    gaps.push({ type: 'swallow_catch', count: swallowCatches.length, severity: 0.5 });
  }

  const score = Math.min(1, gaps.length * 0.2);
  const summary = gaps.length === 0
    ? '覆盖完整，未发现明显缺口'
    : `发现 ${gaps.length} 类覆盖缺口：${[...new Set(gaps.map(g => g.type))].join('、')}`;

  return { score, gaps: gaps.slice(0, 20), summary };
}

module.exports = { checkCoverageCompleteness };
