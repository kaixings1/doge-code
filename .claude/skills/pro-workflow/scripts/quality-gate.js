#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

function getTempDir() {
  return path.join(os.tmpdir(), 'pro-workflow');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function log(msg) {
  console.error(msg);
}

function getStore() {
  const distPath = path.join(__dirname, '..', 'dist', 'db', 'store.js');
  if (fs.existsSync(distPath)) {
    const { createStore } = require(distPath);
    return createStore();
  }
  return null;
}

function getAdaptiveThreshold(store) {
  if (!store) return { first: 5, second: 10, repeat: 10 };

  try {
    const sessions = store.getRecentSessions(10);
    if (sessions.length < 3) return { first: 5, second: 10, repeat: 10 };

    const totalEdits = sessions.reduce((s, sess) => s + sess.edit_count, 0);
    const totalCorrections = sessions.reduce((s, sess) => s + sess.corrections_count, 0);
    const correctionRate = totalEdits > 0 ? totalCorrections / totalEdits : 0;

    if (correctionRate > 0.25) {
      return { first: 3, second: 6, repeat: 6 };
    } else if (correctionRate > 0.15) {
      return { first: 5, second: 10, repeat: 10 };
    } else if (correctionRate > 0.05) {
      return { first: 8, second: 15, repeat: 15 };
    } else {
      return { first: 10, second: 20, repeat: 20 };
    }
  } catch (e) {
    return { first: 5, second: 10, repeat: 10 };
  }
}

async function main() {
  const sessionId = process.env.CLAUDE_SESSION_ID || String(process.ppid) || 'default';

  let count = 1;
  let store = null;
  let threshold = { first: 5, second: 10, repeat: 10 };

  try {
    store = getStore();
  } catch (e) {
    // Store not available
  }

  if (store) {
    try {
      threshold = getAdaptiveThreshold(store);
      const session = store.getSession(sessionId);
      if (session) {
        store.updateSessionCounts(sessionId, 1, 0, 0);
        count = session.edit_count + 1;
      }
    } catch (e) {
      store = null;
    } finally {
      if (store) {
        try { store.close(); } catch (e) { /* ignore close errors */ }
      }
    }
  }

  if (!store) {
    const tempDir = getTempDir();
    ensureDir(tempDir);

    const editCountFile = path.join(tempDir, `edit-count-${sessionId}`);

    if (fs.existsSync(editCountFile)) {
      count = parseInt(fs.readFileSync(editCountFile, 'utf8').trim(), 10) + 1;
    }

    fs.writeFileSync(editCountFile, String(count));
  }

  if (count === threshold.first) {
    log(`[ProWorkflow] ${count} edits — checkpoint for review`);
    log('[ProWorkflow] Run: git diff --stat | to see changes');
    if (threshold.first < 5) {
      log('[ProWorkflow] (adaptive: tighter gates due to recent correction rate)');
    }
  }

  if (count === threshold.second) {
    log(`[ProWorkflow] ${count} edits — run quality gates:`);
    log('[ProWorkflow]   npm run lint && npm run typecheck && npm test --changed');
    if (threshold.second < 10) {
      log('[ProWorkflow] (adaptive: correction history suggests more frequent checks)');
    }
  }

  if (count > threshold.second && count % threshold.repeat === 0) {
    log(`[ProWorkflow] ${count} edits — quality gates due`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[ProWorkflow] Error:', err.message);
  process.exit(0);
});
