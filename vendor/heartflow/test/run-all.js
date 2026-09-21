/**
 * test-runner.js — zero-dependency test runner
 *
 * Design notes (2026-09-17):
 *
 * 1. Recursive discovery. This previously used a non-recursive readdirSync, so the
 *    50 tests under test/core/, test/memory/, test/utils/ and others never executed.
 *
 * 2. test/archive/ is skipped. It holds historical tests whose target modules were
 *    deleted; their MODULE_NOT_FOUND is not a regression signal.
 *
 * 3. Every test file runs in its own child process. Requiring ~137 engine-loading
 *    files into the runner process exhausted the heap and got the runner OOM-killed
 *    mid-run, which is why the reported totals used to vary between runs.
 *
 * Usage: node test/run-all.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TEST_DIR = __dirname;
const ROOT = path.join(__dirname, '..');
const CHILD_TIMEOUT = 90000;

let passed = 0;
let failed = 0;
const failures = [];

/** 递归收集测试文件，跳过 test/archive/（历史失效测试，目标模块已删除） */
function collectTestFiles(dir, base = dir) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'archive') continue;
      out.push(...collectTestFiles(full, base));
    } else if (ent.name.endsWith('.test.js') && ent.name !== 'run-all.test.js') {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

/** 在子进程中执行一条命令，解析其 `N 通过, M 失败` 汇总行 */
function runChild(label, cmd, timeout = CHILD_TIMEOUT) {
  console.log(`\n${label}`);
  let out = '';
  try {
    out = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout,
      maxBuffer: 48 * 1024 * 1024,
    });
  } catch (e) {
    out = (e.stdout || '').toString();
    if (!/(\d+) 通过, (\d+) 失败/.test(out)) {
      console.log(`  [异常] ${label.trim()}: ${(e.message || '').split('\n')[0]}`);
      failed++;
      failures.push({ name: label.trim(), error: (e.message || '').split('\n')[0] });
      return;
    }
  }
  const m = out.match(/(\d+) 通过, (\d+) 失败/);
  if (!m) {
    const tail = out.trim().split('\n').slice(-3).join('\n');
    if (tail) console.log(tail);
    return;
  }
  passed += parseInt(m[1], 10);
  failed += parseInt(m[2], 10);
  for (const line of out.split('\n')) {
    const fm = line.match(/^\s*✗\s+(.+?)\s*$/);
    if (fm) failures.push({ name: fm[1], error: `(${label.trim()})` });
  }
  const keep = out.split('\n').filter(l => l.includes('通过') || l.includes('✗') || l.includes('失败'));
  console.log(keep.join('\n') || '  (无输出)');
}

function runSubTest(name, relPath, timeout = CHILD_TIMEOUT) {
  runChild(name, `node ${JSON.stringify(path.join(TEST_DIR, relPath))}`, timeout);
}

/** 执行导出 mount 函数的测试文件（子进程 + 注入 test harness） */
function runMountTest(name, relPath, timeout = CHILD_TIMEOUT) {
  runChild(
    name,
    `node ${JSON.stringify(path.join(TEST_DIR, '_mount.js'))} ${JSON.stringify(path.join(TEST_DIR, relPath))}`,
    timeout
  );
}

/** 以 `node -r` 预加载全局注入的方式执行 jest 风格测试文件 */
function runJestStyleTest(name, relPath, timeout = CHILD_TIMEOUT) {
  runChild(
    name,
    `node -r ${JSON.stringify(path.join(TEST_DIR, '_jest-globals.js'))} ${JSON.stringify(path.join(TEST_DIR, relPath))}`,
    timeout
  );
}

// === MAIN ===
async function runAllTests() {
  console.log('\n=== HeartFlow module tests ===\n');

  // 1-4. 已清理模块，保留占位说明历史
  console.log('CodeWriter / CodeGenerator / HeartLogic / DesireCognition — 模块已清理');

  // 显式列出的核心测试（与历史覆盖保持一致）
  const CORE_TESTS = [
    ['KnowledgeOntology', 'knowledge-ontology.test.js'],
    ['KnowledgeQuery', 'knowledge-query.test.js'],
    ['ClassicsValueMapper', 'knowledge/classics-value-mapper.test.js'],
    ['ClassicsRules', 'knowledge/classics-rules.test.js'],
    ['DualPerspectiveAuditor', 'dual-perspective.test.js'],
    ['SignalAbsorber', 'signal-absorber.test.js'],
    ['AgentBoundaryGuard', 'agent-boundary-guard.test.js'],
    ['MetacognitiveExecutive', 'metacognitive-executive.test.js'],
    ['RecoveredModules', 'recovered-modules.test.js'],
    ['RecoveredModules2', 'recovered-modules-2.test.js'],
    ['KnowledgeGraphAdapter', 'knowledge-graph-adapter.test.js'],
    ['SourceAnnotator', 'source-annotator.test.js'],
    ['SecurityAudit', 'security-audit.test.js'],
    ['IdentityCore', 'identity-core.test.js'],
    ['BigFivePersonality', 'big-five.test.js'],
    ['SelfModel', 'self-model.test.js'],
    ['LogicReasoning', 'logic-reasoning.test.js'],
    ['ReflectionLoop', 'reflection-loop.test.js'],
    ['ModuleRegistry (P4)', 'module-registry.test.js'],
    ['RouteWhitelist (P4)', 'route-whitelist.test.js'],
    ['SafeFS (P4)', 'safe-fs.test.js'],
  ];
  const explicit = new Set();
  for (const [label, rel] of CORE_TESTS) {
    if (!fs.existsSync(path.join(TEST_DIR, rel))) continue;
    explicit.add(rel);
    runSubTest(`  ${label}`, rel);
  }

  // 动态接入其余测试文件（全部子进程隔离）
  console.log('\n=== 动态接入其余测试文件 ===');
  const allTests = collectTestFiles(TEST_DIR);
  for (const rel of allTests) {
    if (explicit.has(rel)) continue;
    if (rel.includes('/')) {
      runSubTest('  · ' + rel, rel);
      continue;
    }
    let src = '';
    try { src = fs.readFileSync(path.join(TEST_DIR, rel), 'utf8'); } catch (e) {}
    const head = src.slice(0, 400);
    if (/module\.exports\s*=\s*function/.test(head)) {
      // 导出 mount 函数：子进程 + 注入 harness
      runMountTest('  + ' + rel, rel);
    } else if (/\bdescribe\s*\(/.test(src) && !/require\(['"][^'"]*mini-expect/.test(src)) {
      // jest/mocha 风格：它自己调 describe/it，靠 -r 注入全局
      runJestStyleTest('  j ' + rel, rel);
    } else {
      runSubTest('  · ' + rel, rel);
    }
  }

  // 汇总
  console.log('\n' + '='.repeat(50));
  console.log(`\n测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 个`);
  if (failures.length > 0) {
    console.log('\n失败的测试:');
    for (const f of failures) console.log(`  - ${f.name} ${f.error}`);
    process.exitCode = 1;
  } else {
    console.log('\n全部通过。');
  }
}

runAllTests().catch(err => {
  console.error('测试运行器错误:', err);
  process.exit(1);
});
