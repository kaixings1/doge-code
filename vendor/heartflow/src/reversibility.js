/**
 * checkReversibility - decision reversibility / rollback gate
 *
 * Detects missing reversibility in decisions/plans:
 * R1. irreversible operations without gate (deletion, overwrite, DDL)
 * R2. batch operations missing scope or backup
 * R3. production config/credentials without irreversible warning
 */
function checkReversibility(text) {
  if (!text || typeof text !== 'string') {
    return { score: 0, issues: [], summary: 'empty input' };
  }

  const issues = [];

  // R1: irreversible operations without confirmation or backup
  const IRREVERSIBLE = [
    { re: /delete\s+table/gi, label: 'DELETE TABLE' },
    { re: /drop\s+table/gi, label: 'DROP TABLE' },
    { re: /rm\s+-rf/gi, label: 'rm -rf' },
    { re: /overwrite/gi, label: 'overwrite' },
    { re: /rename\s+\w+/gi, label: 'rename' },
    { re: /\bDDL\b/gi, label: 'DDL' },
    { re: /migrate/gi, label: 'migrate' }
  ];

  for (const { re, label } of IRREVERSIBLE) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const window = text.slice(Math.max(0, m.index - 200), Math.min(text.length, m.index + 200));
      const hasConfirmation = /confirm|user\s+approval|manual|approval|callback/i.test(window);
      const hasBackup = /\.bak|backup|rollback|reverse|undo/i.test(window);
      if (!hasConfirmation && !hasBackup) {
        issues.push({
          type: 'irreversible_no_gate',
          severity: 0.85,
          claim: m[0],
          position: m.index,
          detail: `${label} "${m[0]}" missing user confirmation or backup/rollback`
        });
      }
    }
  }

  // R2: batch operations without scope or backup
  const BATCH = [
    { re: /\bbatch\s+\w+/gi, label: 'batch' },
    { re: /\bbulk\s+\w+/gi, label: 'bulk' },
    { re: /\ball\s+\w+/gi, label: 'all' }
  ];

  for (const { re, label } of BATCH) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const window = text.slice(Math.max(0, m.index - 150), Math.min(text.length, m.index + 150));
      const hasScope = /\d+\s*(items?|records?|files?)/i.test(window);
      const hasBackup = /\.bak|backup|rollback/i.test(window);
      if (!hasScope || !hasBackup) {
        issues.push({
          type: 'batch_no_scope_or_backup',
          severity: 0.6,
          claim: m[0],
          position: m.index,
          detail: `${label} "${m[0]}" missing scope or backup`
        });
      }
    }
  }

  // R3: production config/credentials without irreversible warning
  const PROD = [
    /production\s+config/i,
    /\benv\s+\w+/i,
    /\btoken\s*[:=]/i,
    /\b(key|secret)\s*[:=]/i,
    /credential/i
  ];

  for (const re of PROD) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const window = text.slice(Math.max(0, m.index - 200), Math.min(text.length, m.index + 200));
      const hasWarning = /irreversible|manual\s+confirm|rollback/i.test(window);
      if (!hasWarning) {
        issues.push({
          type: 'prod_config_no_warning',
          severity: 0.7,
          claim: m[0],
          position: m.index,
          detail: `production config/credential "${m[0]}" missing irreversible warning or rollback`
        });
      }
    }
  }

  const score = issues.length === 0 ? 1 : Math.max(0, 1 - issues.reduce((sum, i) => sum + i.severity, 0) / issues.length);

  const summary = issues.length === 0
    ? 'reversibility satisfied'
    : `detected ${issues.length} reversibility issues: ${[...new Set(issues.map(i => i.type))].join(', ')}`;

  return { score, issues, summary };
}

module.exports = { checkReversibility };
