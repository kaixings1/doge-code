const { checkDecisionTrace } = require('../src/decision-trace.js');

let passed = 0;
let failed = 0;

function assert(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || ''} expected ${expected}, got ${actual}`);
}
function assertApprox(actual, expected, eps, msg) {
  if (Math.abs(actual - expected) > eps) throw new Error(`${msg || ''} expected ~${expected}, got ${actual}`);
}

console.log('\n📋 Decision Trace\n');

assert('empty input returns low score', () => {
  const r = checkDecisionTrace({});
  if (r.issues.length === 0) throw new Error('expected issues on empty input');
  if (r.score > 0.5) throw new Error('expected low score on empty input, got ' + r.score);
});

assert('complete decision passes', () => {
  const decision = {
    options: [
      { label: 'A', feasibility: 0.9, risk: 0.1, confidence: 0.8, consequence_value: 0.7 },
      { label: 'B', feasibility: 0.6, risk: 0.4, confidence: 0.5, consequence_value: 0.6 }
    ],
    chosen: 'A',
    reasoning: 'Selected A because feasibility is higher and risk is lower.',
    confidence: 0.8,
    risk: 0.1
  };
  const r = checkDecisionTrace(decision);
  assertEqual(r.issues.length, 0);
  assertApprox(r.score, 1, 0.01);
});

assert('missing choice triggers', () => {
  const decision = {
    options: [{ label: 'A' }, { label: 'B' }],
    reasoning: 'Both are viable.'
  };
  const r = checkDecisionTrace(decision);
  const hasChoice = r.issues.some(i => i.type === 'missing_choice');
  if (!hasChoice) throw new Error('expected missing_choice');
});

assert('insufficient options triggers', () => {
  const decision = {
    options: [{ label: 'A' }],
    chosen: 'A',
    reasoning: 'Only one option available.'
  };
  const r = checkDecisionTrace(decision);
  const hasOpt = r.issues.some(i => i.type === 'insufficient_options');
  if (!hasOpt) throw new Error('expected insufficient_options');
});

assert('missing reasoning triggers', () => {
  const decision = {
    options: [{ label: 'A' }, { label: 'B' }],
    chosen: 'A'
  };
  const r = checkDecisionTrace(decision);
  const hasReason = r.issues.some(i => i.type === 'missing_reasoning');
  if (!hasReason) throw new Error('expected missing_reasoning');
});

assert('identical scores triggers', () => {
  const decision = {
    options: [
      { label: 'A', score: 0.8 },
      { label: 'B', score: 0.8 }
    ],
    chosen: 'A',
    reasoning: 'Pick A arbitrarily.'
  };
  const r = checkDecisionTrace(decision);
  const hasIdentical = r.issues.some(i => i.type === 'identical_scores');
  if (!hasIdentical) throw new Error('expected identical_scores');
});

assert('missing evidence fields triggers', () => {
  const decision = {
    options: [{ label: 'A' }, { label: 'B' }],
    chosen: 'A',
    reasoning: 'Reason here.'
  };
  const r = checkDecisionTrace(decision);
  const hasEvidence = r.issues.some(i => i.type === 'missing_evidence_fields');
  if (!hasEvidence) throw new Error('expected missing_evidence_fields');
});

console.log(`\n📊 decision-trace: ${passed} passed, ${failed} failed, total ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
