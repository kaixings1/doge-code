/**
 * vendor/file-index-src（Rust NAPI 模块）的纯 TypeScript 移植版。
 *
 * 原生模块包装了 nucleo (https://github.com/helix-editor/nucleo) 以实现
 * 高性能模糊文件搜索。此移植版在无原生依赖的情况下重新实现了相同的 API
 * 和评分行为。
 *
 * 关键 API：
 *   new FileIndex()
 *   .loadFromFileList(fileList: string[]): void   — 去重并索引路径
 *   .search(query: string, limit: number): SearchResult[]
 *
 * 评分语义：越低越好。分数 = 结果中的位置 / 结果总数，
 * 因此最佳匹配为 0.0。包含 "test" 的路径会获得 1.05× 的惩罚（上限为 1.0），
 * 使非测试文件排名略高。
 */

export type SearchResult = {
  path: string
  score: number
}

// nucleo 风格的评分常量（近似 fzf-v2 / nucleo 的加分值）
const SCORE_MATCH = 16
const BONUS_BOUNDARY = 8
const BONUS_CAMEL = 6
const BONUS_CONSECUTIVE = 4
const BONUS_FIRST_CHAR = 8
const PENALTY_GAP_START = 3
const PENALTY_GAP_EXTENSION = 1

const TOP_LEVEL_CACHE_LIMIT = 100
const MAX_QUERY_LEN = 64
// 经过这么多毫秒的同步工作后让出事件循环。块大小基于时间（而非计数），
// 因此慢机器会获得更小的块并保持响应——5k 路径在 M 系列上约 2ms，
// 但在旧款 Windows 硬件上可能达到 15ms+。
const CHUNK_MS = 4

// 可复用缓冲区：记录 indexOf 扫描期间每个搜索字符的匹配位置
const posBuf = new Int32Array(MAX_QUERY_LEN)

export class FileIndex {
  private paths: string[] = []
  private lowerPaths: string[] = []
  private charBits: Int32Array = new Int32Array(0)
  private pathLens: Uint16Array = new Uint16Array(0)
  private topLevelCache: SearchResult[] | null = null
  // 在异步构建期间，跟踪已填充位图/lowerPath 的路径数量。
  // search() 使用此值在构建继续时搜索已准备好的前缀。
  private readyCount = 0

  /**
   * 从字符串数组加载路径。
   * 这是填充索引的主要方式——ripgrep 收集文件，我们只需搜索它们。
   * 自动对路径进行去重。
   */
  loadFromFileList(fileList: string[]): void {
    // 去重并过滤空字符串（匹配 Rust HashSet 行为）
    const seen = new Set<string>()
    const paths: string[] = []
    for (const line of fileList) {
      if (line.length > 0 && !seen.has(line)) {
        seen.add(line)
        paths.push(line)
      }
    }

    this.buildIndex(paths)
  }

  /**
   * 异步变体：每 ~8–12k 条路径让出事件循环，以便大索引（27 万+ 文件）
   * 不会一次阻塞主线程超过 10ms。结果与 loadFromFileList 相同。
   *
   * 返回 { queryable, done }：
   *   - queryable：第一个块索引完成后立即 resolve（search 返回部分结果）。
   *     对于 27 万条路径列表，路径数组可用后约需 5–10ms 的同步工作。
   *   - done：整个索引构建完成后 resolve。
   */
  loadFromFileListAsync(fileList: string[]): {
    queryable: Promise<void>
    done: Promise<void>
  } {
    let markQueryable: () => void = () => {}
    const queryable = new Promise<void>(resolve => {
      markQueryable = resolve
    })
    const done = this.buildAsync(fileList, markQueryable)
    return { queryable, done }
  }

  private async buildAsync(
    fileList: string[],
    markQueryable: () => void,
  ): Promise<void> {
    const seen = new Set<string>()
    const paths: string[] = []
    let chunkStart = performance.now()
    for (let i = 0; i < fileList.length; i++) {
      const line = fileList[i]!
      if (line.length > 0 && !seen.has(line)) {
        seen.add(line)
        paths.push(line)
      }
      // 每 256 次迭代检查一次，以分摊 performance.now() 的开销
      if ((i & 0xff) === 0xff && performance.now() - chunkStart > CHUNK_MS) {
        await yieldToEventLoop()
        chunkStart = performance.now()
      }
    }

    this.resetArrays(paths)

    chunkStart = performance.now()
    let firstChunk = true
    for (let i = 0; i < paths.length; i++) {
      this.indexPath(i)
      if ((i & 0xff) === 0xff && performance.now() - chunkStart > CHUNK_MS) {
        this.readyCount = i + 1
        if (firstChunk) {
          markQueryable()
          firstChunk = false
        }
        await yieldToEventLoop()
        chunkStart = performance.now()
      }
    }
    this.readyCount = paths.length
    markQueryable()
  }

