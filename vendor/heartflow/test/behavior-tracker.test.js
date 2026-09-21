const { behaviorTracker } = require('../src/behavior-tracker.js');
const assert = require('assert');

async function testBehaviorTracker() {
  const goal = behaviorTracker.createGoal({ name: 'smoke goal', targetDays: 5 }).goal;

  behaviorTracker.record(goal.id, { type: 'success' });
  behaviorTracker.record(goal.id, { type: 'failure' });

  const progress = behaviorTracker.getProgress(goal.id);
  assert(progress.totalRecords >= 2, 'expected >=2 records');
  assert(progress.successRate === 50, `expected successRate 50, got ${progress.successRate}`);

  console.log('BehaviorTracker smoke test passed');
}

testBehaviorTracker().catch(err => {
  console.error('BehaviorTracker smoke test FAILED:', err);
  process.exitCode = 1;
});
