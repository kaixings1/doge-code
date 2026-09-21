// architecture-consistency.js — 架构一致性检测器
// 来源: dev-expert execution-safety.md「架构一致性铁律」

function checkArchitectureConsistency(text) {
  if (!text || typeof text !== 'string') return { score: 0, issues: [], summary: 'empty' };

  const issues = [];

  // 1. 函数名/行为错位：名字含 xxx 但体内无对应逻辑
  const checks = [
    { name: 'validate', re: /(check|verify|valid|invalid|schema|format|return\s+(true|false))/i },
    { name: 'parse', re: /(JSON\.parse|split|token|syntax)/i },
    { name: 'sanitize', re: /(trim|replace|escape|strip|clean|encode)/i },
    { name: 'transform', re: /(map|reduce|convert|translate)/i },
    { name: 'handle', re: /(switch|case|dispatch|route)/i },
    { name: 'calculate', re: /(Math\.|compute|formula|eval|sum|avg)/i },
    { name: 'log', re: /(console\.|writeFile|append)/i },
    { name: 'retry', re: /(attempt|backoff|delay|retry|重试|退避)/i },
  ];
  for (const c of checks) {
    const decl = text.match(new RegExp('(?:function|const|let|var|async)\\s+' + c.name + '\\s*\\(', 'i'));
    if (!decl) continue;
    const bodyStart = text.indexOf('{', decl.index);
    if (bodyStart < 0) continue;
    const brace = matchBraces(text, bodyStart);
    const body = brace ? text.slice(bodyStart, brace.end + 1) : '';
    if (!c.re.test(body)) issues.push({ type: 'naming_mismatch', name: c.name, severity: 0.7 });
  }

  // 2. 导出缺失：有 module.exports 但未包含已定义的主要函数
  const defs = [...text.matchAll(/(?:function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g)].map(m => m[1]);
  const exported = extractExports(text);
  if (defs.length > 3 && exported.size > 0) {
    const missing = defs.filter(f => !f.startsWith('_') && f[0] === f[0].toLowerCase() && !exported.has(f));
    if (missing.length) issues.push({ type: 'missing_export', missing: missing.slice(0, 5), severity: 0.5 });
  }

  // 3. 错误处理模式不一致：有的 throw 有的 callback(err)
  const throws = (text.match(/throw\s+new\s+Error/g) || []).length;
  const callbacks = (text.match(/callback\s*\(\s*(?:err|error)/g) || []).length;
  if (throws > 0 && callbacks > 0) issues.push({ type: 'error_style_mixed', throwCount: throws, callbackCount: callbacks, severity: 0.4 });

  const score = Math.min(1, issues.length * 0.3);
  const summary = issues.length === 0 ? '架构一致，未发现明显错位' : `发现 ${issues.length} 类一致性问题：${[...new Set(issues.map(i => i.type))].join('、')}`;

  return { score, issues: issues.slice(0, 20), summary };
}

function extractExports(text) {
  const names = new Set();
  const keywords = new Set(['function','const','let','var','if','else','return','throw','new','try','catch','for','while','switch','case','break','continue','typeof','instanceof','void','delete','this','true','false','null','undefined','NaN','Infinity','module','exports','async','await','yield','of','in','static','get','set','class','extends','super','import','export','from','default','as','require']);
  for (const m of [...text.matchAll(/module\.exports\s*=\s*\{/g)]) {
    const start = m.index + m[0].indexOf('{');
    const brace = matchBraces(text, start);
    if (!brace) continue;
    const body = text.slice(start + 1, brace.end);
    for (const id of [...body.matchAll(/([a-zA-Z_$][a-zA-Z0-9_$]*)/g)]) {
      const name = id[1];
      if (!keywords.has(name)) names.add(name);
    }
  }
  return names;
}

function matchBraces(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return { end: i }; }
  }
  return null;
}

module.exports = { checkArchitectureConsistency };