  private buildIndex(paths: string[]): void {
    this.resetArrays(paths)
    for (let i = 0; i < paths.length; i++) {
      this.indexPath(i)
    }
    this.readyCount = paths.length
  }

  private resetArrays(paths: string[]): void {
    const n = paths.length
    this.paths = paths
    this.lowerPaths = new Array(n)
    this.charBits = new Int32Array(n)
    this.pathLens = new Uint16Array(n)
    this.readyCount = 0
    this.topLevelCache = computeTopLevelEntries(paths, TOP_LEVEL_CACHE_LIMIT)
  }

  // 预计算：小写、a–z 位图、长度。位图提供 O(1) 的拒绝检测，
  // 用于排除缺少任何搜索字母的路径（对于像 "test" 这样的宽泛查询，
  // 存活率 89%→仍有 10%+ 的免费收益；对于稀有字符拒绝率 90%+）。
  private indexPath(i: number): void {
    const lp = this.paths[i]!.toLowerCase()
    this.lowerPaths[i] = lp
    const len = lp.length
    this.pathLens[i] = len
    let bits = 0
    for (let j = 0; j < len; j++) {
      const c = lp.charCodeAt(j)
      if (c >= 97 && c <= 122) bits |= 1 << (c - 97)
    }
    this.charBits[i] = bits
  }

  /**
   * 使用模糊匹配搜索与查询匹配的文件。
   * 返回按匹配分数排序的前 N 个结果。
   */
  search(query: string, limit: number): SearchResult[] {
    if (limit <= 0) return []
    if (query.length === 0) {
      if (this.topLevelCache) {
        return this.topLevelCache.slice(0, limit)
      }
      return []
    }

    // 智能大小写：全小写查询 → 不区分大小写；包含大写 → 区分大小写
    const caseSensitive = query !== query.toLowerCase()
    const needle = caseSensitive ? query : query.toLowerCase()
    const nLen = Math.min(needle.length, MAX_QUERY_LEN)
    const needleChars: string[] = new Array(nLen)
    let needleBitmap = 0
    for (let j = 0; j < nLen; j++) {
      const ch = needle.charAt(j)
      needleChars[j] = ch
      const cc = ch.charCodeAt(0)
      if (cc >= 97 && cc <= 122) needleBitmap |= 1 << (cc - 97)
    }

    // 假设每个匹配都获得最大边界加分时的分数上限。
    // 用于在 charCodeAt 密集的边界传递之前，拒绝那些仅凭间隔惩罚就
    // 无法超越当前 top-k 阈值的路径。
    const scoreCeiling =
      nLen * (SCORE_MATCH + BONUS_BOUNDARY) + BONUS_FIRST_CHAR + 32

    // Top-k：维护最佳 `limit` 个匹配的升序排列数组。
    // 当我们只需要 `limit` 个结果时，避免对所有匹配进行 O(n log n) 排序。
    const topK: { path: string; fuzzScore: number }[] = []
    let threshold = -Infinity

    const { paths, lowerPaths, charBits, pathLens, readyCount } = this

    outer: for (let i = 0; i < readyCount; i++) {
      // O(1) 位图拒绝：路径必须包含搜索词中的每个字母
      if ((charBits[i]! & needleBitmap) !== needleBitmap) continue

      const haystack = caseSensitive ? paths[i]! : lowerPaths[i]!

      // 融合 indexOf 扫描：查找位置（在 JSC/V8 中由 SIMD 加速）并
      // 内联累积间隔/连续项。此处找到的贪心最早位置
      // 与 charCodeAt 评分器找到的位置相同，因此直接根据它们评分——
      // 无需第二次扫描。
      let pos = haystack.indexOf(needleChars[0]!)
      if (pos === -1) continue
      posBuf[0] = pos
      let gapPenalty = 0
      let consecBonus = 0
      let prev = pos
      for (let j = 1; j < nLen; j++) {
        pos = haystack.indexOf(needleChars[j]!, prev + 1)
        if (pos === -1) continue outer
        posBuf[j] = pos
        const gap = pos - prev - 1
        if (gap === 0) consecBonus += BONUS_CONSECUTIVE
        else gapPenalty += PENALTY_GAP_START + gap * PENALTY_GAP_EXTENSION
        prev = pos
      }

      // Gap-bound reject：如果最佳情况分数（所有边界加分）减去
      // 已知间隔惩罚无法超过阈值，则跳过边界传递。
      if (
        topK.length === limit &&
        scoreCeiling + consecBonus - gapPenalty <= threshold
      ) {
        continue
      }

      // 边界/驼峰命名评分：检查每个匹配位置之前的字符。
      const path = paths[i]!
      const hLen = pathLens[i]!
      let score = nLen * SCORE_MATCH + consecBonus - gapPenalty
      score += scoreBonusAt(path, posBuf[0]!, true)
      for (let j = 1; j < nLen; j++) {
        score += scoreBonusAt(path, posBuf[j]!, false)
      }
      score += Math.max(0, 32 - (hLen >> 2))

      // 维护最佳 limit 个匹配的升序 top-k 数组
      if (topK.length < limit) {
        topK.push({ path, fuzzScore: score })
        if (topK.length === limit) {
          topK.sort((a, b) => a.fuzzScore - b.fuzzScore)
          threshold = topK[0]!.fuzzScore
        }
      } else if (score > threshold) {
        // 二分查找插入位置，保持有序
        let lo = 0
        let hi = topK.length
        while (lo < hi) {
          const mid = (lo + hi) >> 1
          if (topK[mid]!.fuzzScore < score) lo = mid + 1
          else hi = mid
        }
        topK.splice(lo, 0, { path, fuzzScore: score })
        topK.shift() // 移除最差匹配
        threshold = topK[0]!.fuzzScore
      }
    }

    // topK 升序排列；反转后降序排列（最佳在前）
    topK.sort((a, b) => b.fuzzScore - a.fuzzScore)

    const matchCount = topK.length
    const denom = Math.max(matchCount, 1)
    const results: SearchResult[] = new Array(matchCount)

    // 将模糊匹配分数转换为 0.0-1.0 的排名分数，包含测试文件惩罚
    for (let i = 0; i < matchCount; i++) {
      const path = topK[i]!.path
      const positionScore = i / denom
      const finalScore = path.includes('test')
        ? Math.min(positionScore * 1.05, 1.0)
        : positionScore
      results[i] = { path, score: finalScore }
    }

    return results
  }
}

