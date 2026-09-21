/**
 * ai-writing-tell.js — AI 写作特征检测器
 *
 * 来源：avoid-ai-writing / llm-prompt-guard / ai-text-detector 社区仓库
 * 整合：Tier1/Tier2/Tier3 词汇 + AI 工具指纹 + 公式化开头 + 伪造让步 + 情感平线 + 社交 CTA 收尾
 * 定位： HeartFlow 47 维之外的补充信号，只进 findings，不改变原有 block/rewrite/verify 路由
 */

const { escapeRegExp } = require('../utils/safe-regex.js');

// ── 1. AI-tool fingerprints ────────────────────────────────────────
const AI_PLACEHOLDERS = [
  /\[(?:Your|Insert|Add|Enter|Describe|Specify|Choose|Pick)[^\]\n]{1,80}\]/gi,
  /\[(?:Recipient|Sender|Topic|Subject|Salutation|Closing|Position|Department|Project Name|Company Name|Date)(?:\s+[^\]\n]{0,60})?\]/gi,
  /\[(?:INSERT|FILL\s+IN|ADD|TODO|TBD|PLACEHOLDER)[^\]]{0,80}\]/g,
  /\b(?:19|20)\d{2}-XX-XX\b/g,
  /\bXX\/XX\/(?:19|20)\d{2}\b/g,
  /<!--\s*(?:add|fill\s+in|insert|todo|placeholder)[^>]{0,120}-->/gi,
];

const AI_CITATION_MARKUP = [
  /cite(?:turn|news|search|navigation)\d+(?:search|turn|news|navigation)\d+/gi,
  /contentReference\s*\[oaicite:[^\]]+\]\s*\{[^}]*\}/gi,
  /\boai_citation\b/gi,
  /\[attached_file:\d+\]/gi,
  /\bgrok_card\b/gi,
];

const AI_UTM_SOURCE = [
  /[?&]utm_source=(?:chatgpt|openai|copilot|claude|grok|gemini|perplexity)(?:\.com|\.ai)?\b/gi,
  /[?&]referrer=(?:chatgpt|copilot|grok|gemini|perplexity)\.(?:com|ai)\b/gi,
];

// ── 2. Tier1 / Tier2 / Tier3 词表 ─────────────────────────────────
const TIER1 = new Set([
  'delve','tapestry','paradigm','beacon','robust','comprehensive','cutting-edge',
  'pivotal','meticulous','meticulously','seamless','seamlessly','game-changer',
  'game-changing','nestled','vibrant','thriving','bustling','intricate','intricacies',
  'ever-evolving','enduring','daunting','holistic','holistically','actionable',
  'impactful','learnings','synergy','synergies','interplay','symphony','embrace',
]);
const TIER2 = new Set([
  'harness','navigate','navigating','foster','elevate','unleash','streamline',
  'empower','bolster','spearhead','resonate','resonates','revolutionize','facilitate',
  'facilitates','underpin','nuanced','crucial','multifaceted','ecosystem','myriad',
  'plethora','encompass','catalyze','reimagine','galvanize','augment','cultivate',
  'illuminate','elucidate','juxtapose','transformative','transformation','cornerstone',
  'paramount','poised','burgeoning','nascent','quintessential','overarching',
  'underpinning','underpinnings','paradigm-shifting',
]);
const TIER3 = new Set([
  'significant','significantly','innovative','innovation','effective','effectively',
  'dynamic','dynamics','scalable','scalability','compelling','unprecedented',
  'exceptional','exceptionally','remarkable','remarkably','sophisticated','instrumental',
  'world-class','state-of-the-art','best-in-class','verbatim',
]);

