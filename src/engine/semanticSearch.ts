/**
 * engine/semanticSearch.ts — 语义代码搜索 + 增量索引（ULTRA 阶段 C2/C3）
 *
 * C2 语义搜索：自然语言查询 → 关键词提取 → 代码相关性排序（BM25 + 加权）
 * C3 增量索引：mtime+size 指纹只重索引变化的文件；持久化到 .doge/semantic-index.json
 *
 * 设计：
 * - 核心逻辑为纯函数（tokenize / analyzeQuery / indexContent / buildIndex / searchIndex）
 *   → 不访问文件系统，可单元测试
 * - SemanticIndexer 为薄封装：扫描文件 / 持久化 / 增量 / watch
 */

// ============================================================================
// Types
// ============================================================================

export interface IndexedChunk {
  lineStart: number
  lineEnd: number
  content: string
  tokens: string[]
}

export interface IndexedSymbol {
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'const' | 'let' | 'var' | 'method' | 'component'
  line: number
}

export interface IndexedFile {
  path: string
  mtimeMs: number
  size: number
  chunks: IndexedChunk[]
  symbols: IndexedSymbol[]
}

export interface IndexData {
  files: IndexedFile[]
  /** token → 出现该 token 的 chunk 数（BM25 IDF 用） */
  docFreq: Map<string, number>
  totalChunks: number
  avgChunkLen: number
}

export interface SemanticHit {
  filePath: string
  lineNumber: number
  column: number
  content: string
  context?: string
  score: number
  matchedTerms: string[]
  kind?: IndexedSymbol['kind'] | 'content'
}

export interface SymbolHit {
  filePath: string
  name: string
  kind: IndexedSymbol['kind']
  line: number
  score: number
}

export interface SearchOptions {
  maxResults?: number
  fileTypes?: string[]
  directories?: string[]
}

export interface QueryAnalysis {
  /** 关键词（用于内容匹配） */
  terms: string[]
  /** 可能的符号/文件名目标 */
  targets: string[]
  /** 意图动作（找/搜索/解释/修改/删除/测试等） */
  action: string
}

// ============================================================================
// 分词（中英文混合）
// ============================================================================

const STOP_WORDS = new Set(
  'the,and,for,are,but,not,you,all,can,her,was,one,our,out,has,have,that,this,with,from,they,would,there,their,what,about,which,when,make,like,time,just,know,take,people,into,year,your,good,some,could,them,see,other,than,then,now,look,only,come,its,over,think,also,back,after,use,two,how,work,first,well,way,even,new,want,because,any,these,give,day,most,been,had,did,get,got,much,many,where,each,why,still,being,every,between,need,down,should,both,same,last,long,little,own,here,old,tell,may,set,put,end,help,try,function,const,let,var,return,import,export,default,class,interface,type,public,private,async,await,new,this,throw,try,catch,finally,if,else,switch,case,break,continue,while,for,of,in,from,as,extends,implements,static,readonly,get,set,void,true,false,null,undefined,number,string,boolean,object,array,any,unknown,never,keyof,typeof,instanceof,find,search,look,explain,show,list,all,which,where,who,how,what,please,帮我,找出,搜索,查找,看看,解释,说明,显示,列出,所有,相关,关于,的,和,与,在,中,里,为,对,给,把,要,能,可以'.split(','),
)

/** 中英文混合分词：英文词+驼峰拆分，中文 unigram+bigram */
export function tokenize(text: string): string[] {
  const out: string[] = []
  const englishMatches = text.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || []
  for (const word of englishMatches) {
    const lower = word.toLowerCase()
    if (lower.length > 1 && !STOP_WORDS.has(lower)) out.push(lower)
    const parts = word.split(/(?<=[a-z0-9])(?=[A-Z])/)
    if (parts.length > 1) {
      for (const p of parts) {
        const pl = p.toLowerCase()
        if (pl.length > 1 && !STOP_WORDS.has(pl)) out.push(pl)
      }
    }
  }
  const chineseSeq = text.match(/[\u4e00-\u9fff]+/g) || []
  for (const seq of chineseSeq) {
    if (seq.length === 1) {
      out.push(seq)
    } else {
      for (let i = 0; i < seq.length; i++) out.push(seq[i])
      for (let i = 0; i < seq.length - 1; i++) out.push(seq.slice(i, i + 2))
    }
  }
  return [...new Set(out)]
}

