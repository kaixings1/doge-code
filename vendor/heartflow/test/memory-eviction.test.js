'use strict';
const { MeaningfulMemory } = require('../src/memory/meaningful-memory.js');

module.exports = ({ test, assertEqual, assertTrue, assertDefined }) => {
  let mm;
  test('store + searchByKeywords round-trip', () => {
    mm = new MeaningfulMemory({ rootPath: process.cwd() });
    mm.store({ content: 'HeartFlow memory trust tag test', layer: 'learned', metadata: { source: 'unit-test' } });
    const r = mm.searchByKeywords(['HeartFlow', 'trust'], 5);
    assertTrue(r.length >= 1, 'expect >=1 result');
    assertDefined(r[0].verified);
    assertDefined(r[0].verification);
  });

  test('searchByEmotion returns verified field', () => {
    const r = mm.searchByEmotion({ pleasure: 0.5, arousal: 0.5, dominance: 0.5 }, 5);
    assertTrue(Array.isArray(r), 'expect array');
    if (r.length > 0) {
      assertDefined(r[0].verified);
      assertDefined(r[0].verification);
    }
  });

  test('searchByAssociation returns verified field', () => {
    const mem = mm.layers.learned[0];
    if (!mem) return;
    mm._addRelationship({ sourceId: mem.id, targetId: mem.id, type: 'unit-test' });
    const r = mm.searchByAssociation(mem.id, 2, 5);
    assertTrue(Array.isArray(r), 'expect array');
    if (r.length > 0) {
      assertDefined(r[0].verified);
      assertDefined(r[0].verification);
    }
  });

  test('cleanup evicts expired ephemeral memories', () => {
    const now = Date.now();
    mm.store({ content: 'old ephemeral', layer: 'ephemeral', timestamp: now - 31 * 24 * 60 * 60 * 1000, metadata: {} });
    mm.store({ content: 'fresh ephemeral', layer: 'ephemeral', timestamp: now, metadata: {} });
    const out = mm.cleanup(30 * 24 * 60 * 60 * 1000);
    assertDefined(out.removed);
    assertTrue(out.removed >= 1, 'should remove at least the old ephemeral');
  });
};