// ── 3. 结构模式 ───────────────────────────────────────────────────
const TRANSITIONS = [
  /\bmoreover\b/gi, /\bfurthermore\b/gi, /\badditionally\b/gi,
  /\bin\s+today'?s\b/gi, /\bin\s+an\s+era\s+where\b/gi,
  /\bit'?s\s+worth\s+noting\s+that\b/gi, /\bnotably\b/gi,
  /\bin\s+conclusion\b/gi, /\bin\s+summary\b/gi, /\bto\s+summarize\b/gi,
  /\bwhen\s+it\s+comes\s+to\b/gi, /\bat\s+the\s+end\s+of\s+the\s+day\b/gi,
  /\bthat\s+(?:being\s+)?said\b/gi,
];
const CHATBOT_ARTIFACTS = [
  /\bi\s+hope\s+this\s+helps\b/gi, /\bcertainly!\b/gi, /\babsolutely!\b/gi,
  /\bgreat\s+question!\b/gi, /\bexcellent\s+point!\b/gi,
  /\bfeel\s+free\s+to\s+reach\s+out\b/gi,
  /\blet\s+me\s+know\s+if\s+you\s+need\s+anything\b/gi,
  /\bin\s+this\s+article,?\s+we\s+will\s+explore\b/gi,
  /\blet'?s\s+dive\s+in!?\b/gi,
];
const SYCOPHANTIC = [
  /\byou'?re\s+absolutely\s+right\b/gi,
  /\bthat'?s\s+a\s+really\s+insightful\b/gi,
  /\bthat'?s\s+a\s+great\s+question\b/gi,
  /\bexcellent\s+question\b/gi,
];
const FILLERS = [
  /\bit\s+is\s+important\s+to\s+note\s+that\b/gi,
  /\bin\s+terms\s+of\b/gi,
  /\bthe\s+reality\s+is\s+that\b/gi,
  /\bit'?s\s+important\s+to\s+note\s+that\b/gi,
];
const GENERIC_CONCLUSIONS = [
  /\bthe\s+future\s+looks\s+bright\b/gi,
  /\bonly\s+time\s+will\s+tell\b/gi,
  /\bone\s+thing\s+is\s+certain\b/gi,
  /\bas\s+we\s+move\s+forward\b/gi,
];
const LETS_PATTERNS = [
  /\blet'?s\s+explore\b/gi, /\blet'?s\s+take\s+a\s+look\b/gi,
  /\blet'?s\s+break\s+this\s+down\b/gi, /\blet'?s\s+examine\b/gi,
  /\blet'?s\s+(?:consider|discuss|delve|unpack|walk\s+through)\b/gi,
];
const REASONING_ARTIFACTS = [
  /\blet\s+me\s+think\s+step\s+by\s+step\b/gi,
  /\bbreaking\s+this\s+down\b/gi,
  /\bto\s+approach\s+this\s+systematically\b/gi,
  /\bhere'?s\s+my\s+thought\s+process\b/gi,
  /\bfirst,?\s+let'?s\s+consider\b/gi,
  /\bworking\s+through\s+this\s+logically\b/gi,
];
const SIGNIFICANCE_INFLATION = [
  /\bmarking\s+a\s+(?:pivotal|significant|important)\s+moment\b/gi,
  /\ba\s+watershed\s+moment\s+for\b/gi,
  /\bin\s+the\s+evolution\s+of\b/gi,
  /\ba\s+(?:pivotal|defining)\s+moment\s+in\b/gi,
];
const VAGUE_ATTRIBUTIONS = [
  /\bexperts\s+(?:believe|say|suggest|agree)\b/gi,
  /\bstudies\s+(?:show|suggest|indicate)\b/gi,
  /\bresearch\s+(?:shows|suggests|indicates)\b/gi,
  /\bindustry\s+leaders\s+(?:agree|believe|say)\b/gi,
];
const HOLLOW_INTENSIFIERS = [
  /\bgenuine(?:ly)?\b/gi, /\btruly\b/gi, /\bquite\s+frankly\b/gi,
  /\bto\s+be\s+honest\b/gi, /\blet'?s\s+be\s+clear\b/gi,
];
const EMOTIONAL_FLATLINE = [
  /\bwhat\s+surprised\s+me\s+most\b/gi,
  /\bi\s+was\s+fascinated\s+to\b/gi,
  /\bwhat\s+struck\s+me\s+was\b/gi,
  /\bi\s+was\s+excited\s+to\s+learn\b/gi,
  /\bthe\s+most\s+interesting\s+(?:part|thing|aspect|piece)\b/gi,
  /^\s*interesting\s+(?:part|thing|aspect|piece)(?:\s+of\s+(?:the\s+)?\w+)?\s*:/gim,
];
const LINGERING_ATTENTION = [
  /\b(?:the|that|this)\s+(?:one\s+)?(?:line|quote|bit|part|idea|point|framing|comment|thing)\s+(?:that\s+)?i\s+keep\s+(?:coming\s+back\s+to|thinking\s+about)\b/gi,
  /\bi\s+can'?t\s+stop\s+thinking\s+about\b/gi,
  /\bstill\s+thinking\s+about\s+(?:this|that)\s+one\b/gi,
  /\b(?:been|be)\s+rattling\s+around\s+(?:in\s+)?my\s+(?:head|brain)\b/gi,
  /\bi'?ve\s+been\s+chewing\s+on\s+(?:this|that)\b/gi,
];
const NOVELTY_INFLATION = [
  /\bthe\s+failure\s+mode\s+nobody'?s?\s+naming\b/gi,
  /\ba\s+problem\s+nobody\s+talks\s+about\b/gi,
  /\bthe\s+insight\s+everyone'?s?\s+missing\b/gi,
  /\bwhat\s+nobody\s+tells\s+you\b/gi,
];
const CUTOFF_DISCLAIMERS = [
  /\bas\s+of\s+my\s+last\s+update\b/gi,
  /\bas\s+of\s+my\s+(?:knowledge\s+)?(?:cut-?off|last\s+training)\b/gi,
  /\bi\s+don'?t\s+have\s+access\s+to\s+real-?time\s+(?:data|information)\b/gi,
  /\bbased\s+on\s+available\s+information\b/gi,
  /\bas\s+an?\s+(?:ai|artificial\s+intelligence|large\s+language|ai\s+language)\s+(?:language\s+)?model\b/gi,
  /\bi\s+(?:am|'m)\s+an?\s+(?:ai|artificial\s+intelligence|large\s+language)\s+(?:assistant|model)?\b/gi,
  /\bi\s+cannot\s+(?:provide|give|offer)\s+(?:legal|medical|financial|professional)\s+advice\b/gi,
  /\bmy\s+training\s+data\s+(?:only\s+)?(?:goes\s+up\s+to|extends\s+to|ends\s+(?:in|at))\b/gi,
];
const FALSE_CONCESSION = [
  /\bwhile\s+\w+\s+is\s+impressive\b/gi,
  /\balthough\s+\w+\s+has\s+made\s+strides\b/gi,
  /\bdespite\s+\w+\s+challenges?\b/gi,
];
const RHETORICAL_QUESTIONS = [
  /\bbut\s+what\s+does\s+this\s+mean\s+for\b/gi,
  /\bso\s+why\s+should\s+you\s+care\b/gi,
  /\bwhat'?s\s+next\?\s*/gi,
];
const HEDGE_STACK = [
  /\b(?:could|may|might)\s+(?:(?!not\b|never\b|hardly\b|scarcely\b|barely\b)\w+\s+)?(?:potentially|eventually|ultimately|possibly|conceivably)\b/gi,
  /\b(?:potentially|eventually|ultimately)\s+(?:could|may|might)\b/gi,
];
const FUTURE_NARRATIVE = [
  /\b(?:may|could|will|is\s+(?:poised|set)\s+to)\s+become\s+(?:one\s+of\s+)?(?:the\s+)?(?:most\s+)?\w+\s+(?:narratives?|stories|developments?|trends?|movements?|chapters?|themes?|forces?)\b/gi,
  /\bone\s+of\s+the\s+most\s+important\s+(?:narratives?|stories|trends?|themes?)\s+of\s+the\s+(?:next|coming)\s+\w+\b/gi,
];
const REAL_ACTUAL_INFLATION = [
  /\b(?:real|actual|genuine|true)\s+(?:on-?chain\s+)?(?:tokenomics|economics|utility|adoption|sustainability|impact|revenue|fundamentals|demand|value|innovation|traction)\b/gi,
];
const FORMULAIC_OPENERS = [
  /\bin\s+the\s+(?:rapidly\s+|ever-?\s*)?(?:evolving|changing|expanding|growing|shifting)\s+(?:world|landscape|realm|space|field|domain|era)\s+of\b/gi,
  /\bin\s+(?:an?|the)\s+(?:digital\s+)?age\s+(?:where|of)\b/gi,
  /\bas\s+(?:we|the\s+world|society|industries?)\s+(?:continue|move|navigate|enter)\s+(?:to\s+)?(?:evolve|forward|into|through)\b/gi,
  /\bhas\s+emerged\s+as\s+(?:a|the|one\s+of)\s+(?:leading|key|major|critical|essential|fundamental|pivotal|prominent|dominant|important)\s+\w+/gi,
  /\bhas\s+become\s+increasingly\s+(?:important|critical|popular|relevant|prominent|essential)\b/gi,
];
const SPECULATIVE_OPENERS = [
  /\b(?:imagine|picture|envision)(?:\s*,[^,\n]{1,30},)?\s+a\s+(?:world|future|reality)\s+(?:where|in\s+which)\b/gi,
];
const PERFORMED_INSIGHT = [
  /\bsit(?:s|ting)?\s+with\s+(?:that|this)(?=\s*(?:[.!?,;:)\u2013\u2014\u2019"']|for\s+a\s+(?:moment|minute|second|beat)\b|$))(?:\s+for\s+a\s+(?:moment|minute|second|beat))?/gi,
  /\bsit(?:s|ting)?\s+with\s+(?:the|your)\s+(?:discomfort|tension|uncertainty|ambiguity|grief|unease)\b/gi,
  /\b(?:that|this|it|which)(?:['\u2019]s|\s+(?:is|was))\s+not\s+nothing\b/gi,
  /\byou\s+already\s+know\s+the\s+answer\b/gi,
  /\b(?:do\s+not|don['\u2019]t)\s+(?:have\s+to\s+)?take\s+my\s+word\s+for\s+it\b/gi,
  /(?<=^|[.!?]\s|\n)Turns\s+out\b/g,
  /(?:['\u2019]s|\b(?:is|was|are|were))\s+the\s+(?:whole|entire)\s+(?:point|game|ballgame|trick|pitch|idea|play|business\s+model|value\s+proposition)\b/gi,
  /\b(?:that|this)(?:['\u2019]s|\s+(?:is|was))\s+the\s+part\s+(?:that|I|you|we|nobody|no\s+one|most\s+people)\b/gi,
  /\bthe\s+only\s+[\w'\u2019-]+\s+that\s+(?:matters|counts)\b/gi,
  /\bis\s+dead\s*[.;,:\u2013\u2014]\s*long\s+live\b/gi,
  /\b(?:that|this)(?:['\u2019]s|\s+(?:is|was))\s+why\s+[^.!?\n]{0,60}\s+mattered\b/gi,
];
const NEGATION_CHAIN = [
  new RegExp(
    "(?<=^|[.!?]\\s|\\n|[:\u2013\u2014]\\s)No\\s+" +
    "(?!matter\\b|one\\b|doubt\\b|longer\\b|way\\b|less\\b|more\\b|such\\b|other\\b|means\\b)" +
    "[a-z'\u2019-]+(?:\\s+" +
    "(?!(?:in|on|at|of|to|for|with|from|by|is|are|was|were|be|been|being|will|would|can|could|should|shall|may|might|must|have|has|had|do|does|did)\\b)" +
    "[a-z'\u2019-]+)?" +
    "(?:\\s*,\\s*(?:and\\s+|or\\s+|just\\s+)?no\\s+" +
    "(?!matter\\b|one\\b|doubt\\b|longer\\b|way\\b|less\\b|more\\b|such\\b|other\\b|means\\b)" +
    "[a-z'\u2019-]+(?:\\s+" +
    "(?!(?:in|on|at|of|to|for|with|from|by|is|are|was|were|be|been|being|will|would|can|could|should|shall|may|might|must|have|has|had|do|does|did)\\b)" +
    "[a-z'\u2019-]+)?){2,}",
    'gm'
  ),
  /\b(?:did\s+not|didn['\u2019]t)\s+[a-z]+[^,.;!?\n]{0,20},\s*(?:did\s+not|didn['\u2019]t)\s+[a-z]+/gi,
  /\b(?:do\s+not|don['\u2019]t)\s+(?:just\s+)?(\w+)\s+it\b[^.!?\n]{0,60}[.!?;:,]['\u201d\u201c]/gi,
];
const INVISIBLE_HOMOGLYPH = [
  /[\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2060\u2061\u2062\u2063\u2064\u206A\u206B\u206C\u206D\u206E\u206F\uFEFF]/g,
  /[^\x00-\x7F\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g,
];

const AI_TELL_PATTERNS = [
  { name: 'placeholders',        patterns: AI_PLACEHOLDERS,       baseScore: 0.30 },
  { name: 'citation-markup',     patterns: AI_CITATION_MARKUP,    baseScore: 0.32 },
  { name: 'utm-source',          patterns: AI_UTM_SOURCE,         baseScore: 0.30 },
  { name: 'cutoff-disclaimers',  patterns: CUTOFF_DISCLAIMERS,    baseScore: 0.28 },
  { name: 'chatbot-artifacts',   patterns: CHATBOT_ARTIFACTS,     baseScore: 0.25 },
  { name: 'reasoning-artifacts', patterns: REASONING_ARTIFACTS,   baseScore: 0.20 },
  { name: 'sycophantic',         patterns: SYCOPHANTIC,           baseScore: 0.22 },
  { name: 'lingering-attention', patterns: LINGERING_ATTENTION,   baseScore: 0.14 },
  { name: 'emotional-flatline',  patterns: EMOTIONAL_FLATLINE,    baseScore: 0.15 },
  { name: 'novelty-inflation',   patterns: NOVELTY_INFLATION,     baseScore: 0.18 },
  { name: 'formulaic-openers',   patterns: FORMULAIC_OPENERS,     baseScore: 0.14 },
  { name: 'speculative-openers', patterns: SPECULATIVE_OPENERS,   baseScore: 0.15 },
  { name: 'false-concession',    patterns: FALSE_CONCESSION,       baseScore: 0.14 },
  { name: 'significance-inflation', patterns: SIGNIFICANCE_INFLATION, baseScore: 0.18 },
  { name: 'real-actual-inflation', patterns: REAL_ACTUAL_INFLATION, baseScore: 0.18 },
  { name: 'future-narrative',    patterns: FUTURE_NARRATIVE,       baseScore: 0.16 },
  { name: 'vague-attributions',  patterns: VAGUE_ATTRIBUTIONS,    baseScore: 0.20 },
  { name: 'generic-conclusions', patterns: GENERIC_CONCLUSIONS,   baseScore: 0.16 },
  { name: 'lets-patterns',       patterns: LETS_PATTERNS,         baseScore: 0.13 },
  { name: 'rhetorical-questions',patterns: RHETORICAL_QUESTIONS, baseScore: 0.12 },
  { name: 'hedge-stack',         patterns: HEDGE_STACK,           baseScore: 0.11 },
  { name: 'hollow-intensifiers', patterns: HOLLOW_INTENSIFIERS,   baseScore: 0.12 },
  { name: 'transitions',         patterns: TRANSITIONS,           baseScore: 0.10 },
  { name: 'tier1',              patterns: [...TIER1].map(w => new RegExp('\\b' + escapeRegExp(w) + '\\b','gi')), baseScore: 0.18 },
  { name: 'tier2',              patterns: [...TIER2].map(w => new RegExp('\\b' + escapeRegExp(w) + '\\b','gi')), baseScore: 0.12 },
  { name: 'tier3',              patterns: [...TIER3].map(w => new RegExp('\\b' + escapeRegExp(w) + '\\b','gi')), baseScore: 0.07 },
  { name: 'negation-chain',     patterns: NEGATION_CHAIN,         baseScore: 0.22 },
  { name: 'invisible-homoglyph',patterns: INVISIBLE_HOMOGLYPH,   baseScore: 0.35 },
];

function normalizeText(text) {
  let out = text;
  out = out.replace(/[\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2060\u2061\u2062\u2063\u2064\u206A\u206B\u206C\u206D\u206E\u206F\uFEFF]/g, '');
  out = out.replace(/[Ѐ-ӿͰ-Ͽ]/g, (m) => {
    const map = { 'а':'a','е':'e','о':'o','р':'p','с':'c','х':'x','у':'y','к':'k','м':'m','н':'h','в':'b','т':'t','А':'A','Е':'E','О':'O','Р':'P','С':'C','Х':'X','У':'Y','К':'K','М':'M','Н':'H','В':'B','Т':'T','ο':'o','Ο':'O','α':'a','Α':'A','ρ':'p','Ρ':'P' };
    return map[m] || m;
  });
  return out;
}

function tokenize(text) {
  return (text.match(/[a-z0-9]+(?:'[a-z0-9]+)?/gi) || []).map((t) => t.toLowerCase());
}

function getSentences(text) {
  return text.split(/[.!?]+\s+|\n+/).filter((s) => (s.match(/\S+/g) || []).length > 0);
}

function detectStylometry(text) {
  const sentences = getSentences(text);
  const tokens = tokenize(text);
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const signals = [];

  if (sentences.length >= 5) {
    const lengths = sentences.map((s) => tokenize(s).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length;
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;
    if (cv < 0.25 && avg > 10) {
      signals.push({ type: 'uniformity', severity: 12, trigger: `sentence lengths ~${Math.round(avg)} words`, guidance: 'Rhythm uniformity' });
    }
  }

  if (tokens.length >= 200) {
    const unique = new Set(tokens).size;
    const ttr = unique / tokens.length;
    if (ttr < 0.4) {
      signals.push({ type: 'low-ttr', severity: 8, trigger: `TTR=${(ttr * 100).toFixed(1)}%`, guidance: 'Low vocabulary diversity' });
    }
  }

  if (paragraphs.length >= 4) {
    const paraLengths = paragraphs.map((p) => getSentences(p).length);
    const avg = paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length;
    if (avg >= 3 && paraLengths.every((l) => Math.abs(l - avg) <= 1)) {
      signals.push({ type: 'uniformity', severity: 8, trigger: `paragraphs ~${Math.round(avg)} sentences`, guidance: 'Paragraph rhythm uniformity' });
    }
  }

  return signals;
}

function detect(text) {
  if (!text || typeof text !== 'string') {
    return { module: 'ai-writing-tell', score: 0, topSeverity: 0, confidence: 0, count: 0, findings: [] };
  }

  const normalized = normalizeText(text);
  const lowered = normalized.toLowerCase();
  const findings = [];
  const seen = new Set();
  let total = 0;

  for (const entry of AI_TELL_PATTERNS) {
    if (!entry.patterns || !entry.patterns.length) continue;
    let hit = null;
    for (const re of entry.patterns) {
      if (!(re instanceof RegExp)) continue;
      re.lastIndex = 0;
      const m = lowered.match(re);
      if (m && m.length) {
        hit = m[0].slice(0, 80);
        break;
      }
    }
    if (!hit) continue;

    const key = `${entry.name}:${hit.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const severity = Math.min(100, Math.round(entry.baseScore * 100));
    total += entry.baseScore;
    findings.push({ dimension: `ai-tell-${entry.name}`, severity, trigger: hit, guidance: 'AI writing artifact' });
    if (findings.length >= 24) break;
  }

  const stylometry = detectStylometry(normalized);
  for (const s of stylometry) {
    const key = `${s.type}:${s.trigger}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += s.severity / 100;
    findings.push({ dimension: `ai-tell-${s.type}`, severity: s.severity, trigger: s.trigger, guidance: s.guidance });
  }

  findings.sort((a, b) => b.severity - a.severity);
  const top = findings[0]?.severity || 0;
  const confidence = Math.min(1, total);

  return {
    module: 'ai-writing-tell',
    score: Math.min(1, total),
    topSeverity: top,
    confidence,
    count: findings.length,
    findings: findings.slice(0, 12),
  };
}

module.exports = { detect, normalizeText };