// ============================================================================
// 自然语言查询分析
// ============================================================================

const ACTION_RE = /(找出|搜索|查找|看看|解释|说明|显示|列出|搜索|find|search|explain|show|list|locate|get|where|how|what)/i

/** 分析自然语言查询：提取关键词、目标符号、意图动作 */
export function analyzeQuery(query: string): QueryAnalysis {
  const actionM = query.match(ACTION_RE)
  const action = actionM ? actionM[1].toLowerCase() : ''

  // 目标：引号内 / 常见命名 token（驼峰、下划线、点分）
  const targets: string[] = []
  const quoted = query.match(/["'`]([^"'`]+)["'`]/g) || []
  for (const q of quoted) targets.push(q.replace(/["'`]/g, ''))

  // 从中文"X的"、"X相关"、"X函数"等提取
  const cnTargets = query.match(/([\u4e00-\u9fffA-Za-z0-9_]{2,20})(?:的|相关|函数|类|接口|方法|文件|代码|逻辑|实现|定义)/g)
  if (cnTargets) {
    for (const t of cnTargets) targets.push(t.replace(/(的|相关|函数|类|接口|方法|文件|代码|逻辑|实现|定义)$/, ''))
  }

  // 驼峰/下划线/点分符号名
  const nameTargets = query.match(/[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*/g) || []
  for (const n of nameTargets) {
    if (/^(the|and|for|are|but|not|you|all|can|was|one|our|out|has|have|that|this|with|from|they|would|there|their|what|about|which|when|make|like|time|just|know|take|people|into|year|your|good|some|could|them|see|other|than|then|now|look|only|come|its|over|think|also|back|after|use|two|how|work|first|well|way|even|new|want|because|any|these|give|day|most|been|had|did|get|got|much|many|where|each|why|still|being|every|between|need|down|should|both|same|last|long|little|own|here|old|tell|may|set|put|end|help|find|search|look|explain|show|list|locate|get|please)$/i.test(n)) continue
    if (n.length >= 2 && /[A-Z]/.test(n) || n.includes('_') || n.includes('.')) {
      targets.push(n)
    }
  }

  const terms = tokenize(query)
  return {
    terms: [...new Set([...terms, ...targets.map(t => t.toLowerCase())])],
    targets: [...new Set(targets)],
    action,
  }
}

// ============================================================================
// 纯函数：内容分块与符号提取
// ============================================================================

const CHUNK_SIZE = 15
const CHUNK_OVERLAP = 2
const MAX_CHUNKS_PER_FILE = 2000

const SYMBOL_PATTERNS: Array<{ kind: IndexedSymbol['kind']; re: RegExp }> = [
  { kind: 'function', re: /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'class', re: /(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'interface', re: /(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'type', re: /(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'enum', re: /(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'const', re: /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/g },
  { kind: 'let', re: /(?:export\s+)?let\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'var', re: /(?:export\s+)?var\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'method', re: /^\s{2,}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^=]+)?\{/gm },
  { kind: 'component', re: /(?:export\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_$]*)\s*(?:=\s*(?:\([^)]*\)\s*=>|\([^)]*\)\s*=>)|\([^)]*\)\s*(?::[^=]+)?\s*=>|\([^)]*\)\s*\{)/g },
]

/** 提取文件中的符号声明（纯函数） */
export function extractSymbols(content: string): IndexedSymbol[] {
  const symbols: IndexedSymbol[] = []
  const lines = content.split('\n')
  const seen = new Set<string>()

  for (const { kind, re } of SYMBOL_PATTERNS) {
    re.lastIndex = 0
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0
      const m = re.exec(lines[i])
      if (m && m[1]) {
        const key = `${kind}:${m[1]}:${i + 1}`
        if (seen.has(key)) continue
        seen.add(key)
        symbols.push({ name: m[1], kind, line: i + 1 })
      }
    }
  }

  // 去重（同名同类型只保留第一个）
  const nameSeen = new Map<string, IndexedSymbol>()
  for (const s of symbols) {
    const key = `${s.kind}:${s.name}`
    if (!nameSeen.has(key)) nameSeen.set(key, s)
  }
  return Array.from(nameSeen.values())
}

