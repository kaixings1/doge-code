const { checkOutput } = require(process.env.HEARTFLOW_SRC || require('path').join(__dirname, '..', '..', '..', 'src', 'gate.js'));

/**
 * Isolate which sentences trigger gate findings.
 *
 * Usage:
 *   node scripts/probe-gate-triggers.js "text to probe"
 *   node scripts/probe-gate-triggers.js --file references/some-doc.md
 *
 * Environment:
 *   HEARTFLOW_SRC — path to HeartFlow repo root (optional)
 */

const fs = require('fs');
const path = require('path');

const input = process.argv[2];
const dims = process.argv[3]?.split(',') || [
  'ai_writing_tell',
  'capability_overclaim',
  'contradiction',
  'vagueness',
  'bullshit',
  'moral_foundations',
  'reasoning_coherence'
];

if (!input) {
  console.error('Usage: probe-gate-triggers.js <text|--file path> [dim1,dim2,...]');
  process.exit(1);
}

let text = input;
if (input === '--file' && process.argv[4]) {
  text = fs.readFileSync(process.argv[4], 'utf8');
}

// Split into candidate units: lines, then paragraphs, then halves of long paragraphs.
const lines = text.split(/\n/).filter(l => l.trim());
const candidates = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  // Short lines (< 120 chars) are atomic.
  if (trimmed.length < 120) {
    candidates.push(trimmed);
    continue;
  }

  // Long lines: split on sentence boundaries, keep first 2 and last 2 sentences.
  const sentences = trimmed.match(/[^。！？.!?]+[。！？.!?]+\s*/g) || [trimmed];
  if (sentences.length <= 4) {
    candidates.push(trimmed);
  } else {
    candidates.push(sentences.slice(0, 2).join('').trim());
    candidates.push(sentences.slice(-2).join('').trim());
  }
}

// Deduplicate while preserving order.
const seen = new Set();
const unique = [];
for (const c of candidates) {
  const key = c.slice(0, 80);
  if (!seen.has(key)) {
    seen.add(key);
    unique.push(c);
  }
}

const results = {};
for (const candidate of unique) {
  const r = checkOutput(candidate);
  const hits = r.findings.filter(f => dims.includes(f.dimension));
  if (hits.length > 0) {
    results[candidate.slice(0, 100)] = hits.map(h => ({
      dimension: h.dimension,
      severity: h.severity,
      details: h.details,
      guidance: h.guidance || null
    }));
  }
}

if (Object.keys(results).length === 0) {
  console.log(JSON.stringify({ message: 'No target findings triggered in isolation.', dims_checked: dims }, null, 2));
} else {
  console.log(JSON.stringify(results, null, 2));
}
