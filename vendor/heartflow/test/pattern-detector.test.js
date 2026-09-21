const { PatternDetector } = require('../src/pattern-detector.js');

function testPatternDetector() {
  const pd = new PatternDetector({ minRecordsForTrend: 4 });

  const records = [
    { date: '2026-08-01', type: 'success' },
    { date: '2026-08-02', type: 'success' },
    { date: '2026-08-03', type: 'success' },
    { date: '2026-08-04', type: 'success' },
  ];
  const trend = pd.analyzeTrend(records);
  if (!trend || typeof trend.direction === 'undefined') {
    throw new Error('analyzeTrend returned invalid shape');
  }

  const osc = pd.detectOscillation(records);
  if (!osc || typeof osc.detected === 'undefined') {
    throw new Error('detectOscillation returned invalid shape');
  }

  console.log('PatternDetector smoke test passed');
}

testPatternDetector();