/** 将单个文件内容分块并提取符号（纯函数） */
export function indexContent(content: string, filePath: string, mtimeMs = 0, size = content.length): IndexedFile {
  const lines = content.split('\n')
  const chunks: IndexedChunk[] = []

  for (let start = 0; start < lines.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    if (chunks.length >= MAX_CHUNKS_PER_FILE) break
    const end = Math.min(start + CHUNK_SIZE, lines.length)
    const chunkLines = lines.slice(start, end)
    const contentStr = chunkLines.join('\n')
    const tokens = tokenize(contentStr)
    if (tokens.length === 0) continue
    chunks.push({ lineStart: start + 1, lineEnd: end, content: contentStr, tokens })
  }

  return {
    path: filePath,
    mtimeMs,
    size,
    chunks,
    symbols: extractSymbols(content),
  }
}

/** 汇总多文件为 IndexData，计算 docFreq / avgChunkLen（纯函数） */
export function buildIndex(files: IndexedFile[]): IndexData {
  const docFreq = new Map<string, number>()
  let totalChunks = 0
  let tokenSum = 0

  for (const file of files) {
    for (const chunk of file.chunks) {
      totalChunks++
      tokenSum += chunk.tokens.length
      for (const t of new Set(chunk.tokens)) {
        docFreq.set(t, (docFreq.get(t) ?? 0) + 1)
      }
    }
  }

  return {
    files,
    docFreq,
    totalChunks,
    avgChunkLen: totalChunks > 0 ? tokenSum / totalChunks : 0,
  }
}

// ============================================================================
// 纯函数：BM25 搜索
// ============================================================================

const K1 = 1.2
const B = 0.75

/** 符号名归一化 */
function normalizeSymbolName(name: string): string {
  return name.replace(/[_\-\s]/g, '').toLowerCase()
}

/** 在 IndexData 中执行语义搜索（纯函数，BM25 + 加权） */
export function searchIndex(
  index: IndexData,
  query: string,
  options: SearchOptions = {},
): SemanticHit[] {
  const maxResults = options.maxResults ?? 20
  const analysis = analyzeQuery(query)
  const queryTokens = analysis.terms
  if (queryTokens.length === 0 || index.totalChunks === 0) return []

  const avgLen = index.avgChunkLen || 100
  const N = index.totalChunks
  const queryLower = query.toLowerCase()
  const hits: SemanticHit[] = []

  for (const file of index.files) {
    // 过滤
    if (options.fileTypes && options.fileTypes.length > 0) {
      const ext = file.path.split('.').pop()?.toLowerCase() ?? ''
      if (!options.fileTypes.includes(ext)) continue
    }
    if (options.directories && options.directories.length > 0) {
      if (!options.directories.some(d => file.path.startsWith(d.replace(/\\/g, '/')))) continue
    }

    const fileName = file.path.split('/').pop()?.toLowerCase() ?? ''
    const fileNameNorm = normalizeSymbolName(fileName.replace(/\.[^.]+$/, ''))

    for (const chunk of file.chunks) {
      let score = 0
      const tf = new Map<string, number>()
      for (const t of chunk.tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
      const dl = chunk.tokens.length || 1
      const matchedTerms: string[] = []

      for (const qt of queryTokens) {
        const df = index.docFreq.get(qt) ?? 0
        const tfq = tf.get(qt) ?? 0
        if (tfq === 0) continue
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
        const tfd = (tfq * (K1 + 1)) / (tfq + K1 * (1 - B + B * (dl / avgLen)))
        score += idf * tfd
        matchedTerms.push(qt)
      }

      if (score <= 0) continue

      // 加权：精确内容匹配 / 文件名匹配 / 目标符号匹配
      const chunkLower = chunk.content.toLowerCase()
      if (chunkLower.includes(queryLower)) score *= 1.5
      if (analysis.targets.some(t => chunkLower.includes(t.toLowerCase()))) score *= 1.4
      if (analysis.targets.some(t => fileNameNorm.includes(normalizeSymbolName(t)))) score *= 1.6

      // 找最匹配的行
      let bestLine = chunk.lineStart
      let bestIdx = -1
      const chunkLines = chunk.content.split('\n')
      for (let i = 0; i < chunkLines.length; i++) {
        const lineLower = chunkLines[i].toLowerCase()
        if (queryTokens.some(qt => lineLower.includes(qt)) || (analysis.targets.some(t => lineLower.includes(t.toLowerCase())))) {
          bestIdx = i
          bestLine = chunk.lineStart + i
          break
        }
      }
      const ctxLine = bestIdx >= 0 && bestIdx + 1 < chunkLines.length ? chunkLines[bestIdx + 1] : undefined

      hits.push({
        filePath: file.path,
        lineNumber: bestLine,
        column: 1,
        content: chunkLines[bestIdx >= 0 ? bestIdx : 0]?.trim() || chunk.content,
        context: ctxLine?.trim() || undefined,
        score,
        matchedTerms,
      })
    }
  }

  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, maxResults)
}

