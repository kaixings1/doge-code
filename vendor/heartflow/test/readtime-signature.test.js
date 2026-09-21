'use strict';
// read-time 签名验证测试 — #7707 讨论驱动 (2026-08-14)
module.exports = function ({ test }) {
  const crypto = require('crypto');
  const { MeaningfulMemory } = require('../src/memory/meaningful-memory.js');
  const { VerifierGrant } = require('../src/core/verifier-grant.js');

  test('search results carry verification status', () => {
    const mem = new MeaningfulMemory({ dataDir: '/tmp/sigtest-' + Date.now() });
    mem.store({ content: 'HeartFlow signature test alpha', layer: 'learned', importance: 10 });
    const results = mem.searchByKeywords('signature');
    if (!results.length) throw new Error('no results');
    // 新记录应有签名; 验证状态字段存在
    if (!('verified' in results[0])) throw new Error('verified field missing: ' + JSON.stringify(results[0]));
    if (!results[0].verification) throw new Error('verification reason missing');
    console.log('  verified:', results[0].verified, results[0].verification);
  });

  test('tampered memory is flagged on read', () => {
    const mem = new MeaningfulMemory({ dataDir: '/tmp/sigtest-' + Date.now() });
    const res = mem.store({ content: 'Original trusted statement', layer: 'core', importance: 15 });
    // 找到刚存的记录并篡改内容（签名不再匹配）
    const found = mem.searchByKeywords('trusted');
    if (!found.length) throw new Error('original not found');
    const id = found[0].id;
    // 直接改 layers 里的内容，绕过 store() 重新签名
    const rec = mem.layers.core.find(m => m.id === id);
    if (!rec) throw new Error('record not found by id');
    rec.content = 'Maliciously modified statement';
    // 重新检索应标记 tampered
    const results = mem.searchByKeywords('Maliciously');
    if (!results.length) throw new Error('modified not found');
    if (results[0].verification !== 'tampered') {
      throw new Error('tampered not detected, verification=' + results[0].verification + ' verified=' + results[0].verified);
    }
    if (!results[0].tampered) throw new Error('tampered flag missing');
  });

  test('getStats reports tamperedDetected', () => {
    const mem = new MeaningfulMemory({ dataDir: '/tmp/sigtest-' + Date.now() });
    mem.store({ content: 'Clean record one', layer: 'learned', importance: 8 });
    const r = mem.searchByKeywords('Clean');
    if (!r.length) throw new Error('clean not found');
    const stats = mem.getStats();
    if (typeof stats.tamperedDetected !== 'number') throw new Error('tamperedDetected missing in stats');
  });
};
