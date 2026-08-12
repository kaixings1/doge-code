/**
 * localIndex.ts — 本地代码索引引擎
 *
 * 为语义搜索提供持久化的本地索引：
 * - 扫描项目 → 按行块 chunk 化 → token 提取（中文 unigram+bigram / 英文词 / 驼峰拆分）
 * - BM25 评分（k1=1.2, b=0.75）
 * - 增量更新：文件 mtime+size 指纹变化才重索引
 * - 持久化：写入 .doge/index.json，重启无需全量重建
 * - fs.watch 实时监听文件变化，自动增量更新
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── 类型 ───

export interface IndexedChunk {
  lineStart: number
  lineEnd: number
  content: string
  tokens: string[]
}

export interface IndexedSymbol {
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'let' | 'var' | 'method' | 'component'
  line: number
}

export interface IndexedFile {
  path: string
  mtimeMs: number
  size: number
  chunks: IndexedChunk[]
  symbols: IndexedSymbol[]
}

export interface SymbolSearchResult {
  filePath: string
  name: string
  kind: IndexedSymbol['kind']
  line: number
  score: number
}

export interface SearchResult {
  filePath: string
  lineNumber: number
  column: number
  content: string
  context?: string
  score: number
}

export interface IndexStats {
  fileCount: number
  chunkCount: number
  indexSize: number
  lastIndexedAt: number
  totalTokens: number
}

const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'java', 'rs', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'swift', 'kt', 'css', 'scss', 'html', 'vue', 'svelte', 'json', 'md', 'yaml', 'yml', 'toml', 'sql', 'sh', 'mjs', 'cjs'])
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.cache', 'out', 'coverage', '.doge', '.venv', 'venv', '__pycache__'])
const STOP_WORDS = new Set('the,and,for,are,but,not,you,all,can,her,was,one,our,out,has,have,that,this,with,from,they,would,there,their,what,about,which,when,make,like,time,just,know,take,people,into,year,your,good,some,could,them,see,other,than,then,now,look,only,come,its,over,think,also,back,after,use,two,how,work,first,well,way,even,new,want,because,any,these,give,day,most,been,had,did,get,got,much,many,where,each,why,still,being,every,between,need,down,should,both,same,last,long,little,own,here,old,tell,may,set,put,end,help,try,function,const,let,var,return,import,export,default,class,interface,type,public,private,async,await,new,this,throw,try,catch,finally,if,else,switch,case,break,continue,while,for,of,in,from,as,extends,implements,static,readonly,get,set,void,true,false,null,undefined,number,string,boolean,object,array,any,unknown,never,keyof,typeof,instanceof'.split(','))

// ─── tokenize（中英文混合） ───

function tokenize(text: string): string[] {
  const out: string[] = []
  // 英文/数字词 + 驼峰拆分
  const englishMatches = text.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || []
  for (const word of englishMatches) {
    const lower = word.toLowerCase()
    if (lower.length > 1 && !STOP_WORDS.has(lower)) out.push(lower)
    // 驼峰拆分：fetchUserData → fetch / user / data
    const parts = word.split(/(?<=[a-z0-9])(?=[A-Z])/)
    if (parts.length > 1) {
      for (const p of parts) {
        const pl = p.toLowerCase()
        if (pl.length > 1 && !STOP_WORDS.has(pl)) out.push(pl)
      }
    }
  }
  // 中文：unigram + 相邻 bigram
  const chineseSeq = text.match(/[\u4e00-\u9fff]+/g) || []
  for (const seq of chineseSeq) {
    if (seq.length === 1) {
      out.push(seq)
    } else {
      for (let i = 0; i < seq.length; i++) out.push(seq[i])
      for (let i = 0; i < seq.length - 1; i++) out.push(seq.slice(i, i + 2))
    }
  }
  return out
}

// ─── 符号提取（函数/类/接口/变量声明） ───

const SYMBOL_PATTERNS: Array<{ kind: IndexedSymbol['kind']; re: RegExp }> = [
  { kind: 'function', re: /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'class', re: /(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'interface', re: /(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'type', re: /(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'const', re: /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/g },
  { kind: 'let', re: /(?:export\s+)?let\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'var', re: /(?:export\s+)?var\s+([A-Za-z_$][\w$]*)/g },
  { kind: 'method', re: /^\s{2,}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^=]+)?\{/gm },
  { kind: 'component', re: /(?:export\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_$]*)\s*(?:=\s*(?:\([^)]*\)\s*=>|\([^)]*\)\s*=>)|\([^)]*\)\s*(?::[^=]+)?\s*=>|\([^)]*\)\s*\{)/g },
]

/** 提取文件中的符号声明 */
function extractSymbols(content: string): IndexedSymbol[] {
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

/** 符号名归一化（小写 + 下划线转驼峰片段） */
function normalizeSymbolName(name: string): string {
  return name.replace(/[_\-\s]/g, '').toLowerCase()
}

// ─── BM25 参数 ───

const K1 = 1.2
const B = 0.75

// ─── 索引引擎 ───

export class CodeIndexer {
  private files = new Map<string, IndexedFile>()
  private docFreq = new Map<string, number>() // token -> 出现 chunk 数
  private totalChunks = 0
  private avgChunkLen = 0
  private indexFile = ''
  private watcher: fs.FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private lastIndexedAt = 0
  private rebuilding = false

  constructor(private projectRoot: string) {
    this.indexFile = path.join(projectRoot, '.doge', 'index.json')
  }

  // ─── 持久化 ───

  load(): void {
    try {
      if (!fs.existsSync(this.indexFile)) return
      const raw = JSON.parse(fs.readFileSync(this.indexFile, 'utf-8'))
      if (raw.version !== 1 || !raw.files) return
      this.files = new Map()
      this.docFreq = new Map(Object.entries(raw.docFreq || {}))
      this.totalChunks = raw.totalChunks || 0
      this.avgChunkLen = raw.avgChunkLen || 0
      this.lastIndexedAt = raw.lastIndexedAt || 0
      for (const f of raw.files as IndexedFile[]) {
        if (f.path && f.mtimeMs && f.chunks) {
          if (!f.symbols) f.symbols = []
          this.files.set(f.path, f)
        }
      }
      console.log(`[INDEX] 加载持久化索引: ${this.files.size} 文件, ${this.totalChunks} chunks`)
    } catch (e) {
      console.warn(' 错误: [INDEX] 加载索引失败，将重建:', e)
      this.files.clear()
    }
  }

  save(): void {
    try {
      const dir = path.dirname(this.indexFile)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const payload = {
        version: 1,
        lastIndexedAt: this.lastIndexedAt,
        totalChunks: this.totalChunks,
        avgChunkLen: Math.round(this.avgChunkLen * 100) / 100,
        docFreq: Object.fromEntries(this.docFreq),
        files: Array.from(this.files.values()),
      }
      fs.writeFileSync(this.indexFile, JSON.stringify(payload), 'utf-8')
    } catch (e) {
      console.warn(' 错误: [INDEX] 保存索引失败:', e)
    }
  }

  // ─── 索引构建 ───

  /**
   * 增量重建：检查 mtime+size，仅重索引变化的文件
   */
  async rebuild(force = false): Promise<IndexStats> {
    if (this.rebuilding) return this.getStats()
    this.rebuilding = true
    try {
      const files = this.scanFiles()
      const now = Date.now()
      let dirty = 0

      // 找出被删除的文件
      const knownPaths = new Set(files)
      for (const p of [...this.files.keys()]) {
        if (!knownPaths.has(p)) {
          this.removeFile(p)
          dirty++
        }
      }

      for (const filePath of files) {
        try {
          const stat = fs.statSync(filePath)
          const existing = this.files.get(filePath)
          if (!force && existing && existing.mtimeMs === stat.mtimeMs && existing.size === stat.size) {
            continue // 未变化
          }
          this.indexFileNow(filePath, stat.mtimeMs, stat.size)
          dirty++
        } catch { /* 文件读取失败跳过 */ }
      }

      this.lastIndexedAt = now
      this.save()
      console.log(`[INDEX] 重建完成: ${dirty} 文件更新, 共 ${this.files.size} 文件, ${this.totalChunks} chunks, ${(Date.now() - now)}ms`)
      return this.getStats()
    } finally {
      this.rebuilding = false
    }
  }

  private scanFiles(): string[] {
    const results: string[] = []
    const walk = (dir: string): void => {
      if (results.length >= 20000) return
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch { return }
      for (const entry of entries) {
        if (results.length >= 20000) return
        if (entry.name.startsWith('.')) continue
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (EXCLUDE_DIRS.has(entry.name)) continue
          walk(fullPath)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase()
          if (CODE_EXTENSIONS.has(ext)) results.push(fullPath)
        }
      }
    }
    walk(this.projectRoot)
    return results
  }

  private indexFileNow(filePath: string, mtimeMs: number, size: number): void {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const chunks: IndexedChunk[] = []

    const CHUNK_SIZE = 15
    const OVERLAP = 2
    for (let start = 0; start < lines.length; start += CHUNK_SIZE - OVERLAP) {
      const end = Math.min(start + CHUNK_SIZE, lines.length)
      const chunkLines = lines.slice(start, end)
      const contentStr = chunkLines.join('\n')
      const tokens = tokenize(contentStr)
      if (tokens.length === 0) continue
      chunks.push({ lineStart: start + 1, lineEnd: end, content: contentStr, tokens })
      if (chunks.length >= 2000) break // 单文件 chunk 上限
    }

    // 移除旧文件的 docFreq 贡献
    const old = this.files.get(filePath)
    if (old) {
      for (const chunk of old.chunks) {
        for (const t of new Set(chunk.tokens)) {
          const c = (this.docFreq.get(t) || 1) - 1
          if (c <= 0) this.docFreq.delete(t)
          else this.docFreq.set(t, c)
        }
      }
      this.totalChunks -= old.chunks.length
      this.recalcAvg()
    }

    // 提取符号声明
    const symbols = extractSymbols(content)

    const file: IndexedFile = { path: filePath, mtimeMs, size, chunks, symbols }
    this.files.set(filePath, file)
    this.totalChunks += chunks.length
    this.recalcAvg()

    // 添加新文件的 docFreq 贡献
    for (const chunk of chunks) {
      for (const t of new Set(chunk.tokens)) {
        this.docFreq.set(t, (this.docFreq.get(t) || 0) + 1)
      }
    }
  }

  private recalcAvg(): void {
    if (this.totalChunks === 0) { this.avgChunkLen = 0; return }
    let total = 0
    for (const f of this.files.values()) {
      for (const c of f.chunks) total += c.tokens.length
    }
    this.avgChunkLen = total / this.totalChunks
  }

  removeFile(filePath: string): void {
    const old = this.files.get(filePath)
    if (!old) return
    for (const chunk of old.chunks) {
      for (const t of new Set(chunk.tokens)) {
        const c = (this.docFreq.get(t) || 1) - 1
        if (c <= 0) this.docFreq.delete(t)
        else this.docFreq.set(t, c)
      }
    }
    this.totalChunks -= old.chunks.length
    this.files.delete(filePath)
    this.recalcAvg()
  }

  // ─── 搜索（BM25） ───

  search(query: string, opts: { maxResults?: number; fileTypes?: string[]; directories?: string[] } = {}): SearchResult[] {
    const maxResults = opts.maxResults || 20
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0 || this.totalChunks === 0) return []

    const avgLen = this.avgChunkLen || 100
    const N = this.totalChunks
    const queryLower = query.toLowerCase()

    const scored: Array<{ filePath: string; lineStart: number; content: string; score: number; raw: string }> = []

    for (const file of this.files.values()) {
      // 过滤
      if (opts.fileTypes && opts.fileTypes.length > 0) {
        const ext = path.extname(file.path).slice(1).toLowerCase()
        if (!opts.fileTypes.includes(ext)) continue
      }
      if (opts.directories && opts.directories.length > 0) {
        const rel = path.relative(this.projectRoot, file.path).replace(/\\/g, '/')
        if (!opts.directories.some(d => rel.startsWith(d.replace(/\\/g, '/')))) continue
      }

      for (const chunk of file.chunks) {
        let score = 0
        const tf = new Map<string, number>()
        for (const t of chunk.tokens) tf.set(t, (tf.get(t) || 0) + 1)
        const dl = chunk.tokens.length || 1

        for (const qt of queryTokens) {
          const df = this.docFreq.get(qt) || 0
          const tfq = tf.get(qt) || 0
          if (tfq === 0) continue
          const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
          const tfd = (tfq * (K1 + 1)) / (tfq + K1 * (1 - B + B * (dl / avgLen)))
          score += idf * tfd
        }

        if (score <= 0) continue

        // 精确匹配加成（内容/文件名）
        if (chunk.content.toLowerCase().includes(queryLower)) score *= 1.5
        const fileName = path.basename(file.path).toLowerCase()
        if (queryTokens.some(qt => fileName.includes(qt))) score *= 1.3

        // 找最匹配的行
        let bestLine = chunk.lineStart
        let bestIdx = -1
        const chunkLines = chunk.content.split('\n')
        for (let i = 0; i < chunkLines.length; i++) {
          if (chunkLines[i].toLowerCase().includes(queryLower)) { bestIdx = i; bestLine = chunk.lineStart + i; break }
        }
        const ctxLine = bestIdx >= 0 && bestIdx + 1 < chunkLines.length ? chunkLines[bestIdx + 1] : undefined

        scored.push({
          filePath: file.path,
          lineStart: bestLine,
          content: chunkLines[bestIdx >= 0 ? bestIdx : 0] || chunk.content,
          score,
          raw: ctxLine || '',
        })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, maxResults).map(s => ({
      filePath: s.filePath,
      lineNumber: s.lineStart,
      column: 1,
      content: s.content.trim(),
      context: s.raw.trim(),
      score: s.score,
    }))
  }

  // ─── 符号检索 ───

  searchSymbols(query: string, maxResults = 20): SymbolSearchResult[] {
    if (!query.trim() || this.files.size === 0) return []
    const qNorm = normalizeSymbolName(query)
    if (!qNorm) return []

    const results: SymbolSearchResult[] = []
    for (const file of this.files.values()) {
      for (const sym of file.symbols) {
        const symNorm = normalizeSymbolName(sym.name)
        let score = 0
        if (symNorm === qNorm) score = 100 // 完全匹配
        else if (symNorm.startsWith(qNorm)) score = 80 // 前缀
        else if (symNorm.includes(qNorm)) score = 50 // 包含
        else if (query.length >= 2 && symNorm.includes(query.toLowerCase())) score = 30 // 原文小写包含
        else continue
        // 文件名加分
        const base = path.basename(file.path).replace(/\.[^.]+$/, '')
        if (normalizeSymbolName(base).includes(qNorm) || qNorm.includes(normalizeSymbolName(base))) score += 10
        results.push({ filePath: file.path, name: sym.name, kind: sym.kind, line: sym.line, score })
      }
    }
    results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    return results.slice(0, maxResults)
  }

  // ─── 实时监听 ───

  watch(): void {
    try {
      if (this.watcher) this.watcher.close()
      this.watcher = fs.watch(this.projectRoot, { recursive: true }, (_event, filename) => {
        if (!filename) return
        const rel = filename.toString().replace(/\\/g, '/')
        // 忽略非代码文件与排除目录
        if (rel.startsWith('.')) return
        const parts = rel.split('/')
        if (parts.some(p => EXCLUDE_DIRS.has(p))) return
        if (!path.extname(rel)) return
        const ext = path.extname(rel).slice(1).toLowerCase()
        if (!CODE_EXTENSIONS.has(ext)) return

        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
          const fullPath = path.join(this.projectRoot, rel)
          try {
            if (fs.existsSync(fullPath)) {
              const stat = fs.statSync(fullPath)
              this.indexFileNow(fullPath, stat.mtimeMs, stat.size)
            } else {
              this.removeFile(fullPath)
            }
            this.lastIndexedAt = Date.now()
            this.save()
          } catch { /* ignore */ }
        }, 500)
      })
    } catch (e) {
      console.warn('[INDEX] 文件监听不可用（可能文件过多）:', e)
    }
  }

  unwatch(): void {
    if (this.watcher) { try { this.watcher.close() } catch { /* ignore */ } this.watcher = null }
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
  }

  getStats(): IndexStats {
    let totalTokens = 0
    for (const f of this.files.values()) {
      for (const c of f.chunks) totalTokens += c.tokens.length
    }
    return {
      fileCount: this.files.size,
      chunkCount: this.totalChunks,
      indexSize: fs.existsSync(this.indexFile) ? fs.statSync(this.indexFile).size : 0,
      lastIndexedAt: this.lastIndexedAt,
      totalTokens,
    }
  }
}

// ─── 便捷创建 ───

export function createCodeIndexer(projectRoot: string): CodeIndexer {
  return new CodeIndexer(projectRoot)
}
