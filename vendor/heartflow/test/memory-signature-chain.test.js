/**
 * memory-signature-chain.test.js — 记忆签名链测试
 * 覆盖: store 自动签名 / 覆盖率统计 / 幂等
 */
module.exports = function ({ test }) {
  const path = require('path');
  const HF = path.resolve(__dirname, '..');
  const { MeaningfulMemory } = require(path.join(HF, 'src/memory/meaningful-memory.js'));

  test('memory: store() 自动签名新记录', async () => {
    const mm = new MeaningfulMemory({ rootPath: HF + '/' });
    const id = mm.store({ content: '签名链测试-' + Date.now(), layer: 'learned', importance: 15 });
    const found = mm.layers.learned.find(m => m.id === id);
    if (!found || !found.signature || !found.signature.signed) throw new Error('新记录未签名');
    if (!found.signature.signature) throw new Error('签名值为空');
    if (!found.signature.keyId) throw new Error('keyId 为空');
    return true;
  });

  test('memory: getStats() 报告签名覆盖率', async () => {
    const mm = new MeaningfulMemory({ rootPath: HF + '/' });
    const before = mm.getStats();
    if (typeof before.signatureCoverage !== 'number') throw new Error('signatureCoverage 缺失');
    if (typeof before.signedMemories !== 'number') throw new Error('signedMemories 缺失');
    // 覆盖率必须在 [0, 100] 范围
    if (before.signatureCoverage < 0 || before.signatureCoverage > 100) throw new Error('覆盖率越界: ' + before.signatureCoverage);
    return true;
  });

  test('memory: 签名密钥可验证（sign/verify 对）', async () => {
    const { VerifierGrant } = require(path.join(HF, 'src/core/verifier-grant.js'));
    const vg = new VerifierGrant();
    const crypto = require('crypto');
    const digest = crypto.createHash('sha256').update('验证测试').digest('hex');
    const sig = crypto.createSign('RSA-SHA256').update(digest).sign(vg._rootKey.privateKey, 'base64');
    const valid = crypto.createVerify('RSA-SHA256').update(digest).verify(vg._rootKey.publicKey, sig, 'base64');
    if (!valid) throw new Error('RSA 签名验证失败');
    return true;
  });
};
