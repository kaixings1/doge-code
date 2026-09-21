'use strict';
const { checkOutput } = require('../src/gate.js');
const { checkPrematureTermination } = require('../src/premature-termination.js');

module.exports = ({ test, assertEqual, assertTrue, assertDefined }) => {
  test('T1 status utterance does not pass checkOutput', () => {
    const r = checkOutput('Let me look into this and get back to you.');
    assertDefined(r);
    const action = r.gate?.action || r.summary?.final_action;
    assertTrue(action !== 'pass', 'status utterance should not pass. action=' + action);
  });

  test('T4 empty done does not pass checkOutput', () => {
    const r = checkOutput('Done. You can refer to the above.');
    assertDefined(r);
    const action = r.gate?.action || r.summary?.final_action;
    assertTrue(action !== 'pass', 'empty done should not pass. action=' + action);
  });

  test('complete technical answer passes checkOutput', () => {
    const r = checkOutput('HeartFlow exposes premature-termination as a pure-rule check outside the generation loop.');
    assertDefined(r);
    assertEqual(r.gate?.action || r.summary?.final_action, 'pass');
  });

  test('checkPrematureTermination detects T1/T2', () => {
    const t1 = checkPrematureTermination('我看看');
    const t2 = checkPrematureTermination('OK.');
    assertTrue(t1.isPremature);
    assertTrue(t2.isPremature);
  });
};