/**
 * 对原始大小写路径中位置 `pos` 处的匹配给予边界/驼峰命名加分。
 * `first` 启用字符串开头加分（仅用于 needle[0]）。
 */
function scoreBonusAt(path: string, pos: number, first: boolean): number {
  if (pos === 0) return first ? BONUS_FIRST_CHAR : 0
  const prevCh = path.charCodeAt(pos - 1)
  if (isBoundary(prevCh)) return BONUS_BOUNDARY
  if (isLower(prevCh) && isUpper(path.charCodeAt(pos))) return BONUS_CAMEL
  return 0
}

function isBoundary(code: number): boolean {
  // / \ - _ . 空格
  return (
    code === 47 || // /
    code === 92 || // \
    code === 45 || // -
    code === 95 || // _
    code === 46 || // .
    code === 32  // 空格
  )
}

function isLower(code: number): boolean {
  // a-z 的 ASCII 码范围
  return code >= 97 && code <= 122
}

function isUpper(code: number): boolean {
  // A-Z 的 ASCII 码范围
  return code >= 65 && code <= 90
}

/**
 * 通过 setImmediate 让出事件循环，允许处理其他待执行任务。
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

export { CHUNK_MS }

/**
 * 提取唯一的顶级路径段，按（长度升序，然后字母升序）排序。
 * 同时处理 Unix（/）和 Windows（\）路径分隔符。
 * 镜像 lib.rs 中的 FileIndex::compute_top_level_entries。
 */
function computeTopLevelEntries(
  paths: string[],
  limit: number,
): SearchResult[] {
  const topLevel = new Set<string>()

  for (const p of paths) {
    // 在第一个 / 或 \ 分隔符处分割
    let end = p.length
    for (let i = 0; i < p.length; i++) {
      const c = p.charCodeAt(i)
      if (c === 47 || c === 92) {
        end = i
        break
      }
    }
    const segment = p.slice(0, end)
    if (segment.length > 0) {
      topLevel.add(segment)
      if (topLevel.size >= limit) break
    }
  }

  const sorted = Array.from(topLevel)
  sorted.sort((a, b) => {
    const lenDiff = a.length - b.length
    if (lenDiff !== 0) return lenDiff
    return a < b ? -1 : a > b ? 1 : 0
  })

  return sorted.slice(0, limit).map(path => ({ path, score: 0.0 }))
}

export default FileIndex
export type { FileIndex as FileIndexType }
