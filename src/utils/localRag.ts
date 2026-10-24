/**
 * 本地语料检索（零依赖 TF-IDF）
 *
 * 思路吸收自 claw-code-ollama 的 skills/rag_skill.py + connectivity.py：
 * 离线时用本地知识库替代联网检索。上游依赖 ChromaDB + sentence-transformers，
 * 需要 Python 运行时与模型下载；这里换成纯 JS 的 TF-IDF，代价是语义泛化稍弱，
 * 收益是零安装、零网络、可在任何 Node/Bun 环境跑。
 *
 * 适用范围（有意为之的简化）：
 *   - 语料规模在数千文件内（全量建索引在内存里完成）
 *   - 中文按字二元组切分（无词典分词），英文按词切分
 *   - 不做停用词表，靠 IDF 自然压制高频词
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { extname, join } from 'path'

export interface RagDoc {
  path: string
  text: string
  /** 原文长度（字符数），用于截取展示片段 */
  length: number
}

export interface RagHit {
  path: string
  score: number
  snippet: string
  line: number
}

const TEXT_EXTS = new Set(['.md', '.txt', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.py', '.rs', '.go', '.java', '.kt', '.yml', '.yaml', '.toml'])
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.doge', 'vendor', 'temp', '.next', 'target'])
const MAX_FILE_BYTES = 512 * 1024

/** 中英混合切词：英文按词，中文按二元组。 */
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  const lowered = text.toLowerCase()
  const re = /[a-z0-9_$]+|[\u4e00-\u9fff]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(lowered))) {
    const chunk = m[0]
    if (/^[a-z0-9_$]+$/.test(chunk)) {
      if (chunk.length >= 2) tokens.push(chunk)
      continue
    }
    // 中文：单字 + 二元组（单字用于短查询命中，二元组提供区分度）
    for (let i = 0; i < chunk.length; i++) {
      tokens.push(chunk[i])
      if (i + 1 < chunk.length) tokens.push(chunk.slice(i, i + 2))
    }
  }
  return tokens
}

export function walkCorpus(root: string, maxFiles = 2000): RagDoc[] {
  const docs: RagDoc[] = []
  const stack = [root]
  while (stack.length > 0 && docs.length < maxFiles) {
    const cur = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(cur)
    } catch {
      continue
    }
    for (const name of entries) {
      if (docs.length >= maxFiles) break
      if (name.startsWith('.') && name !== '.github') continue
      const full = join(cur, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) stack.push(full)
        continue
      }
      if (!TEXT_EXTS.has(extname(name).toLowerCase())) continue
      if (st.size > MAX_FILE_BYTES) continue
      try {
        docs.push({ path: full, text: readFileSync(full, 'utf8'), length: st.size })
      } catch {
        // 读取失败（权限/编码）时跳过该文件，不影响整体检索
      }
    }
  }
  return docs
}

export class LocalRagIndex {
  private docs: RagDoc[] = []
  private df = new Map<string, number>()
  private docTokens: string[][] = []

  constructor(docs: RagDoc[]) {
    this.docs = docs
    this.docTokens = docs.map(d => tokenize(d.text))
    for (const tokens of this.docTokens) {
      const seen = new Set(tokens)
      for (const t of seen) this.df.set(t, (this.df.get(t) ?? 0) + 1)
    }
  }

  static build(root: string, maxFiles?: number): LocalRagIndex {
    return new LocalRagIndex(walkCorpus(root, maxFiles))
  }

  get size(): number {
    return this.docs.length
  }

  /** 序列化为可落盘的轻量快照（不含原始文本时只存路径+词频，节省空间）。 */
  toSnapshot(): RagSnapshot {
    return {
      version: 1,
      docs: this.docs.map((d, i) => ({
        path: d.path,
        length: d.length,
        tf: countTokens(this.docTokens[i]),
      })),
      df: Object.fromEntries(this.df),
    }
  }

  static fromSnapshot(snap: RagSnapshot): LocalRagIndex {
    const idx = new LocalRagIndex([])
    idx.docs = snap.docs.map(d => ({ path: d.path, text: '', length: d.length }))
    idx.docTokens = snap.docs.map(d => expandTf(d.tf))
    idx.df = new Map(Object.entries(snap.df))
    return idx
  }

  private idf(term: string): number {
    const n = this.docs.length
    const d = this.df.get(term) ?? 0
    return d === 0 ? 0 : Math.log(1 + n / d)
  }

  /**
   * 检索。快照索引不含原文，此时没有片段可给，snippet 为空串。
   */
  search(query: string, limit = 8): RagHit[] {
    const qTokens = tokenize(query)
    if (qTokens.length === 0) return []
    const qSet = new Set(qTokens)

    const scored: RagHit[] = []
    for (let i = 0; i < this.docs.length; i++) {
      const tokens = this.docTokens[i]
      if (tokens.length === 0) continue

      // 词频（按文档长度归一）
      const tf = new Map<string, number>()
      for (const t of tokens) {
        if (qSet.has(t)) tf.set(t, (tf.get(t) ?? 0) + 1)
      }
      if (tf.size === 0) continue

      let score = 0
      for (const [term, freq] of tf) {
        score += (freq / Math.sqrt(tokens.length)) * this.idf(term)
      }
      if (score <= 0) continue

      const doc = this.docs[i]
      const { snippet, line } = doc.text
        ? extractSnippet(doc.text, qSet)
        : { snippet: '', line: 0 }
      scored.push({ path: doc.path, score, snippet, line })
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }
}

export interface RagSnapshot {
  version: 1
  docs: Array<{ path: string; length: number; tf: Record<string, number> }>
  df: Record<string, number>
}

/** 压缩词频：只保留出现过的词及其计数。 */
export function countTokens(tokens: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of tokens) out[t] = (out[t] ?? 0) + 1
  return out
}

/** 把词频表展开回 token 序列（顺序被展平；归一化只用长度，故顺序无关）。 */
export function expandTf(tf: Record<string, number>): string[] {
  const out: string[] = []
  for (const [term, n] of Object.entries(tf)) {
    for (let i = 0; i < n; i++) out.push(term)
  }
  return out
}

/** 取命中密度最高的一行附近作为片段。 */
export function extractSnippet(text: string, qSet: Set<string>, width = 120): { snippet: string; line: number } {
  const lines = text.split(/\r?\n/)
  let bestLine = 0
  let bestScore = -1
  for (let i = 0; i < lines.length; i++) {
    const lineTokens = tokenize(lines[i])
    let s = 0
    for (const t of lineTokens) if (qSet.has(t)) s++
    if (s > bestScore) {
      bestScore = s
      bestLine = i
    }
  }
  const raw = (lines[bestLine] ?? '').trim()
  const snippet = raw.length > width ? raw.slice(0, width) + '…' : raw
  return { snippet, line: bestLine + 1 }
}