/** 符号检索（纯函数） */
export function searchSymbolsInIndex(
  index: IndexData,
  query: string,
  maxResults = 20,
): SymbolHit[] {
  if (!query.trim() || index.files.length === 0) return []
  const qNorm = normalizeSymbolName(query)
  if (!qNorm) return []

  const results: SymbolHit[] = []
  for (const file of index.files) {
    for (const sym of file.symbols) {
      const symNorm = normalizeSymbolName(sym.name)
      let score = 0
      if (symNorm === qNorm) score = 100
      else if (symNorm.startsWith(qNorm)) score = 80
      else if (symNorm.includes(qNorm)) score = 50
      else if (query.length >= 2 && symNorm.includes(query.toLowerCase())) score = 30
      else continue
      const base = file.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
      if (normalizeSymbolName(base).includes(qNorm) || qNorm.includes(normalizeSymbolName(base))) score += 10
      results.push({ filePath: file.path, name: sym.name, kind: sym.kind, line: sym.line, score })
    }
  }
  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return results.slice(0, maxResults)
}

// ============================================================================
// 薄封装：文件扫描 / 持久化 / 增量 / watch
// ============================================================================

const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'java', 'rs', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'swift', 'kt', 'vue', 'svelte', 'mjs', 'cjs'])
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.cache', 'out', 'coverage', '.doge', '.venv', 'venv', '__pycache__'])

export interface IndexerOptions {
  /** 单文件大小上限（默认 1MB） */
  maxFileSize?: number
  /** 是否启用 fs.watch 实时监听 */
  watch?: boolean
}

export interface IndexResult {
  filesIndexed: number
  filesTotal: number
  chunks: number
  symbols: number
  durationMs: number
}

export class SemanticIndexer {
  private files = new Map<string, IndexedFile>()
  private indexData: IndexData | null = null
  private indexFile = ''
  private maxFileSize: number
  private watcher: ReturnType<typeof import('fs').watch> | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private rebuilding = false

  constructor(private projectRoot: string, options: IndexerOptions = {}) {
    this.indexFile = `${this.projectRoot}/.doge/semantic-index.json`
    this.maxFileSize = options.maxFileSize ?? 1024 * 1024
    if (options.watch) this.watch()
  }

  // ─── 持久化 ───

  load(): void {
    try {
      const fs = require('fs')
      if (!fs.existsSync(this.indexFile)) return
      const raw = JSON.parse(fs.readFileSync(this.indexFile, 'utf-8'))
      if (raw.version !== 1 || !raw.files) return
      this.files = new Map()
      for (const f of raw.files as IndexedFile[]) {
        if (f.path && f.chunks) this.files.set(f.path, f)
      }
      this.rebuildIndexData()
    } catch { /* 加载失败则重建 */ }
  }

  save(): void {
    try {
      const fs = require('fs')
      const dir = this.indexFile.slice(0, this.indexFile.lastIndexOf('/'))
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const payload = {
        version: 1,
        files: Array.from(this.files.values()),
      }
      fs.writeFileSync(this.indexFile, JSON.stringify(payload), 'utf-8')
    } catch { /* 保存失败忽略 */ }
  }

  private rebuildIndexData(): void {
    this.indexData = buildIndex(Array.from(this.files.values()))
  }

  // ─── 增量索引 ───

  async index(force = false): Promise<IndexResult> {
    if (this.rebuilding) return this.getLastResult()
    this.rebuilding = true
    const start = Date.now()
    try {
      const fs = require('fs')
      const files = this.scanFiles(fs)
      const knownPaths = new Set(files)
      let filesIndexed = 0

      // 删除已移除的文件
      for (const p of [...this.files.keys()]) {
        if (!knownPaths.has(p)) this.files.delete(p)
      }

      for (const filePath of files) {
        try {
          const stat = fs.statSync(filePath)
          if (stat.size > this.maxFileSize) continue
          const existing = this.files.get(filePath)
          if (!force && existing && existing.mtimeMs === stat.mtimeMs && existing.size === stat.size) continue
          const content = fs.readFileSync(filePath, 'utf-8')
          const indexed = indexContent(content, filePath, stat.mtimeMs, stat.size)
          if (indexed.chunks.length > 0 || indexed.symbols.length > 0) {
            this.files.set(filePath, indexed)
            filesIndexed++
          }
        } catch { /* 单个文件失败跳过 */ }
      }

      this.rebuildIndexData()
      this.save()

      return this.getLastResult(start, files.length)
    } finally {
      this.rebuilding = false
    }
  }

