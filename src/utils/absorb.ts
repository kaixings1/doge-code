/**
 * 吸收式文本压缩器 — 库函数版
 *
 * 设计定位：作为字符串输出管线中的可插拔环节，在三个关键节点调用：
 *   ① 用户输入之后
 *   ② 注入工具/技能/提示词片段之后
 *   ③ 实际发送给 AI 之前的最后一次彻底压缩
 *
 * 核心能力：
 *   A. 连续重复吸收 —— 同一文本粘贴 N 次，保留 1 次
 *   B. 全局跨调用去重 —— 跨多次调用累积的重复工具定义、模板片段等
 *   C. 结构感知压缩 —— 对 JSON schema、工具定义、XML 标签等做结构化去重
 *   D. 行级快速通道 —— 轻量路径，适合高频调用场景
 */

// ==================== 公共 API ====================

/** 单次压缩入口（无状态，适合每个节点独立调用） */
export function absorb(text: string, opts?: CompressOpts): string {
  return absorbText(text, opts);
}

/** 带统计的压缩（别名） */
export const absorbWithStats = absorbTextWithStats;

/** 获取会话级压缩器实例（跨调用共享缓存，适合全流程使用） */
export function getSessionCompressor(opts?: CompressOpts): SessionCompressor {
  return new SessionCompressor(opts);
}

/** 行级快速压缩（最轻量，适合高频调用） */
export function absorbLines(text: string, minRepeat?: number): string;

// ==================== 类型定义 ====================

export interface CompressOpts {
  /** 连续重复的最小次数（>=2 才触发吸收），默认 2 */
  minRepeat?: number;
  /** 参与全局去重的块最小字符数，默认 30（太短的不比，避免误伤） */
  minBlockSize?: number;
  /** 相似度阈值 0~1，超过视为重复，默认 0.88 */
  similarityThreshold?: number;
  /** 启用连续块吸收，默认 true */
  consecutive?: boolean;
  /** 启用全局去重，默认 true */
  globalDedup?: boolean;
  /** 启用结构化吸收（JSON/XML/工具定义），默认 true */
  structural?: boolean;
  /** 启用行级吸收，默认 true */
  lines?: boolean;
  /** 最小连续重复行数，默认 3 */
  minRepeatLines?: number;
  /** 保留吸收注释还是静默移除，默认 false（静默） */
  annotate?: boolean;
  /** 会话级去重的最大缓存条目数，默认 2000 */
  maxCacheSize?: number;
}

export interface AbsorbResult {
  /** 压缩后文本 */
  text: string;
  /** 原始字符数 */
  originalSize: number;
  /** 压缩后字符数 */
  compressedSize: number;
  /** 节省字符数 */
  saved: number;
  /** 压缩率 0~1 */
  ratio: number;
  /** 各阶段统计 */
  stats: Stats;
}

export interface Stats {
  consecutive: number;    // 连续重复吸收数
  globalDedup: number;    // 全局去重吸收数
  structural: number;     // 结构化吸收数
  lines: number;          // 行级吸收数
  cacheHits: number;      // 会话缓存命中数
}

const DEFAULTS: Required<CompressOpts> = {
  minRepeat: 2,
  minBlockSize: 30,
  similarityThreshold: 0.88,
  consecutive: true,
  globalDedup: true,
  structural: true,
  lines: true,
  minRepeatLines: 3,
  annotate: false,
  maxCacheSize: 2000,
};

/** 单次压缩的最大输入字符数，超过则跳过避免阻塞 */
const MAX_INPUT_LENGTH = 500_000;

