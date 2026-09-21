/**
 * checkCompletionEvidence - 完成证据验证器
 *
 * Detects empty completion claims:
 * C1. "已完成/已修复/已解决" without evidence (git hash, test pass count, file paths)
 * C2. "确认正常" type empty verification
 * C3. Vague "可以了/好了/没问题" without concrete output
 * C4. Claims of "全部通过" but no actual test output shown
 * C5. Claims of "已提交/已推送" without commit hash or PR link
 */

function checkCompletionEvidence(text) {
  if (!text || typeof text !== 'string') {
    return { score: 0, issues: [], summary: '输入为空' };
  }

  const issues = [];

  // C1: Empty completion claims
  const COMPLETION_CLAIMS = [
    /(?:已)?完成[了]?[\s，。]/gi,
    /(?:已)?修复[了]?[\s，。]/gi,
    /(?:已)?解决[了]?[\s，。]/gi,
    /(?:已)?搞定[了]?[\s，。]/gi,
    /(?:已)?交付[了]?[\s，。]/gi,
    /done[\s，。!,;]/gi,
    /fixed[\s，。!,;]/gi,
    /resolved[\s，。!,;]/gi
  ];

  let completionClaims = [];
  for (const pat of COMPLETION_CLAIMS) {
    let m;
    const copy = new RegExp(pat.source, pat.flags);
    while ((m = copy.exec(text)) !== null) {
      completionClaims.push({ match: m[0], position: m.index });
    }
  }

  // Evidence patterns to look for near each claim
  const EVIDENCE_PATTERNS = [
    /\b[0-9a-f]{7,40}\b/i,              // git hash
    /\b\d+\s*(?:passed|通过|passed|tests)/i, // test count
    /\bcommit\s+[0-9a-f]{7,}/i,         // explicit commit ref
    /\bPR\s*#?\d+/i,                     // PR reference
    /\bhttps?:\/\/[^\s]+/g,              // URL
    /\b\d+\s*(?:个|条|处|项)/g,          // Chinese count
    /\btest\s+result/i,                  // test result
    /\bexit\s+code[:\\s]*0\b/i,          // exit code
    /\b验证[：:]\\s*[^\\s]+/g,             // Chinese verification
    /\b\d+\s*passed/i                    // passed count
  ];

  for (const claim of completionClaims) {
    const windowStart = Math.max(0, claim.position - 200);
    const windowEnd = Math.min(text.length, claim.position + 200);
    const window = text.slice(windowStart, windowEnd);

    let hasEvidence = false;
    for (const ev of EVIDENCE_PATTERNS) {
      const evCopy = new RegExp(ev.source, ev.flags);
      if (evCopy.test(window)) {
        hasEvidence = true;
        break;
      }
    }

    if (!hasEvidence) {
      issues.push({
        type: 'empty_completion',
        severity: 0.7,
        claim: claim.match.trim(),
        position: claim.position,
        detail: `完成声明 "${claim.match.trim()}" 缺少验证证据（附近200字内未检测到git hash、测试数量、URL或具体验证输出）`
      });
    }
  }

  // C2: Empty verification phrasing
  const EMPTY_VERIFY = [
    /确认正常/g,
    /验证通过/g,
    /检查无误/g,
    /checked\s+ok/i,
    /verification\s+passed/i,
    /all\s+good/i
  ];

  for (const pat of EMPTY_VERIFY) {
    const copy = new RegExp(pat.source, pat.flags);
    let m;
    while ((m = copy.exec(text)) !== null) {
      const before = text.slice(Math.max(0, m.index - 100), m.index);
      const after = text.slice(m.index + m[0].length, Math.min(text.length, m.index + 100));
      const surrounding = before + after;

      if (!/curl|node|node\s+\S+\.js|python|pytest|test|grep|git\s+log|cat\s+\S+|运行|执行|查看了/.test(surrounding)) {
        issues.push({
          type: 'empty_verification',
          severity: 0.6,
          claim: m[0],
          position: m.index,
          detail: `空验证措辞 "${m[0]}" 未附具体检查方法（如测试命令、git show、curl 验证等）`
        });
      }
    }
  }

  // C3: Vague completion without output
  const VAGUE_COMPLETION = [
    /可以了[\s。，]*$/gm,
    /好了[\s。，]*$/gm,
    /没问题[\s。，]*$/gm,
    /works?\s*fine[\s。，!]*$/gim,
    /no\s+problem[\s。，!]*$/gim,
    /all\s+set[\s。，!]*$/gim
  ];

  for (const pat of VAGUE_COMPLETION) {
    const copy = new RegExp(pat.source, pat.flags);
    let m;
    while ((m = copy.exec(text)) !== null) {
      const alreadyFlagged = issues.some(i => Math.abs(i.position - m.index) < 50);
      if (!alreadyFlagged) {
        issues.push({
          type: 'vague_completion',
          severity: 0.5,
          claim: m[0].trim(),
          position: m.index,
          detail: `模糊完成声明 "${m[0].trim()}" 缺少具体完成证据`
        });
      }
    }
  }

  // C4: "All passed" without numbers
  const ALL_PASSED = /all\s+(?:tests?\s*)?(?:passed|通过|green)/gi;
  let m4;
  while ((m4 = ALL_PASSED.exec(text)) !== null) {
    const window4 = text.slice(Math.max(0, m4.index - 300), Math.min(text.length, m4.index + 300));
    if (!/\d+/.test(window4)) {
      issues.push({
        type: 'unverified_all_pass',
        severity: 0.65,
        claim: m4[0],
        position: m4.index,
        detail: '声称"全部通过"但附近未附测试数量的具体数字'
      });
    }
  }

  // C5: "已推送" without commit hash or branch info
  const PUSH_CLAIMS = [
    /已推送/gi,
    /已提交/gi,
    /pushed/gi,
    /committed/gi
  ];

  for (const pat of PUSH_CLAIMS) {
    const copy = new RegExp(pat.source, pat.flags);
    let m;
    while ((m = copy.exec(text)) !== null) {
      const windowStart = Math.max(0, m.index - 200);
      const windowEnd = Math.min(text.length, m.index + 200);
      const window = text.slice(windowStart, windowEnd);
      if (!/[0-9a-f]{7,}/i.test(window) && !/origin\s+\w+/i.test(window) && !/branch/i.test(window) && !/commit/i.test(window)) {
        issues.push({
          type: 'push_without_proof',
          severity: 0.6,
          claim: m[0],
          position: m.index,
          detail: `推送声明 "${m[0]}" 缺少commit hash或分支信息`
        });
      }
    }
  }

  const score = issues.length === 0 ? 1 : Math.max(0, 1 - issues.reduce((sum, i) => sum + i.severity, 0) / issues.length);

  const summary = issues.length === 0
    ? '完成声明完整，包含验证证据'
    : `发现${issues.length}处完成证据不足：${[...new Set(issues.map(i => i.type))].join('、')}`;

  return { score, issues, summary };
}

module.exports = { checkCompletionEvidence };
