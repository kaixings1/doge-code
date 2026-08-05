// src/main/localIndex.ts
import * as fs from "fs";
import * as path from "path";
var CODE_EXTENSIONS = /* @__PURE__ */ new Set(["ts", "tsx", "js", "jsx", "py", "go", "java", "rs", "c", "cpp", "h", "hpp", "cs", "php", "rb", "swift", "kt", "css", "scss", "html", "vue", "svelte", "json", "md", "yaml", "yml", "toml", "sql", "sh", "mjs", "cjs"]);
var EXCLUDE_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".cache", "out", "coverage", ".doge", ".venv", "venv", "__pycache__"]);
var STOP_WORDS = new Set("the,and,for,are,but,not,you,all,can,her,was,one,our,out,has,have,that,this,with,from,they,would,there,their,what,about,which,when,make,like,time,just,know,take,people,into,year,your,good,some,could,them,see,other,than,then,now,look,only,come,its,over,think,also,back,after,use,two,how,work,first,well,way,even,new,want,because,any,these,give,day,most,been,had,did,get,got,much,many,where,each,why,still,being,every,between,need,down,should,both,same,last,long,little,own,here,old,tell,may,set,put,end,help,try,function,const,let,var,return,import,export,default,class,interface,type,public,private,async,await,new,this,throw,try,catch,finally,if,else,switch,case,break,continue,while,for,of,in,from,as,extends,implements,static,readonly,get,set,void,true,false,null,undefined,number,string,boolean,object,array,any,unknown,never,keyof,typeof,instanceof".split(","));
function tokenize(text) {
  const out = [];
  const englishMatches = text.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
  for (const word of englishMatches) {
    const lower = word.toLowerCase();
    if (lower.length > 1 && !STOP_WORDS.has(lower)) out.push(lower);
    const parts = word.split(/(?<=[a-z0-9])(?=[A-Z])/);
    if (parts.length > 1) {
      for (const p of parts) {
        const pl = p.toLowerCase();
        if (pl.length > 1 && !STOP_WORDS.has(pl)) out.push(pl);
      }
    }
  }
  const chineseSeq = text.match(/[\u4e00-\u9fff]+/g) || [];
  for (const seq of chineseSeq) {
    if (seq.length === 1) {
      out.push(seq);
    } else {
      for (let i = 0; i < seq.length; i++) out.push(seq[i]);
      for (let i = 0; i < seq.length - 1; i++) out.push(seq.slice(i, i + 2));
    }
  }
  return out;
}
var K1 = 1.2;
var B = 0.75;
var CodeIndexer = class {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.indexFile = path.join(projectRoot, ".doge", "index.json");
  }
  projectRoot;
  files = /* @__PURE__ */ new Map();
  docFreq = /* @__PURE__ */ new Map();
  // token -> 出现 chunk 数
  totalChunks = 0;
  avgChunkLen = 0;
  indexFile = "";
  watcher = null;
  debounceTimer = null;
  lastIndexedAt = 0;
  rebuilding = false;
  // ─── 持久化 ───
  load() {
    try {
      if (!fs.existsSync(this.indexFile)) return;
      const raw = JSON.parse(fs.readFileSync(this.indexFile, "utf-8"));
      if (raw.version !== 1 || !raw.files) return;
      this.files = /* @__PURE__ */ new Map();
      this.docFreq = new Map(Object.entries(raw.docFreq || {}));
      this.totalChunks = raw.totalChunks || 0;
      this.avgChunkLen = raw.avgChunkLen || 0;
      this.lastIndexedAt = raw.lastIndexedAt || 0;
      for (const f of raw.files) {
        if (f.path && f.mtimeMs && f.chunks) this.files.set(f.path, f);
      }
      console.log(`[INDEX] \u52A0\u8F7D\u6301\u4E45\u5316\u7D22\u5F15: ${this.files.size} \u6587\u4EF6, ${this.totalChunks} chunks`);
    } catch (e) {
      console.warn("[INDEX] \u52A0\u8F7D\u7D22\u5F15\u5931\u8D25\uFF0C\u5C06\u91CD\u5EFA:", e);
      this.files.clear();
    }
  }
  save() {
    try {
      const dir = path.dirname(this.indexFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload = {
        version: 1,
        lastIndexedAt: this.lastIndexedAt,
        totalChunks: this.totalChunks,
        avgChunkLen: Math.round(this.avgChunkLen * 100) / 100,
        docFreq: Object.fromEntries(this.docFreq),
        files: Array.from(this.files.values())
      };
      fs.writeFileSync(this.indexFile, JSON.stringify(payload), "utf-8");
    } catch (e) {
      console.warn("[INDEX] \u4FDD\u5B58\u7D22\u5F15\u5931\u8D25:", e);
    }
  }
  // ─── 索引构建 ───
  /**
   * 增量重建：检查 mtime+size，仅重索引变化的文件
   */
  async rebuild(force = false) {
    if (this.rebuilding) return this.getStats();
    this.rebuilding = true;
    try {
      const files = this.scanFiles();
      const now = Date.now();
      let dirty = 0;
      const knownPaths = new Set(files);
      for (const p of [...this.files.keys()]) {
        if (!knownPaths.has(p)) {
          this.removeFile(p);
          dirty++;
        }
      }
      for (const filePath of files) {
        try {
          const stat = fs.statSync(filePath);
          const existing = this.files.get(filePath);
          if (!force && existing && existing.mtimeMs === stat.mtimeMs && existing.size === stat.size) {
            continue;
          }
          this.indexFileNow(filePath, stat.mtimeMs, stat.size);
          dirty++;
        } catch {
        }
      }
      this.lastIndexedAt = now;
      this.save();
      console.log(`[INDEX] \u91CD\u5EFA\u5B8C\u6210: ${dirty} \u6587\u4EF6\u66F4\u65B0, \u5171 ${this.files.size} \u6587\u4EF6, ${this.totalChunks} chunks, ${Date.now() - now}ms`);
      return this.getStats();
    } finally {
      this.rebuilding = false;
    }
  }
  scanFiles() {
    const results = [];
    const walk = (dir) => {
      if (results.length >= 2e4) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.length >= 2e4) return;
        if (entry.name.startsWith(".")) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (EXCLUDE_DIRS.has(entry.name)) continue;
          walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase();
          if (CODE_EXTENSIONS.has(ext)) results.push(fullPath);
        }
      }
    };
    walk(this.projectRoot);
    return results;
  }
  indexFileNow(filePath, mtimeMs, size) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const chunks = [];
    const CHUNK_SIZE = 15;
    const OVERLAP = 2;
    for (let start = 0; start < lines.length; start += CHUNK_SIZE - OVERLAP) {
      const end = Math.min(start + CHUNK_SIZE, lines.length);
      const chunkLines = lines.slice(start, end);
      const contentStr = chunkLines.join("\n");
      const tokens = tokenize(contentStr);
      if (tokens.length === 0) continue;
      chunks.push({ lineStart: start + 1, lineEnd: end, content: contentStr, tokens });
      if (chunks.length >= 2e3) break;
    }
    const old = this.files.get(filePath);
    if (old) {
      for (const chunk of old.chunks) {
        for (const t of new Set(chunk.tokens)) {
          const c = (this.docFreq.get(t) || 1) - 1;
          if (c <= 0) this.docFreq.delete(t);
          else this.docFreq.set(t, c);
        }
      }
      this.totalChunks -= old.chunks.length;
      this.recalcAvg();
    }
    const file = { path: filePath, mtimeMs, size, chunks };
    this.files.set(filePath, file);
    this.totalChunks += chunks.length;
    this.recalcAvg();
    for (const chunk of chunks) {
      for (const t of new Set(chunk.tokens)) {
        this.docFreq.set(t, (this.docFreq.get(t) || 0) + 1);
      }
    }
  }
  recalcAvg() {
    if (this.totalChunks === 0) {
      this.avgChunkLen = 0;
      return;
    }
    let total = 0;
    for (const f of this.files.values()) {
      for (const c of f.chunks) total += c.tokens.length;
    }
    this.avgChunkLen = total / this.totalChunks;
  }
  removeFile(filePath) {
    const old = this.files.get(filePath);
    if (!old) return;
    for (const chunk of old.chunks) {
      for (const t of new Set(chunk.tokens)) {
        const c = (this.docFreq.get(t) || 1) - 1;
        if (c <= 0) this.docFreq.delete(t);
        else this.docFreq.set(t, c);
      }
    }
    this.totalChunks -= old.chunks.length;
    this.files.delete(filePath);
    this.recalcAvg();
  }
  // ─── 搜索（BM25） ───
  search(query, opts = {}) {
    const maxResults = opts.maxResults || 20;
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.totalChunks === 0) return [];
    const avgLen = this.avgChunkLen || 100;
    const N = this.totalChunks;
    const queryLower = query.toLowerCase();
    const scored = [];
    for (const file of this.files.values()) {
      if (opts.fileTypes && opts.fileTypes.length > 0) {
        const ext = path.extname(file.path).slice(1).toLowerCase();
        if (!opts.fileTypes.includes(ext)) continue;
      }
      if (opts.directories && opts.directories.length > 0) {
        const rel = path.relative(this.projectRoot, file.path).replace(/\\/g, "/");
        if (!opts.directories.some((d) => rel.startsWith(d.replace(/\\/g, "/")))) continue;
      }
      for (const chunk of file.chunks) {
        let score = 0;
        const tf = /* @__PURE__ */ new Map();
        for (const t of chunk.tokens) tf.set(t, (tf.get(t) || 0) + 1);
        const dl = chunk.tokens.length || 1;
        for (const qt of queryTokens) {
          const df = this.docFreq.get(qt) || 0;
          const tfq = tf.get(qt) || 0;
          if (tfq === 0) continue;
          const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
          const tfd = tfq * (K1 + 1) / (tfq + K1 * (1 - B + B * (dl / avgLen)));
          score += idf * tfd;
        }
        if (score <= 0) continue;
        if (chunk.content.toLowerCase().includes(queryLower)) score *= 1.5;
        const fileName = path.basename(file.path).toLowerCase();
        if (queryTokens.some((qt) => fileName.includes(qt))) score *= 1.3;
        let bestLine = chunk.lineStart;
        let bestIdx = -1;
        const chunkLines = chunk.content.split("\n");
        for (let i = 0; i < chunkLines.length; i++) {
          if (chunkLines[i].toLowerCase().includes(queryLower)) {
            bestIdx = i;
            bestLine = chunk.lineStart + i;
            break;
          }
        }
        const ctxLine = bestIdx >= 0 && bestIdx + 1 < chunkLines.length ? chunkLines[bestIdx + 1] : void 0;
        scored.push({
          filePath: file.path,
          lineStart: bestLine,
          content: chunkLines[bestIdx >= 0 ? bestIdx : 0] || chunk.content,
          score,
          raw: ctxLine || ""
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map((s) => ({
      filePath: s.filePath,
      lineNumber: s.lineStart,
      column: 1,
      content: s.content.trim(),
      context: s.raw.trim(),
      score: s.score
    }));
  }
  // ─── 实时监听 ───
  watch() {
    try {
      if (this.watcher) this.watcher.close();
      this.watcher = fs.watch(this.projectRoot, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const rel = filename.toString().replace(/\\/g, "/");
        if (rel.startsWith(".")) return;
        const parts = rel.split("/");
        if (parts.some((p) => EXCLUDE_DIRS.has(p))) return;
        if (!path.extname(rel)) return;
        const ext = path.extname(rel).slice(1).toLowerCase();
        if (!CODE_EXTENSIONS.has(ext)) return;
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          const fullPath = path.join(this.projectRoot, rel);
          try {
            if (fs.existsSync(fullPath)) {
              const stat = fs.statSync(fullPath);
              this.indexFileNow(fullPath, stat.mtimeMs, stat.size);
            } else {
              this.removeFile(fullPath);
            }
            this.lastIndexedAt = Date.now();
            this.save();
          } catch {
          }
        }, 500);
      });
    } catch (e) {
      console.warn("[INDEX] \u6587\u4EF6\u76D1\u542C\u4E0D\u53EF\u7528\uFF08\u53EF\u80FD\u6587\u4EF6\u8FC7\u591A\uFF09:", e);
    }
  }
  unwatch() {
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {
      }
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
  getStats() {
    let totalTokens = 0;
    for (const f of this.files.values()) {
      for (const c of f.chunks) totalTokens += c.tokens.length;
    }
    return {
      fileCount: this.files.size,
      chunkCount: this.totalChunks,
      indexSize: fs.existsSync(this.indexFile) ? fs.statSync(this.indexFile).size : 0,
      lastIndexedAt: this.lastIndexedAt,
      totalTokens
    };
  }
};
function createCodeIndexer(projectRoot) {
  return new CodeIndexer(projectRoot);
}
export {
  CodeIndexer,
  createCodeIndexer
};