// ==================== 文本原语 ====================

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function normalize(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function normForCompare(s: string): string {
  // 比 normalize 更激进：去掉所有空白，只保留内容字符用于哈希比较
  return s.replace(/\s+/g, '').toLowerCase();
}

// ==================== 相似度计算 ====================

function quickSim(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  // 安全上限：超长文本不比较相似度，避免 O(n²) 卡死
  if (a.length > 50_000 || b.length > 50_000) return 0;

  // 短文本：直接 LCS
  if (a.length <= 300 && b.length <= 300) return lcsSim(a, b);

  // 长文本：前缀 + shingles 抽样
  const samples = 16;
  const segLen = Math.min(200, Math.floor(a.length / samples), Math.floor(b.length / samples));
  if (segLen <= 0) return 0;

  let score = 0;
  for (let i = 0; i < samples; i++) {
    const pA = Math.floor((a.length / samples) * i);
    const pB = Math.floor((b.length / samples) * i);
    const sA = a.substring(pA, pA + segLen);
    const sB = b.substring(pB, pB + segLen);
    score += jaccardShingles(sA, sB, 5);
  }
  return score / samples;
}

function lcsSim(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  const rows = m + 1;

  // 用一维数组模拟，节省内存
  let prev = new Uint16Array(rows);
  let curr = new Uint16Array(rows);

  for (let i = 1; i <= n; i++) {
    for (let j = 0; j < rows; j++) {
      if (j === 0) { curr[0] = 0; continue; }
      if (b[i - 1] === a[j - 1]) curr[j] = prev[j - 1] + 1;
      else curr[j] = Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return (2 * prev[m]) / (m + n);
}

function jaccardShingles(a: string, b: string, k: number): number {
  const setA = new Set<string>();
  const setB = new Set<string>();
  for (let i = 0; i <= a.length - k; i++) setA.add(a.substring(i, i + k));
  for (let i = 0; i <= b.length - k; i++) setB.add(b.substring(i, i + k));
  let inter = 0;
  for (const s of setA) { if (setB.has(s)) inter++; }
  const total = setA.size + setB.size;
  return total === 0 ? 0 : (2 * inter) / total;
}

// ==================== 结构化片段提取 ====================

interface Segment {
  text: string;
  normalized: string;
  fingerprint: string;
  type: 'tool' | 'schema' | 'xml' | 'codeblock' | 'paragraph';
}

/** 从文本中提取结构化片段 */
function extractSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1) 工具定义块 —— 匹配 JSON 工具声明
    const toolMatch = detectToolBlock(lines, i);
    if (toolMatch) {
      segments.push({
        text: toolMatch.text,
        normalized: normForCompare(toolMatch.text),
        fingerprint: hash(normForCompare(toolMatch.text)),
        type: 'tool',
      });
      i = toolMatch.endLine;
      continue;
    }

    // 2) 代码块
    const codeMatch = line.match(/^(`{3,}|~{3,})/);
    if (codeMatch) {
      const fence = codeMatch[1];
      let end = i + 1;
      while (end < lines.length && !lines[end].startsWith(fence)) end++;
      const block = lines.slice(i, end + 1).join('\n');
      segments.push({
        text: block,
        normalized: normForCompare(block),
        fingerprint: hash(normForCompare(block)),
        type: 'codeblock',
      });
      i = end + 1;
      continue;
    }

    // 3) XML 标签块
    const xmlMatch = detectXmlBlock(lines, i);
    if (xmlMatch) {
      segments.push({
        text: xmlMatch.text,
        normalized: normForCompare(xmlMatch.text),
        fingerprint: hash(normForCompare(xmlMatch.text)),
        type: 'xml',
      });
      i = xmlMatch.endLine;
      continue;
    }

    // 4) JSON schema / 对象块
    const jsonMatch = detectJsonBlock(lines, i);
    if (jsonMatch) {
      segments.push({
        text: jsonMatch.text,
        normalized: normForCompare(jsonMatch.text),
        fingerprint: hash(normForCompare(jsonMatch.text)),
        type: 'schema',
      });
      i = jsonMatch.endLine;
      continue;
    }

    // 5) 普通段落 —— 连续非空行聚为一组
    const para = collectParagraph(lines, i);
    if (para.text.trim().length > 0) {
      segments.push({
        text: para.text,
        normalized: normForCompare(para.text),
        fingerprint: hash(normForCompare(para.text)),
        type: 'paragraph',
      });
    }
    i = para.endLine;
  }

  return segments;
}

/** 检测工具定义块（函数声明 + JSON 工具描述） */
function detectToolBlock(lines: string[], start: number): { text: string; endLine: number } | null {
  // 匹配 "type ToolName =" 或 "function ToolName" 或类似模式
  const toolPatterns = [
    /^(export\s+)?(const|let|var|function)\s+(\w+)\s*[:=].*(?:tool|Tool|handler|Handler)/i,
    /^type\s+\w+Tool/i,
    /^\{[\s\S]*?"type"\s*:\s*"(function|tool)"/,
  ];

  // 简单启发式：包含 "tools" 或 "tool" 的多行 JSON 对象
  let depth = 0;
  let started = false;
  let braceStart = -1;

  for (let i = start; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // 检测工具数组或对象
    if (/^\s*"tools"\s*:/.test(trimmed) || /^\s*tools\s*[:=]/.test(trimmed)) {
      started = true;
      braceStart = i;
      depth = (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;
      continue;
    }

    // 检测独立的工具定义 JSON
    if (/^\{\s*$/.test(trimmed) && !started) {
      // 检查接下来的行是否包含 tool 相关字段
      let hasToolFields = false;
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        if (/"(name|description|parameters|input_schema|type)"\s*:/.test(lines[j].trim())) {
          hasToolFields = true;
          break;
        }
        if (lines[j].trim() === '}') break;
      }
      if (hasToolFields) {
        started = true;
        braceStart = i;
        depth = 1;
        continue;
      }
    }

    if (started) {
      depth += (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;
      if (depth <= 0) {
        const text = lines.slice(braceStart, i + 1).join('\n');
        if (text.length > 50) {
          return { text, endLine: i + 1 };
        }
        return null;
      }
    }

    // 安全限制：最多扫描 100 行
    if (i - start > 100) return null;
  }

  return null;
}

/** 检测 XML 标签块 */
function detectXmlBlock(lines: string[], start: number): { text: string; endLine: number } | null {
  for (let i = start; i < Math.min(start + 3, lines.length); i++) {
    const trimmed = lines[i].trim();
    if (/^<\w+[^>]*>/.test(trimmed)) {
      // 找到开始标签，找结束标签
      const tagName = trimmed.match(/^<(\w+)/)?.[1];
      if (tagName) {
        const closeTag = `</${tagName}>`;
        for (let j = i + 1; j < Math.min(i + 200, lines.length); j++) {
          if (lines[j].trim() === closeTag || lines[j].trim().startsWith('</')) {
            const text = lines.slice(i, j + 1).join('\n');
            return { text, endLine: j + 1 };
          }
        }
      }
    }
  }
  return null;
}

/** 检测 JSON 块 */
function detectJsonBlock(lines: string[], start: number): { text: string; endLine: number } | null {
  for (let i = start; i < Math.min(start + 5, lines.length); i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let depth = 0;
      let began = false;
      for (let j = i; j < Math.min(i + 200, lines.length); j++) {
        const t = lines[j].trim();
        if (!began && t.length > 0) began = true;
        if (began) {
          depth += (t.match(/[\[{]/g) || []).length - (t.match(/[\]}]/g) || []).length;
          if (depth <= 0) {
            const text = lines.slice(i, j + 1).join('\n');
            if (text.length > 30) return { text, endLine: j + 1 };
            return null;
          }
        }
      }
    }
  }
  return null;
}

/** 收集连续段落 */
function collectParagraph(lines: string[], start: number): { text: string; endLine: number } {
  // 空行直接跳过，避免 extractSegments 中 i 不推进导致死循环
  if (lines[start].trim() === '') {
    return { text: '', endLine: start + 1 };
  }
  let end = start;
  while (end < lines.length && lines[end].trim() !== '') {
    end++;
  }
  return {
    text: lines.slice(start, end).join('\n'),
    endLine: end,
  };
}

// ==================== 会话级压缩器 ====================

/** 跨调用共享缓存，实现"注入工具前后"的跨调用去重 */
export class SessionCompressor {
  private cache: Map<string, string> = new Map(); // fingerprint -> originalText
  private stats: Stats = {
    consecutive: 0,
    globalDedup: 0,
    structural: 0,
    lines: 0,
    cacheHits: 0,
  };
  private opts: Required<CompressOpts>;

  constructor(opts: CompressOpts = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  /**
   * 主压缩方法 — 可在三个节点调用：
   *   compressor.feed(text)        ← 输入后
   *   compressor.inject(text)      ← 注入工具后（轻量）
   *   compressor.finalize(text)    ← 发送前（最彻底）
   */
  feed(text: string): string {
    return this.compress(text, { structural: false, globalDedup: false });
  }

  inject(text: string): string {
    return this.compress(text, { structural: true, globalDedup: false, lines: false });
  }

  finalize(text: string): string {
    return this.compress(text, { structural: true, globalDedup: true, lines: true });
  }

  /** 通用压缩（内部） */
  compress(text: string, overrides: Partial<CompressOpts> = {}): string {
    return this.compressWithStats(text, overrides).text;
  }

  compressWithStats(text: string, overrides: Partial<CompressOpts> = {}): AbsorbResult {
    const opts = { ...this.opts, ...overrides };
    let result = text;
    const stats: Stats = { ...this.stats };

    // ---- Pass 1: 行级快速吸收（最低成本） ----
    if (opts.lines) {
      const r = absorbLinesPass(result, opts.minRepeatLines, opts.annotate);
      result = r.text;
      stats.lines += r.removed;
    }

    // ---- Pass 2: 结构化提取 ----
    let segments: Segment[] = [];
    if (opts.structural) {
      segments = extractSegments(result);
    }

    // ---- Pass 3: 连续重复吸收 ----
    if (opts.consecutive) {
      const r = absorbConsecutive(result, opts.minRepeat, opts.annotate);
      result = r.text;
      stats.consecutive += r.removed;
    }

    // ---- Pass 4: 全局去重（含会话缓存） ----
    if (opts.globalDedup && segments.length > 0) {
      const r = dedupSegments(segments, result, opts, this.cache);
      result = r.text;
      stats.globalDedup += r.removed;
      stats.cacheHits += r.cacheHits;
      this.pruneCache();
    }

    // 更新累计统计
    this.stats = stats;

    const originalSize = text.length;
    const compressedSize = result.length;
    const saved = originalSize - compressedSize;

    return {
      text: result,
      originalSize,
      compressedSize,
      saved,
      ratio: originalSize > 0 ? saved / originalSize : 0,
      stats,
    };
  }

  /** 重置会话缓存 */
  reset(): void {
    this.cache.clear();
    this.stats = { consecutive: 0, globalDedup: 0, structural: 0, lines: 0, cacheHits: 0 };
  }

  /** 获取累计统计 */
  getStats(): Stats {
    return { ...this.stats };
  }

  /** 手动注册已知重复项（用于主动缓存工具定义） */
  register(text: string): void {
    const fp = hash(normForCompare(text));
    this.cache.set(fp, text);
    this.pruneCache();
  }

  private pruneCache(): void {
    if (this.cache.size > this.opts.maxCacheSize) {
      // 淘汰最早的 20%
      const keys = Array.from(this.cache.keys());
      const drop = Math.floor(this.opts.maxCacheSize * 0.2);
      for (let i = 0; i < drop; i++) {
        this.cache.delete(keys[i]);
      }
    }
  }
}

// ==================== 各 Pass 实现 ====================

/** Pass 1: 行级吸收 */
function absorbLinesPass(text: string, minRepeat: number, annotate: boolean): { text: string; removed: number } {
  const lines = text.split('\n');
  const out: string[] = [];
  let removed = 0;
  let prev = '';
  let count = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === prev && trimmed !== '') {
      count++;
      if (count >= minRepeat) {
        removed++;
        continue;
      }
    } else {
      if (count >= minRepeat && annotate) {
        out.push(`<!-- [重复 ${count} 次] -->`);
      }
      count = 1;
    }
    out.push(line);
    prev = trimmed;
  }

  if (count >= minRepeat && annotate) {
    out.push(`<!-- [重复 ${count} 次] -->`);
  }

  return { text: out.join('\n'), removed };
}

/** Pass 3: 连续块吸收（基于正则分块） */
function absorbConsecutive(text: string, minRepeat: number, annotate: boolean): { text: string; removed: number } {
  // 用分隔符将文本切成块
  const chunks = splitChunks(text);
  const out: string[] = [];
  let removed = 0;
  let i = 0;

  while (i < chunks.length) {
    const group = [chunks[i]];
    const norm0 = normForCompare(chunks[i]);
    let j = i + 1;

    while (j < chunks.length && normForCompare(chunks[j]) === norm0) {
      group.push(chunks[j]);
      j++;
    }

    if (group.length >= minRepeat) {
      out.push(group[0]);
      if (group.length > 1 && annotate) {
        out.push(`<!-- [重复 ${group.length} 次] -->`);
      }
      removed += group.length - 1;
    } else {
      out.push(...group);
    }
    i = j;
  }

  return { text: out.join('\n\n'), removed };
}

/** 将文本按双换行分隔切成块 */
function splitChunks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(c => c.trim())
    .filter(c => c.length > 0);
}

/** Pass 4: 全局去重（使用会话缓存 + 片段级比较） */
function dedupSegments(
  segments: Segment[],
  originalText: string,
  opts: Required<CompressOpts>,
  cache: Map<string, string>,
): { text: string; removed: number; cacheHits: number } {
  const threshold = opts.similarityThreshold;
  const minSize = opts.minBlockSize;
  let removed = 0;
  let cacheHits = 0;
  const seenFingerprints = new Set<string>();
  const seenNorm = new Map<string, Segment>(); // normalized -> first segment

  // 先收集缓存中已有的指纹
  for (const fp of cache.keys()) {
    seenFingerprints.add(fp);
  }

  // 决定哪些块需要缓存（只缓存大块）
  const cacheable = (seg: Segment) =>
    seg.type !== 'paragraph' && seg.text.length >= 100;

  const keptSegments: Segment[] = [];

  for (const seg of segments) {
    if (seg.text.length < minSize) {
      keptSegments.push(seg);
      continue;
    }

    // 精确匹配：缓存命中
    if (seenFingerprints.has(seg.fingerprint)) {
      removed++;
      cacheHits++;
      continue;
    }

    // 精确匹配：本次已经出现过
    if (cacheable(seg)) {
      cache.set(seg.fingerprint, seg.text);
      seenFingerprints.add(seg.fingerprint);
    }

    // 相似匹配（只对大块做）——限制比较次数避免 O(n²) 卡死
    if (seg.text.length >= minSize * 3) {
      let foundSimilar = false;
      let comparisons = 0;
      const maxComparisons = 200; // 上限：超过则放弃相似度匹配
      for (const [norm, existing] of seenNorm) {
        if (norm === seg.normalized) continue; // 精确相同已处理
        if (++comparisons > maxComparisons) break;
        const sim = quickSim(seg.normalized, norm);
        if (sim >= threshold) {
          removed++;
          foundSimilar = true;
          break;
        }
      }
      if (!foundSimilar) {
        seenNorm.set(seg.normalized, seg);
        keptSegments.push(seg);
      }
    } else {
      keptSegments.push(seg);
    }
  }

  // 重建文本：保留原始顺序，移除被去重的块
  // 策略：保留所有段落，仅移除重复的结构化块
  // 为简化，这里返回保留后的段落的拼接
  const keptSet = new Set(keptSegments);
  let keptCount = 0;
  const outParts: string[] = [];

  for (const seg of segments) {
    if (keptSet.has(seg) || seg.text.length < minSize) {
      outParts.push(seg.text);
      keptCount++;
    }
  }

  const text = outParts.join('\n\n');

  return { text, removed, cacheHits };
}

// ==================== 便捷无状态函数 ====================

/** 单次调用压缩（最简接口） */
export function absorbText(text: string, opts?: CompressOpts): string {
  if (text.length > MAX_INPUT_LENGTH) return text;
  const o = { ...DEFAULTS, ...opts };
  let result = text;

  if (o.lines) {
    result = absorbLinesPass(result, o.minRepeatLines, o.annotate).text;
  }

  if (o.consecutive) {
    result = absorbConsecutive(result, o.minRepeat, o.annotate).text;
  }

  if (o.structural || o.globalDedup) {
    const segments = extractSegments(result);
    if (segments.length > 1) {
      const cache = new Map<string, string>();
      const r = dedupSegments(segments, result, o, cache);
      result = r.text;
    }
  }

  return result;
}

/** 带统计的单次调用压缩 */
export function absorbTextWithStats(text: string, opts?: CompressOpts): AbsorbResult {
  const o = { ...DEFAULTS, ...opts };
  let result = text;
  const stats: Stats = {
    consecutive: 0,
    globalDedup: 0,
    structural: 0,
    lines: 0,
    cacheHits: 0,
  };

  if (o.lines) {
    const r = absorbLinesPass(result, o.minRepeatLines, o.annotate);
    result = r.text;
    stats.lines += r.removed;
  }

  if (opts.consecutive !== false) {
    const r = absorbConsecutive(result, o.minRepeat, o.annotate);
    result = r.text;
    stats.consecutive += r.removed;
  }

  if (o.structural || o.globalDedup) {
    const segments = extractSegments(result);
    if (segments.length > 1) {
      const cache = new Map<string, string>();
      const r = dedupSegments(segments, result, o, cache);
      result = r.text;
      stats.globalDedup += r.removed;
      stats.cacheHits += r.cacheHits;
    }
  }

  const originalSize = text.length;
  const compressedSize = result.length;
  const saved = originalSize - compressedSize;

  return {
    text: result,
    originalSize,
    compressedSize,
    saved,
    ratio: originalSize > 0 ? saved / originalSize : 0,
    stats,
  };
}

/** 快速行级压缩（开销最低，适合每个节点都用） */
export function absorbLines(text: string, minRepeat = 3): string {
  return absorbLinesPass(text, minRepeat, false).text;
}
