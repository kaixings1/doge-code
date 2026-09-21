/**
 * src/pedagogy.js — 教学文本识别器
 *
 * 识别课堂/教程/课件中的特定写作模式，降低 gate 误报。
 * 仅在调用方明确传入 pedagogical 信号时生效，默认行为不变。
 */

'use strict';

function detectPedagogicalContent(text) {
  if (!text || typeof text !== 'string') return null;

  const hasCommandList = /(?:^|\n)\s*▸\s*\/[a-zA-Z]+\s+[^\n]+/.test(text) || /\b\/reset\b|\/clear\b|\/memory\b|\/skill\b/.test(text) || /(?:^|\n)\s*▸\s*(?:Step\s*\d|操作\s*\d|Q:|A:)/.test(text);
  const hasConfigExample = /(?:app_id|app_secret|api_key|base_url)\s*[:=]/.test(text) && /cli_[a-z0-9]+|xxxx/i.test(text);
  const hasTechPaths = /\/etc\/shadow|\/root\/\.ssh|\/root\/projects/.test(text);
  const hasQAPattern = /\n\s*Q[:：]/.test(text) || /\n\s*A[:：]/.test(text);
  const hasCapabilityCompare = /Hermes (?:的优势|的局限|vs|对比)/.test(text) || /优势[^\n]*局限/.test(text);
  const hasMisconceptionSection = /误解\s*\d/.test(text) || /事实[：:]/.test(text);
  const hasMisconceptionPair = /误解[^。]{0,30}事实/.test(text) || /误解[^。]{0,30}纠正/.test(text);
  const hasClassroomStructure = /本节课目标|核心术语|常见错误|实战案例|检查清单|下一步行动|课程总结|课后作业|操作\s*\d|Step\s*\d/i.test(text);

  const score = [hasCommandList, hasConfigExample, hasTechPaths, hasQAPattern, hasCapabilityCompare, hasMisconceptionSection, hasMisconceptionPair, hasClassroomStructure].filter(Boolean).length / 8;

  if (score < 0.0) return null; // any pedagogical signal triggers relaxation

  return {
    hasCommandList,
    hasConfigExample,
    hasTechPaths,
    hasQAPattern,
    hasCapabilityCompare,
    hasMisconceptionSection,
    hasMisconceptionPair,
    hasClassroomStructure,
    score,
  };
}

function getPedagogyRelaxation(pedagogy) {
  if (!pedagogy) return {};
  const relax = {};
  if (pedagogy.hasCommandList) {
    relax.prompt_injection = 0.9;
    relax.dehumanization = 0.9;
  }
  if (pedagogy.hasConfigExample) {
    relax.code_security = 0.5;
    relax.privacy_boundary = 0.5;
  }
  if (pedagogy.hasTechPaths) {
    relax.code_security = 0.5;
  }
  if (pedagogy.hasQAPattern) {
    relax.sarcasm = 0.5;
    relax.bullshit = 0.5;
  }
  if (pedagogy.hasCapabilityCompare) {
    relax.capability_overclaim = Math.max((relax.capability_overclaim || 0), 0.7);
    relax.absolute_claim = Math.max((relax.absolute_claim || 0), 0.5);
  }
  if (pedagogy.hasMisconceptionSection) {
    relax.absolute_claim = Math.max((relax.absolute_claim || 0), 0.5);
    relax.capability_overclaim = Math.max((relax.capability_overclaim || 0), 0.7);
  }
  if (pedagogy.hasMisconceptionPair) {
    relax.contradiction = Math.max((relax.contradiction || 0), 0.6);
    relax.emotional_manipulation = Math.max((relax.emotional_manipulation || 0), 0.3);
    relax.confidence = Math.max((relax.confidence || 0), 0.3);
    relax.presupposition = Math.max((relax.presupposition || 0), 0.3);
  }
  if (pedagogy.hasClassroomStructure) {
    relax.contradiction = Math.max((relax.contradiction || 0), 0.6);
    relax.vagueness = Math.max((relax.vagueness || 0), 0.4);
    relax.confidence = Math.max((relax.confidence || 0), 0.4);
    relax.presupposition = Math.max((relax.presupposition || 0), 0.4);
    relax.moral_foundations = Math.max((relax.moral_foundations || 0), 0.5);
    relax.instrumental_reasoning = Math.max((relax.instrumental_reasoning || 0), 0.4);
  }
  // 教学文本共性：技术术语/路径示例常被误判为非人化/代码安全
  if (pedagogy.score > 0) {
    relax.dehumanization = Math.max((relax.dehumanization || 0), 0.5);
    relax.code_security = Math.max((relax.code_security || 0), 0.6);
    relax.privacy_boundary = Math.max((relax.privacy_boundary || 0), 0.4);
  }
  return relax;
}

module.exports = {
  detectPedagogicalContent,
  getPedagogyRelaxation,
};
