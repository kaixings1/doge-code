#!/usr/bin/env node
/**
 * HeartFlow Skill Router — truthfulness-first edition
 *
 * Only routes to skills that actually exist on disk.
 * Searches: repo skills/, global ~/.hermes/skills/heartflow/, global mark-heartflow-s技能
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');
const SEARCH_ROOTS = [
  path.join(REPO_ROOT, 'skills'),
  path.join(os.homedir(), '.hermes', 'skills', 'heartflow'),
  path.join(os.homedir(), '.hermes', 'skills', 'ai', 'mark-heartflow-skill', 'skills'),
];

function findSkill(skill) {
  for (const base of SEARCH_ROOTS) {
    if (fs.existsSync(path.join(base, skill, 'SKILL.md'))) return path.join(base, skill);
  }
  return null;
}

function exists(skill) {
  return !!findSkill(skill);
}

// Build registry lazily so missing skills don't break routing.
const ROUTES = [
  { intents: ['upgrade','self-upgrade','进化','升级','升级心虫'], skill: 'heartflow-self-upgrade', desc: '自我升级（全局）' },
  { intents: ['upgrade','self-upgrade','进化','升级','升级心虫'], skill: 'heartflow-upgrade-methodology', desc: '升级方法论（仓库）' },
  { intents: ['audit','审计','体检','安全审计'], skill: 'heartflow-audit-fix-workflow', desc: '审计修复（仓库）' },
  { intents: ['audit','审计','体检','安全审计'], skill: 'heartflow-auto-audit-fix', desc: '自动审计修复（全局）' },
  { intents: ['audit','审计','体检','安全审计'], skill: 'heartflow-closed-loop-audit', desc: '闭环审计（全局）' },
  { intents: ['debug','崩溃','启动失败','error','报错','排错'], skill: 'heartflow-debug-workflow', desc: '崩溃诊断与修复' },
  { intents: ['debug','崩溃','启动失败','error','报错','排错'], skill: 'superpowers-systematic-debugging', desc: '系统化调试' },
  { intents: ['memory','记忆','遗忘','记忆库'], skill: 'heartflow-memory-permanence', desc: '记忆系统安装/使用' },
  { intents: ['memory','记忆','遗忘','记忆库'], skill: 'heartflow-memory-ingestion', desc: '记忆写入（全局）' },
  { intents: ['code','代码','重构','架构','模块'], skill: 'heartflow-architecture-tracing', desc: '架构追溯' },
  { intents: ['paper','论文','arXiv','论文驱动'], skill: 'heartflow-paper-wiring', desc: '论文落地接线' },
  { intents: ['benchmark','评测','基准','性能测试'], skill: 'heartflow-benchmark', desc: '能力基准测试' },
  { intents: ['dream','梦境','做梦','潜意识'], skill: 'heartflow-dreaming', desc: '梦境引擎' },
  { intents: ['emotion','情绪','共情','心理'], skill: 'heartflow-emotion-analysis', desc: '情绪分析' },
  { intents: ['community','github','推广','社区'], skill: 'heartflow-community-outreach', desc: 'GitHub社区推广' },
  { intents: ['npm','发布','publish','skillhub'], skill: 'heartflow-npm-publish', desc: 'npm发布' },
  { intents: ['startup','诊断','启动','boot'], skill: 'heartflow-startup-diagnosis', desc: '启动失败诊断' },
  { intents: ['formula','公式','数学','计算'], skill: 'heartflow-formula-wiring', desc: '公式接线' },
  { intents: ['version','版本','统一','冲突'], skill: 'heartflow-version-unify', desc: '版本冲突解决' },
  { intents: ['cron','定时','自动','守护'], skill: 'heartflow-auto-upgrade-cron', desc: '定时自动升级' },
  { intents: ['truth','诚实','自欺','汇报'], skill: 'heartflow-truthfulness', desc: '防自欺/诚实汇报' },
  { intents: ['bridge','桥接','feishu','lark','微信'], skill: 'heartflow-bridge-layer', desc: '飞书/微信桥接' },
  { intents: ['identity','身份','漂移','drifting'], skill: 'heartflow-identity-drift-detect', desc: '身份漂移检测' },
  { intents: ['world-tree','世界树','记忆树','分层记忆'], skill: 'heartflow-world-tree', desc: '世界之树记忆' },
  { intents: ['skill','技能','打磨','发布技能'], skill: 'heartflow-skill-review-upgrade-publish', desc: '技能打磨/发布' },
  { intents: ['help','帮助','列表','skills','有什么'], skill: '__list__', desc: '列出全部技能' },
];

const DEFAULTS = [
  { skill: 'heartflow-knowledge-base', desc: '默认起点：核心知识库（身份/Pattern Cards/7条指令）' },
];

function matchIntents(input) {
  const q = input.toLowerCase().trim();
  return ROUTES.filter(r => r.intents.some(k => q.includes(k)));
}

function pickRoute(input) {
  const candidates = matchIntents(input);
  for (const r of candidates) {
    if (exists(r.skill)) return r;
  }
  return candidates[0] || null;
}

function main() {
  const input = process.argv.slice(2).join(' ');
  if (!input) {
    console.log('HeartFlow Skill Router');
    console.log('Usage: node skills/dispatch.js <intent>');
    console.log('');
    console.log('Quick routes:');
    DEFAULTS.forEach(d => console.log(`  ${d.desc} -> ${d.skill}`));
    console.log('');
    console.log('Or use skill_view(name="<skill>") to load any skill directly.');
    process.exit(0);
  }

  const route = pickRoute(input);
  const target = route ? route.skill : (input.trim() === 'list' ? '__list__' : null);

  if (!route && target !== '__list__') {
    const fallback = matchIntents(input)[0] || null;
    console.log(JSON.stringify({
      matched: false,
      input,
      suggested: fallback ? fallback.skill : null,
      reason: 'no matching skill available in repo skills/, global ~/.hermes/skills/heartflow, or global mark-heartflow-skill skills',
      defaults: DEFAULTS,
      hint: 'Run: node skills/dispatch.js list'
    }));
    process.exit(0);
  }

  if (target === '__list__') {
    const skills = new Set();
    for (const base of SEARCH_ROOTS) {
      if (!fs.existsSync(base)) continue;
      for (const name of fs.readdirSync(base)) {
        if (fs.existsSync(path.join(base, name, 'SKILL.md'))) skills.add(name);
      }
    }
    const sorted = Array.from(skills).sort();
    console.log(JSON.stringify({ matched: true, intent: input, total: sorted.length, skills: sorted }));
    process.exit(0);
  }

  if (!target || !exists(target)) {
    console.log(JSON.stringify({
      matched: false,
      input,
      suggested: target,
      reason: target ? 'skill not found on disk' : 'no matching intent',
      defaults: DEFAULTS,
      hint: 'Run: node skills/dispatch.js list'
    }));
    process.exit(0);
  }

  const skillPath = findSkill(target);
  console.log(JSON.stringify({
    matched: true,
    intent: input,
    route: route.desc,
    skill: target,
    skillPath,
    next: `skill_view(name="${target}")`
  }));
}

main();
