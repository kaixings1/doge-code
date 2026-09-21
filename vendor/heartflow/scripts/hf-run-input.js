const { HeartFlow } = require('../src/core/heartflow.js');
const { readFileSync } = require('fs');
const text = readFileSync('/tmp/hf-input.txt', 'utf8').trim();

(async () => {
  const hf = new HeartFlow({ dataDir: './data', silent: true });
  hf.start();
  await new Promise(r => setTimeout(r, 3500));

  const r = await hf.think(text);
  console.log('=== think() result ===');
  console.log(JSON.stringify({
    confidence: r.output?.meta?.confidence,
    conclusion: r.output?.conclusion,
    warnings: r.output?.warnings,
    synthesis: r.synthesis,
    metaCalibration: r.metaCalibration,
    blindSpotAnalysis: r.blindSpotAnalysis
  }, null, 2));

  const gate = require('../src/gate.js');
  const g = gate.checkOutput(text);
  console.log('\n=== checkOutput ===');
  console.log(JSON.stringify({
    gate: g.gate,
    verdict: g.verdict,
    overallScore: g.overallScore,
    findings: (g.findings || []).slice(0, 10)
  }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