  /** 单个文件增量更新（watch 回调使用） */
  private indexFileNow(fs: any, filePath: string): void {
    try {
      const stat = fs.statSync(filePath)
      if (stat.size > this.maxFileSize) return
      const content = fs.readFileSync(filePath, 'utf-8')
      const indexed = indexContent(content, filePath, stat.mtimeMs, stat.size)
      this.files.set(filePath, indexed)
      this.rebuildIndexData()
      this.save()
    } catch { /* 文件不可读则移除 */ }
  }

  private scanFiles(fs: any): string[] {
    const results: string[] = []
    const walk = (dir: string): void => {
      if (results.length >= 20000) return
      let entries: any[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch { return }
      for (const entry of entries) {
        if (results.length >= 20000) return
        if (entry.name.startsWith('.')) continue
        const fullPath = `${dir}/${entry.name}`
        if (entry.isDirectory()) {
          if (EXCLUDE_DIRS.has(entry.name)) continue
          walk(fullPath)
        } else if (entry.isFile()) {
          const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
          if (CODE_EXTENSIONS.has(ext)) results.push(fullPath)
        }
      }
    }
    walk(this.projectRoot)
    return results
  }

  private getLastResult(startMs?: number, filesTotal = this.files.size): IndexResult {
    let chunks = 0
    let symbols = 0
    for (const f of this.files.values()) {
      chunks += f.chunks.length
      symbols += f.symbols.length
    }
    return {
      filesIndexed: filesTotal,
      filesTotal: this.files.size,
      chunks,
      symbols,
      durationMs: startMs ? Date.now() - startMs : 0,
    }
  }

  // ─── 搜索 ───

  search(query: string, options: SearchOptions = {}): SemanticHit[] {
    if (!this.indexData) this.rebuildIndexData()
    return searchIndex(this.indexData!, query, options)
  }

  searchSymbols(query: string, maxResults = 20): SymbolHit[] {
    if (!this.indexData) this.rebuildIndexData()
    return searchSymbolsInIndex(this.indexData!, query, maxResults)
  }

  // ─── 实时监听（C3） ───

  watch(): void {
    try {
      const fs = require('fs')
      if (this.watcher) this.watcher.close()
      this.watcher = fs.watch(this.projectRoot, { recursive: true }, (_event: string, filename: string | null) => {
        if (!filename) return
        const rel = filename.toString().replace(/\\/g, '/')
        if (rel.startsWith('.')) return
        const parts = rel.split('/')
        if (parts.some(p => EXCLUDE_DIRS.has(p))) return
        const ext = rel.split('.').pop()?.toLowerCase() ?? ''
        if (!CODE_EXTENSIONS.has(ext)) return

        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
          const fullPath = `${this.projectRoot}/${rel}`
          try {
            if (require('fs').existsSync(fullPath)) {
              this.indexFileNow(require('fs'), fullPath)
            } else {
              this.files.delete(fullPath)
              this.rebuildIndexData()
              this.save()
            }
          } catch { /* ignore */ }
        }, 500)
      })
    } catch { /* watch 不可用忽略 */ }
  }

  unwatch(): void {
    if (this.watcher) {
      try { this.watcher.close() } catch { /* ignore */ }
      this.watcher = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }

  getStats(): { files: number; chunks: number; symbols: number; indexSize: number } {
    let chunks = 0
    let symbols = 0
    for (const f of this.files.values()) {
      chunks += f.chunks.length
      symbols += f.symbols.length
    }
    let indexSize = 0
    try {
      const fs = require('fs')
      if (fs.existsSync(this.indexFile)) indexSize = fs.statSync(this.indexFile).size
    } catch { /* ignore */ }
    return { files: this.files.size, chunks, symbols, indexSize }
  }
}

/** 便捷工厂 */
export function createSemanticIndexer(projectRoot: string, options?: IndexerOptions): SemanticIndexer {
  return new SemanticIndexer(projectRoot, options)
}
