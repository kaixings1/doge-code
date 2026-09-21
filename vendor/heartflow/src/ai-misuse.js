/**
 * checkAIMisuse - 人机交互误区检测器
 *
 * Detects 5 common user misconceptions when interacting with AI:
 * M1. 一次喂超大上下文 (overloading context) - expecting one-shot completion of complex tasks
 * M2. 只贴报错不给上下文 (error without context) - reporting errors without reproduction info
 * M3. 未核对直接采用 (unverified adoption) - accepting AI output without verification
 * M4. 反复小改碰运气 (repeated small fixes) - repeated minor changes without root cause analysis
 * M5. 让 AI 背锅式兜底 (AI scapegoating) - expecting AI to make all decisions
 */

function checkAIMisuse(text) {
  if (!text || typeof text !== 'string') {
    return { score: 0, issues: [], summary: '输入为空' };
  }

  const issues = [];

  // M1: overloading context - trying to do everything in one shot
  const OVERLOAD_PATTERNS = [
    /一次性[完成搞定]/g,
    /全部[做完处理好]/g,
    /所有[问题东西]/g,
    /整个[项目系统]/g,
    /批量[处理完成]/g,
    /all\s+of\s+them/gi,
    /everything\s+at\s+once/gi,
    /one\s+shot/gi,
    /in\s+one\s+go/gi
  ];

  for (const pat of OVERLOAD_PATTERNS) {
    const copy = new RegExp(pat.source, pat.flags);
    let m;
    while ((m = copy.exec(text)) !== null) {
      issues.push({
        type: 'context_overload',
        severity: 0.5,
        claim: m[0],
        position: m.index,
        detail: `检测到一次性完成意图 "${m[0]}" — 复杂任务建议分步迭代，避免单次上下文过载`
      });
    }
  }

  // M2: error without context - reporting errors without reproduction info
  const ERROR_NO_CONTEXT = [
    /报错[了：:]?\s*[A-Za-z0-9_]+/g,
    /error[：:]\s*[A-Za-z0-9_]+/gi,
    /失败[了了]?\s*[A-Za-z0-9_]+/g,
    /failed[：:]\s*[A-Za-z0-9_]+/gi,
    /不\s*[行能对]/g,
    /doesn't\s+work/gi,
    /not\s+working/gi,
    /broken/gi
  ];

  for (const pat of ERROR_NO_CONTEXT) {
    const copy = new RegExp(pat.source, pat.flags);
    let m;
    while ((m = copy.exec(text)) !== null) {
      const window = text.slice(Math.max(0, m.index - 100), Math.min(text.length, m.index + 100));
      const hasContext = /步骤|操作|输入|触发|复现|场景|command|command|stack|trace|when|while|after/.test(window);
      if (!hasContext) {
        issues.push({
          type: 'error_without_context',
          severity: 0.6,
          claim: m[0],
          position: m.index,
          detail: `报错 "${m[0]}" 缺少复现上下文（步骤/输入/触发条件/期望行为）`
        });
      }
    }
  }

  // M3: unverified adoption - accepting AI output without verification
  const UNVERIFIED_ADOPTION = [
    /直接用[你它]的/gi,
    /照搬/gi,
    /直接复制/gi,
    /直接采用/gi,
    /不用改/gi,
    /直接\s*use/gi,
    /copy\s+directly/gi,
    /as\s+is/gi,
    /without\s+checking/gi,
    /trust\s+it/gi
  ];

  for (const pat of UNVERIFIED_ADOPTION) {
    const copy = new RegExp(pat.source, pat.flags);
    let m;
    while ((m = copy.exec(text)) !== null) {
      issues.push({
        type: 'unverified_adoption',
        severity: 0.55,
        claim: m[0],
        position: m.index,
        detail: `检测到未验证直接采用意图 "${m[0]}" — AI 输出应经过验证再合入`
      });
    }
  }

  // M4: repeated small fixes - repeated minor changes without root cause analysis
  const REPEATED_FIXES = [
    /再?试[一试几次看看]/g,
    /再?改[一改下看看]/g,
    /再?调[一调整下看看]/g,
    /再?跑[一跑下看看]/g,
    /try\s+again/gi,
    /fix\s+it/gi,
    /adjust\s+it/gi,
    /retry/gi
  ];

  // Only flag if there are multiple such patterns in close proximity
  let fixCount = 0;
  for (const pat of REPEATED_FIXES) {
    const copy = new RegExp(pat.source, pat.flags);
    let m;
    while ((m = copy.exec(text)) !== null) {
      fixCount++;
    }
  }

  if (fixCount >= 3) {
    issues.push({
      type: 'repeated_fixes',
      severity: 0.5,
      claim: `${fixCount}处反复修改措辞`,
      position: 0,
      detail: `检测到${fixCount}处"再试/再改/再调"类措辞 — 建议先定位根因再一次性修复，避免碰运气式反复修改`
    });
  }

  // M5: AI scapegoating - expecting AI to make all decisions
  const SCAPEGOATING = [
    /你[来负责]?决定/gi,
    /你[觉得认为]?[应该该]/gi,
    /你[自己看看]/gi,
    /你[搞定处理]/gi,
    /you\s+decide/gi,
    /you\s+handle\s+it/gi,
    /you\s+figure\s+it\s+out/gi,
    /your\s+call/gi,
    /up\s+to\s+you/gi
  ];

  for (const pat of SCAPEGOATING) {
    const copy = new RegExp(pat.source, pat.flags);
    let m;
    while ((m = copy.exec(text)) !== null) {
      issues.push({
        type: 'ai_scapegoating',
        severity: 0.45,
        claim: m[0],
        position: m.index,
        detail: `检测到决策转嫁意图 "${m[0]}" — 关键决策应由用户拍板，AI 只给候选与风险`
      });
    }
  }

  const score = issues.length === 0 ? 1 : Math.max(0, 1 - issues.reduce((sum, i) => sum + i.severity, 0) / issues.length);

  const summary = issues.length === 0
    ? '人机交互模式健康，未检测到典型误区'
    : `检测到${issues.length}处交互误区：${[...new Set(issues.map(i => i.type))].join('、')}`;

  return { score, issues, summary };
}

module.exports = { checkAIMisuse };
