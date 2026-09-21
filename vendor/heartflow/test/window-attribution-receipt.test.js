'use strict';
// window-attribution-receipt 测试 — 对齐 autogen#7888 straddling fixture
module.exports = function ({ test }) {
  const { WindowAttributionReceipt } = require('../src/core/window-attribution-receipt.js');

  test('create receipt: basic fields + digest', () => {
    const r = new WindowAttributionReceipt('/tmp');
    const res = r.create({
      turn_id: 'turn-0x7f3a',
      window_start: 1786528800000,
      window_end: 1786615200000,
      outcome: 'completed',
      effective: 1786528800000,
    });
    if (!res.ok) throw new Error('create failed: ' + JSON.stringify(res));
    if (!res.receipt.digest) throw new Error('digest missing');
    if (res.receipt.effective !== res.receipt.window_start) throw new Error('effective != window_start');
  });

  test('verifyReceipt: valid straddling fixture (kawacukennedy schema)', () => {
    const r = new WindowAttributionReceipt('/tmp');
    const receiptN = {
      turn_id: 'turn-straddle',
      window_start: 1786528800000,
      window_end: 1786615200000,
      outcome: 'completed',
      effective: 1786528800000,
      is_straddling: true,
      straddle: {
        second_window_start: 1786615200000,
        second_window_end: 1786701600000,
        overlap_exposure: true,
      },
    };
    const v = r.verifyReceipt(receiptN);
    if (!v.ok) throw new Error('straddling fixture rejected: ' + JSON.stringify(v.findings));
  });

  test('verifyReceipt: effective != window_start on non-straddling is warn-not-error', () => {
    const r = new WindowAttributionReceipt('/tmp');
    const bad = {
      turn_id: 't1',
      window_start: 100,
      window_end: 200,
      outcome: 'completed',
      effective: 150, // 非 straddling 却归因到别的窗口
      is_straddling: false,
    };
    const v = r.verifyReceipt(bad);
    // 允许 warn 但不得静默通过：ok=false 表示需要人工裁决
    if (v.ok) throw new Error('mis-attribution should not be cleanly valid');
  });

  test('verifyReceipt: digest mismatch detected', () => {
    const r = new WindowAttributionReceipt('/tmp');
    const res = r.create({ turn_id: 't2', window_start: 1, window_end: 2, outcome: 'completed' });
    const receipt = { ...res.receipt };
    receipt.outcome = 'failed'; // tamper
    const v = r.verifyReceipt(receipt);
    if (v.ok) throw new Error('tampered receipt passed');
  });

  test('getStats aggregates outcomes', () => {
    const r = new WindowAttributionReceipt('/tmp');
    r.create({ turn_id: 'a', window_start: 1, window_end: 2, outcome: 'completed' });
    r.create({ turn_id: 'b', window_start: 1, window_end: 2, outcome: 'partial', is_straddling: true, straddle: { second_window_start: 2, second_window_end: 3, overlap_exposure: true } });
    const s = r.getStats();
    if (s.total !== 2 || s.completed !== 1 || s.partial !== 1 || s.straddling !== 1) {
      throw new Error('stats wrong: ' + JSON.stringify(s));
    }
  });
};
