/**
 * Okapi BM25 检索（纯 stdlib，零依赖）
 *
 * 吸收自 claude-obsidian 的 scripts/bm25-index.py（Python stdlib 实现）。
 * 与已有的 /rag（TF-IDF）互补：
 *   - TF-IDF：快、够用，适合"找哪个文件提到过 X"
 *   - BM25：带文档长度归一（k1/b），长文档不会因为词多而碾压短文档，
 *     更适合"在一堆长短不一的笔记里找最相关的那篇"
 *
 * 中文切分沿用 localRag 的字 + 二元组策略（无词典分词）。
 * 参数默认 k1=1.5, b=0.75（与原实现一致）。
 */

import { tokenize } from './localRag.js'

export interface Bm25Doc {
  id: string
  text: string
  /** 展示用路径或标题 */
  path?: string
}

export interface Bm25Hit {
  id: string
  path: string
  score: number
  snippet: string
  line: number
}

export interface Bm25Options {
  k1?: number
  b?: number
}

/** 极小的 ASCII 停用词表：宁缺毋滥，中文不设停用词。 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'it', 'for', 'on',
  'that', 'this', 'with', 'as', 'be', 'are', 'was', 'were', 'by', 'at', 'from',
])

function tokenizeForBm25(text: string): string[] {
  const raw = tokenize(text)
  const out: string[] = []
  for (const t of raw) {
    if (STOPWORDS.has(t)) continue
    out.push(t)
  }
  return out
}

export class Bm25Index {
  private readonly k1: number
  private readonly b: number
  private readonly docs: Bm25Doc[]
  private readonly tf: Map<string, Map<string, number>> = new Map()
  private readonly dl: Map<string, number> = new Map()
  private readonly df: Map<string, number> = new Map()
  private avgDl = 0

  constructor(docs: Bm25Doc[], opts: Bm25Options = {}) {
    this.k1 = opts.k1 ?? 1.5
    this.b = opts.b ?? 0.75
    this.docs = docs

    let total = 0
    for (const doc of docs) {
      const tokens = tokenizeForBm25(doc.text)
      this.dl.set(doc.id, tokens.length)
      total += tokens.length
      const counts = new Map<string, number>()
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1)
      this.tf.set(doc.id, counts)
      for (const term of counts.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1)
    }
    this.avgDl = docs.length > 0 ? total / docs.length : 0
  }

  get size(): number {
    return this.docs.length
  }

  /** 某个词的文档频率（用于诊断/调参）。 */
  documentFrequency(term: string): number {
    return this.df.get(term) ?? 0
  }

  search(query: string, limit = 8): Bm25Hit[] {
    const qTerms = tokenizeForBm25(query)
    if (qTerms.length === 0) return []
    const unique = Array.from(new Set(qTerms))

    const N = this.docs.length
    const hits: Bm25Hit[] = []

    for (const doc of this.docs) {
      const counts = this.tf.get(doc.id)!
      const dl = this.dl.get(doc.id) ?? 0
      if (dl === 0) continue

      let score = 0
      for (const term of unique) {
        const f = counts.get(term) ?? 0
        if (f === 0) continue
        const df = this.df.get(term) ?? 0
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
        const denom = f + this.k1 * (1 - this.b + (this.b * dl) / (this.avgDl || 1))
        score += idf * ((f * (this.k1 + 1)) / denom)
      }
      if (score <= 0) continue

      const { snippet, line } = bestLine(doc.text, new Set(unique))
      hits.push({ id: doc.id, path: doc.path ?? doc.id, score, snippet, line })
    }

    hits.sort((a, b) => b.score - a.score)
    return hits.slice(0, limit)
  }
}

function bestLine(text: string, terms: Set<string>, width = 140): { snippet: string; line: number } {
  const lines = text.split(/\r?\n/)
  let bestIdx = 0
  let best = -1
  for (let i = 0; i < lines.length; i++) {
    let s = 0
    for (const t of tokenizeForBm25(lines[i])) if (terms.has(t)) s++
    if (s > best) {
      best = s
      bestIdx = i
    }
  }
  const raw = (lines[bestIdx] ?? '').trim()
  return { snippet: raw.length > width ? raw.slice(0, width) + '…' : raw, line: bestIdx + 1 }
}
