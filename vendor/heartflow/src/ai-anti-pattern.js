// ai-anti-pattern.js — 防 AI 通病五戒检测器
// 来源: dev-expert execution-safety.md「防 AI 通病五戒」
// 作为心虫第 49 维判别器接入

const RE_MEANINGLESS_DECL = /(?:let|const|var)\s+(tmp|data|info|result|res|obj|item|val|ret|str|num|arr|map|set|dict|params|args|ctx|cfg|conf|opt)\b/;

function _collect(text, patterns, label) {
  const hits = [];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      for (const raw of m) hits.push({ 戒: label, pattern: raw.slice(0, 40), severity: pat._sev || 0.5, source: String(pat).slice(0, 40) });
    }
  }
  return hits;
}

function checkAICodeAntiPattern(text) {
  if (!text || typeof text !== 'string') return { count: 0, findings: [], score: 0, 戒: [] };

  const findings = [];
  const 戒 = new Set();

  findings.push(..._collect(text, [
    /抽象工厂模式|策略模式|单例模式|观察者模式|适配器模式|装饰器模式|代理模式|门面模式|建造者模式|模板方法模式/i,
    /为了(未来|扩展|兼容|维护).{0,10}(可能|也许|或许|万一|以后)/i,
    /一套完整的.{0,10}(框架|体系|架构|方案|解决方案)/i,
    /通用.{0,5}(组件|模块|服务|框架|接口|工具)/i,
    /(先抽象|先封装|再扩展|预留扩展点|方便以后)/i,
  ].map(p => { p._sev = 0.6; return p; }), '过度工程化'));
  if (findings.some(f => f.戒 === '过度工程化')) 戒.add('过度工程化');

  findings.push(..._collect(text, [
    /if\s*\(\s*(?:false|0|null|undefined)\s*\)/i,
    /\/\/\s*(?:死代码|永远不会执行|unreachable|dead code)/i,
    /\/\/\s*TODO[：:].{0,20}(删除|移除|清理)/i,
    /\/\/\s*保留.{0,10}(仅供|参考|测试)/i,
    /return\s+undefined\s*;?\s*\/\/\s*(?:占位|placeholder)/i,
  ].map(p => { p._sev = 0.6; return p; }), '幽灵代码'));
  if (findings.some(f => f.戒 === '幽灵代码')) 戒.add('幽灵代码');

  findings.push(..._collect(text, [
    /\/\/\s*[加增]1/,
    /\/\/\s*(?:赋值|初始化|声明|定义)/,
    /\/\/\s*返回.{0,10}(结果|值|数据)/,
    /\/\/\s*调用.{0,10}(函数|方法|接口)/,
    /\/\/\s*(?:循环|遍历|迭代).{0,10}(数组|列表|集合)/,
  ].map(p => { p._sev = 0.3; return p; }), '假注释'));
  if (findings.some(f => f.戒 === '假注释')) 戒.add('假注释');

  findings.push(..._collect(text, [
    /catch\s*\([^)]*\)\s*\{\s*\}/,
    /catch\s*\([^)]*\)\s*\{\s*\/\/\s*(?:防御性|ignore|忽略|swallow)/i,
    /catch\s*\([^)]*\)\s*\{\s*console\.(?:log|warn|error)\([^)]*\)\s*;?\s*\}/,
  ].map(p => { p._sev = 0.5; return p; }), '万能try-catch'));
  if (findings.some(f => f.戒 === '万能try-catch')) 戒.add('万能try-catch');

  const meaninglessDecls = [...text.matchAll(new RegExp(RE_MEANINGLESS_DECL.source, RE_MEANINGLESS_DECL.flags + 'g'))].map(m => m[0]);
  if (meaninglessDecls.length >= 3) {
    findings.push({
      戒: '无业务语义命名',
      pattern: meaninglessDecls.slice(0, 5).map(s => s.replace(/^(let|const|var)\s+/, '')).join(', '),
      severity: 0.4,
      source: `${meaninglessDecls.length}处单字母/泛化命名`
    });
    戒.add('无业务语义命名');
  }

  const count = findings.length;
  const score = Math.min(1, count * 0.25);

  return {
    count,
    findings: findings.slice(0, 20),
    score,
    戒: [...戒],
    summary: count > 0
      ? `检测到 ${count} 个AI通病信号，涉及${[...戒].join('、')}`
      : '未检测到明显AI通病信号'
  };
}

module.exports = { checkAICodeAntiPattern };
