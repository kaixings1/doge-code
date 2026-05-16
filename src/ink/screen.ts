import {
  type AnsiCode,
  ansiCodesToString,
  diffAnsiCodes,
} from '@alcalzone/ansi-tokenize'
import {
  type Point,
  type Rectangle,
  type Size,
  unionRect,
} from './layout/geometry.js'
import { BEL, ESC, SEP } from './termio/ansi.js'
import * as warn from './warn.js'

// --- 共享池（内存效率的实习机制） ---

// 跨所有 Screen 共享的字符串池。
// 使用共享池后，实习后的字符 ID 在所有 Screen 间有效，
// 因此 blitRegion 可以直接复制 ID（无需重新实习），
// diffEach 可以将 ID 作为整数比较（无需字符串查找）。
export class CharPool {
  private strings: string[] = [' ', ''] // 索引 0 = 空格, 1 = 空（间隔单元格）
  private stringMap = new Map<string, number>([
    [' ', 0],
    ['', 1],
  ])
  private ascii: Int32Array = initCharAscii() // charCode → 索引, -1 = 未实习

  intern(char: string): number {
    // ASCII 快速路径：直接数组查找替代 Map.get
    if (char.length === 1) {
      const code = char.charCodeAt(0)
      if (code < 128) {
        const cached = this.ascii[code]!
        if (cached !== -1) return cached
        const index = this.strings.length
        this.strings.push(char)
        this.ascii[code] = index
        return index
      }
    }
    const existing = this.stringMap.get(char)
    if (existing !== undefined) return existing
    const index = this.strings.length
    this.strings.push(char)
    this.stringMap.set(char, index)
    return index
  }

  get(index: number): string {
    return this.strings[index] ?? ' '
  }
}

// 跨所有 Screen 共享的超链接字符串池。
// 索引 0 = 无超链接。
export class HyperlinkPool {
  private strings: string[] = [''] // 索引 0 = 无超链接
  private stringMap = new Map<string, number>()

  intern(hyperlink: string | undefined): number {
    if (!hyperlink) return 0
    let id = this.stringMap.get(hyperlink)
    if (id === undefined) {
      id = this.strings.length
      this.strings.push(hyperlink)
      this.stringMap.set(hyperlink, id)
    }
    return id
  }

  get(id: number): string | undefined {
    return id === 0 ? undefined : this.strings[id]
  }
}

// SGR 7（反色）作为一个 AnsiCode。endCode '\x1b[27m' 标记 VISIBLE_ON_SPACE，
// 因此生成的 styleId 的位 0 被设置 → 渲染器不会将反色空格视为不可见而跳过。
const INVERSE_CODE: AnsiCode = {
  type: 'ansi',
  code: '\x1b[7m',
  endCode: '\x1b[27m',
}
// 粗体（SGR 1）— 可干净堆叠，等宽字体中无需重排。endCode 22
// 也会取消暗色（SGR 2）；此处无害，因为我们从不添加 dim。
const BOLD_CODE: AnsiCode = {
  type: 'ansi',
  code: '\x1b[1m',
  endCode: '\x1b[22m',
}
// 下划线（SGR 4）。与黄色+粗体并存 — 下划线是
// 明确任何主题下均可见的标记。通过反色实现的黄色背景可能
// 与现有背景色冲突（用户提示样式、工具外壳、语法背景）。
// 如果看到下划线但没有黄色，说明黄色在现有单元格样式
// 中丢失了 — 叠加层确实找到了匹配。
const UNDERLINE_CODE: AnsiCode = {
  type: 'ansi',
  code: '\x1b[4m',
  endCode: '\x1b[24m',
}
// 前景→黄色（SGR 33）。由于反色已在栈中，终端在渲染时
// 交换前景↔背景 — 因此黄色前景变为黄色背景。原始背景
// 变为前景（在大多数主题上可读：暗色背景 → 黄色上的暗色文本）。
// endCode 39 是 'default fg' — 干净地取消任何先前的前景色。
const YELLOW_FG_CODE: AnsiCode = {
  type: 'ansi',
  code: '\x1b[33m',
  endCode: '\x1b[39m',
}

export class StylePool {
  private ids = new Map<string, number>()
  private styles: AnsiCode[][] = []
  private transitionCache = new Map<number, string>()
  readonly none: number

  constructor() {
    this.none = this.intern([])
  }

  /**
   * 实习样式并返回其 ID。ID 的位 0 编码该样式是否
   * 对空格字符有可见效果（背景、反色、下划线等）。
   * 仅前景样式获取偶数 ID；在空格上可见的样式获取奇数 ID。
   * 这使得渲染器能通过对 packed word 执行一次位掩码检查
   * 来跳过不可见空格。
   */
  intern(styles: AnsiCode[]): number {
    const key = styles.length === 0 ? '' : styles.map(s => s.code).join('\0')
    let id = this.ids.get(key)
    if (id === undefined) {
      const rawId = this.styles.length
      this.styles.push(styles.length === 0 ? [] : styles)
      id =
        (rawId << 1) |
        (styles.length > 0 && hasVisibleSpaceEffect(styles) ? 1 : 0)
      this.ids.set(key, id)
    }
    return id
  }

  /** 从编码的 ID 恢复样式。通过 >>> 1 剥离位 0 标志。 */
  get(id: number): AnsiCode[] {
    return this.styles[id >>> 1] ?? []
  }

  /**
   * 返回从一个样式过渡到另一个样式的预序列化 ANSI 字符串。
   * 按 (fromId, toId) 缓存 — 给定对的首次调用后零分配。
   */
  transition(fromId: number, toId: number): string {
    if (fromId === toId) return ''
    const key = fromId * 0x100000 + toId
    let str = this.transitionCache.get(key)
    if (str === undefined) {
      str = ansiCodesToString(diffAnsiCodes(this.get(fromId), this.get(toId)))
      this.transitionCache.set(key, str)
    }
    return str
  }

  /**
   * 实习一个为 `base + inverse` 的样式。按 base ID 缓存，因此
   * 对同一基础样式的重复调用不会重新扫描 AnsiCode[] 数组。
   * 用于选择叠加层。
   */
  private inverseCache = new Map<number, number>()
  withInverse(baseId: number): number {
    let id = this.inverseCache.get(baseId)
    if (id === undefined) {
      const baseCodes = this.get(baseId)
      // 如果已反转，直接使用原样（避免 SGR 7 堆叠）
      const hasInverse = baseCodes.some(c => c.endCode === '\x1b[27m')
      id = hasInverse ? baseId : this.intern([...baseCodes, INVERSE_CODE])
      this.inverseCache.set(baseId, id)
    }
    return id
  }

  /** 当前搜索匹配项的反色 + 粗体 + 通过前景交换实现的黄色背景。
   *  其他匹配项为纯反色 — 背景继承自主题。当前匹配项
   *  获得独特的黄色背景（通过前景再反色交换）加粗体，
   * 使其在反色海洋中脱颖而出。下划线太微妙了。
   *  零重排风险：所有纯 SGR 叠加层，逐单元格，布局后执行。
   *  黄色会覆盖这些单元格上的任何现有前景色（语法高亮）— 没问题，
   *  "你在这里"信号就是重点，语法颜色可以退让。 */
  private currentMatchCache = new Map<number, number>()
  withCurrentMatch(baseId: number): number {
    let id = this.currentMatchCache.get(baseId)
    if (id === undefined) {
      const baseCodes = this.get(baseId)
      // 同时过滤前景和背景，使通过反色实现的黄色明确清晰。
      // 用户提示单元格有显式背景（灰色框）；如果该背景
      // 仍存在，反色会交换黄色前景↔灰色背景 → 在某些终端上
      // 显示灰底黄字，在其他终端上显示黄底灰字
      //（当两种颜色都显式时，反色语义有所不同）。同时过滤两者
      // 可在任何地方实现黄色背景 + 终端默认前景色。粗体/暗色/斜体
      // 共存 — 保留它们。
      const codes = baseCodes.filter(
        c => c.endCode !== '\x1b[39m' && c.endCode !== '\x1b[49m',
      )
      // 先设置黄色前景，这样反色会将其交换为背景。反色后的粗体
      // 没问题 — SGR 1 仅影响前景属性，与 7 的顺序无关。
      codes.push(YELLOW_FG_CODE)
      if (!baseCodes.some(c => c.endCode === '\x1b[27m'))
        codes.push(INVERSE_CODE)
      if (!baseCodes.some(c => c.endCode === '\x1b[22m')) codes.push(BOLD_CODE)
      // 下划线作为明确标记 — 黄色背景可能与现有背景样式
      //（用户提示背景、语法背景）冲突。如果在匹配项上看到
      // 下划线但没有黄色，叠加层确实找到了它；
      // 黄色只是在样式竞争中落败了。
      if (!baseCodes.some(c => c.endCode === '\x1b[24m'))
        codes.push(UNDERLINE_CODE)
      id = this.intern(codes)
      this.currentMatchCache.set(baseId, id)
    }
    return id
  }

  /**
   * 选择叠加层：用一个纯色替换单元格的背景，
   * 同时保留其前景（颜色、粗体、斜体、暗色、下划线）。
   * 匹配原生终端选择 — 专用的背景色，而非 SGR-7
   * 反色。反色会逐单元格交换前景/背景，在语法高亮的文本上
   * 造成视觉碎片（每个前景颜色变成不同的背景条纹）。
   *
   * 移除任何现有背景（endCode 49m — 替换，因此 diff 添加的绿色
   * 等不会透出）和任何现有反色（endCode 27m —
   * 在纯色背景上的反色会再次交换，看起来不对）。
   *
   * 通过 setSelectionBg() 设置背景；null → 回退到 withInverse()，以便
   * 叠加层在主题接线设置颜色之前仍能工作（测试、第一帧）。
   * 缓存仅按 baseId 键化 — setSelectionBg() 在变更时清除它。
   */
  private selectionBgCode: AnsiCode | null = null
  private selectionBgCache = new Map<number, number>()
  setSelectionBg(bg: AnsiCode | null): void {
    if (this.selectionBgCode?.code === bg?.code) return
    this.selectionBgCode = bg
    this.selectionBgCache.clear()
  }
  withSelectionBg(baseId: number): number {
    const bg = this.selectionBgCode
    if (bg === null) return this.withInverse(baseId)
    let id = this.selectionBgCache.get(baseId)
    if (id === undefined) {
      // 保留除背景（49m）和反色（27m）之外的所有内容。前景、粗体、暗色、
      // 斜体、下划线、删除线均保留。
      const kept = this.get(baseId).filter(
        c => c.endCode !== '\x1b[49m' && c.endCode !== '\x1b[27m',
      )
      kept.push(bg)
      id = this.intern(kept)
      this.selectionBgCache.set(baseId, id)
    }
    return id
  }
}

// 对空格字符产生可见效果的 endCode
const VISIBLE_ON_SPACE = new Set([
  '\x1b[49m', // 背景色
  '\x1b[27m', // 反色
  '\x1b[24m', // 下划线
  '\x1b[29m', // 删除线
  '\x1b[55m', // 上划线
])

function hasVisibleSpaceEffect(styles: AnsiCode[]): boolean {
  for (const style of styles) {
    if (VISIBLE_ON_SPACE.has(style.endCode)) return true
  }
  return false
}

/**
 * 单元格宽度分类，用于处理双宽字符（CJK、emoji 等）。
 *
 * 我们在渲染时使用显式的间隔单元格，而非推断宽度。这使
 * 数据结构自描述，并简化了光标定位逻辑。
 *
 * @see https://mitchellh.com/writing/grapheme-clusters-in-terminals
 */
// const enum 在编译时内联 — 无运行时对象，无属性访问
export const enum CellWidth {
  // 非宽字符，单元格宽度 1
  Narrow = 0,
  // 宽字符，单元格宽度 2。此单元格包含实际字符。
  Wide = 1,
  // 占据宽字符第二个视觉列的间隔单元格。不渲染。
  SpacerTail = 2,
  // 自动换行行末尾的间隔单元格，表示宽字符在下一行继续。
  // 用于在软换行期间保持宽字符语义。
  SpacerHead = 3,
}

export type Hyperlink = string | undefined

/**
 * Cell 是由 cellAt() 返回的视图类型。单元格内部以 packed typed array
 * 格式存储，避免为每个单元格分配对象带来的 GC 压力。
 */
export type Cell = {
  char: string
  styleId: number
  width: CellWidth
  hyperlink: Hyperlink
}

// 空/间隔单元格的常量，用于快速比较
// 这些是 charStrings 表的索引，而非码点
const EMPTY_CHAR_INDEX = 0 // ' '（空格）
const SPACER_CHAR_INDEX = 1 // ''（间隔单元格的空字符串）
// 未写入的单元格为 [EMPTY_CHAR_INDEX=0, packWord1(emptyStyleId=0,0,0)=0]。
// 由于 StylePool.none 总是 0（首个 intern），未写入的单元格与
// 显式清除的单元格在 packed array 中无法区分。
// 这是有意为之：diffEach 可以通过零归一化比较原始整数。
// isEmptyCellByIndex 检查两个 word 是否均为 0，以识别"从未可视写入"的单元格。

function initCharAscii(): Int32Array {
  const table = new Int32Array(128)
  table.fill(-1)
  table[32] = EMPTY_CHAR_INDEX // ' ' (space)
  return table
}

// --- 打包（packed）单元格布局 ---
// 每个单元格在 cells 数组中占用 2 个连续的 Int32 元素：
//   word0 (cells[ci])：     charId（完整 32 位）
//   word1 (cells[ci + 1])：styleId[31:17] | hyperlinkId[16:2] | width[1:0]
const STYLE_SHIFT = 17
const HYPERLINK_SHIFT = 2
const HYPERLINK_MASK = 0x7fff // 15 bits
const WIDTH_MASK = 3 // 2 bits

// 将 styleId、hyperlinkId 和 width 打包到一个 Int32 中
function packWord1(
  styleId: number,
  hyperlinkId: number,
  width: number,
): number {
  return (styleId << STYLE_SHIFT) | (hyperlinkId << HYPERLINK_SHIFT) | width
}

// 未写入单元格的 BigInt64 表示 — 两个 word 均为 0，因此 64 位值为 0n。
// 用于 BigInt64Array.fill() 的批量清除（resetScreen、clearRegion）。
// 不用于比较 — BigInt 元素读取会导致堆分配。
const EMPTY_CELL_VALUE = 0n

/**
 * Screen 使用打包的 Int32Array 而非 Cell 对象，以消除 GC 压力。
 * 对于 200x120 的屏幕，这避免了分配 24,000 个对象。
 *
 * 单元格数据以每个单元格 2 个 Int32 的形式存储在单个连续数组中：
 *   word0：charId（完整 32 位 — CharPool 的索引）
 *   word1：styleId[31:17] | hyperlinkId[16:2] | width[1:0]
 *
 * 此布局将 diffEach 中的内存访问减半（2 次 int 加载 vs 4 次），
 * 并为未来通过 Bun.indexOfFirstDifference 进行 SIMD 比较铺平道路。
 */
export type Screen = Size & {
  // 打包的单元格数据 — 每个单元格 2 个 Int32：[charId, packed(styleId|hyperlinkId|width)]
  // cells 和 cells64 是同一 ArrayBuffer 上的不同视图
  cells: Int32Array
  cells64: BigInt64Array // 每个单元格 1 个 BigInt64 — 用于 resetScreen/clearRegion 中的批量填充

  // 共享池 — 使用相同池的所有 Screen 间 ID 有效
  charPool: CharPool
  hyperlinkPool: HyperlinkPool

  // 用于比较的空样式 ID
  emptyStyleId: number

  /**
   * 渲染期间被写入（非 blit）的单元格边界框。
   * 供 diff() 限定迭代范围，仅扫描可能发生变化的区域。
   */
  damage: Rectangle | undefined

  /**
   * 逐单元格的 noSelect 位图 — 每个单元格 1 字节，1 = 从文本选择中排除
   *（复制 + 高亮）。供 <NoSelect> 标记 gutter 区域
   *（行号、差异标记），使得在 diff 上点击拖拽即可得到干净的
   * 可复制代码。每帧在 resetScreen 中完全重置；blitRegion
   * 会随 cells 一同复制它，从而保持 blit 优化时的标记。
   */
  noSelect: Uint8Array

  /**
   * 逐行 soft-wrap 延续标记。softWrap[r]=N>0 表示行 r
   * 是行 r-1 的自动换行延续（其前面的 `\n` 由 wrapAnsi 插入，
   * 而非源文本中的），而行 r-1 的实际内容结束于绝对列 N
   *（不含 — cells [0..N) 是片段，N 之后是未写入的填充）。0 表示行 r 不是
   * 延续（硬换行或首行）。选择复制时检查
   * softWrap[r]>0 以将行 r 拼接至行 r-1 而不插入换行符，
   * 并读取 softWrap[r+1] 以获知行 r 的内容结束位置（当行 r+1
   * 从行 r 延续时）。内容结束列是必要的，因为在打包的 typed array 中，
   * 未写入的单元格与写入但无样式的空格无法区分（均为全零）
   * — 没有此信息，我们要么丢掉单词分隔空格（trim），要么包含尾部填充（不 trim）。
   * 选择这种编码（自身标记延续，前一行的内容结束于此），
   * 使得 shiftRows 能保持是否延续的语义：当
   * 行 r 滚动出顶部，行 r+1 移至行 r 时，sw[r] 获取
   * 旧的 sw[r+1] — 它正确表明新的行 r 是
   * 现在位于 scrolledOffAbove 中内容的延续。每帧重置；由
   * blitRegion/shiftRows 复制。
   */
  softWrap: Int32Array
}

function isEmptyCellByIndex(screen: Screen, index: number): boolean {
  // 空/未写入的单元格的两个 word 均为 0：
  // word0 = EMPTY_CHAR_INDEX (0)，word1 = packWord1(emptyStyleId=0, 0, 0) = 0。
  const ci = index << 1
  return screen.cells[ci] === 0 && screen.cells[ci | 1] === 0
}

export function isEmptyCellAt(screen: Screen, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height) return true
  return isEmptyCellByIndex(screen, y * screen.width + x)
}

/**
 * 检查 Cell（视图对象）是否表示空单元格。
 */
export function isCellEmpty(screen: Screen, cell: Cell): boolean {
  // 检查 cell 是否看起来像空单元格（空格、空样式、窄宽、无链接）。
  // 注意：经过 cellAt 映射后，未写入的单元格具有 emptyStyleId，因此此方法
  // 对未写入和已清除的单元格均返回 true。如需内部区分请使用 isEmptyCellAt。
  return (
    cell.char === ' ' &&
    cell.styleId === screen.emptyStyleId &&
    cell.width === CellWidth.Narrow &&
    !cell.hyperlink
  )
}
// 实习（intern）超链接字符串并返回其 ID（0 = 无超链接）
function internHyperlink(screen: Screen, hyperlink: Hyperlink): number {
  return screen.hyperlinkPool.intern(hyperlink)
}

// ---

export function createScreen(
  width: number,
  height: number,
  styles: StylePool,
  charPool: CharPool,
  hyperlinkPool: HyperlinkPool,
): Screen {
  // 如果尺寸不是有效整数（可能是 yoga 布局输出异常），给出警告
  warn.ifNotInteger(width, 'createScreen width')
  warn.ifNotInteger(height, 'createScreen height')

  // 确保 width 和 height 是有效整数以防止崩溃
  if (!Number.isInteger(width) || width < 0) {
    width = Math.max(0, Math.floor(width) || 0)
  }
  if (!Number.isInteger(height) || height < 0) {
    height = Math.max(0, Math.floor(height) || 0)
  }

  const size = width * height

  // 分配一个缓冲区，两个视图：Int32Array 用于逐 word 访问，
  // BigInt64Array 用于 resetScreen/clearRegion 中的批量填充。
  // ArrayBuffer 已零填充，这正好是空单元格的值：
  // [EMPTY_CHAR_INDEX=0, packWord1(emptyStyleId=0,0,0)=0]。
  const buf = new ArrayBuffer(size << 3) // 8 bytes per cell
  const cells = new Int32Array(buf)
  const cells64 = new BigInt64Array(buf)

  return {
    width,
    height,
    cells,
    cells64,
    charPool,
    hyperlinkPool,
    emptyStyleId: styles.none,
    damage: undefined,
    noSelect: new Uint8Array(size),
    softWrap: new Int32Array(height),
  }
}

/**
 * 重置现有 Screen 以供重用，避免分配新的 typed array。
 * 必要时调整大小，并将所有单元格清除为空/未写入状态。
 *
 * 对于双缓冲，这允许在前台和后台缓冲区之间交换，
 * 而无需每帧分配新的 Screen 对象。
 */
export function resetScreen(
  screen: Screen,
  width: number,
  height: number,
): void {
  // 如果尺寸不是有效整数，给出警告
  warn.ifNotInteger(width, 'resetScreen width')
  warn.ifNotInteger(height, 'resetScreen height')

  // 确保 width 和 height 是有效整数以防止崩溃
  if (!Number.isInteger(width) || width < 0) {
    width = Math.max(0, Math.floor(width) || 0)
  }
  if (!Number.isInteger(height) || height < 0) {
    height = Math.max(0, Math.floor(height) || 0)
  }

  const size = width * height

  // 必要时调整大小（仅增长，避免重新分配）
  if (screen.cells64.length < size) {
    const buf = new ArrayBuffer(size << 3)
    screen.cells = new Int32Array(buf)
    screen.cells64 = new BigInt64Array(buf)
    screen.noSelect = new Uint8Array(size)
  }
  if (screen.softWrap.length < height) {
    screen.softWrap = new Int32Array(height)
  }

  // 重置所有单元格 — 单次 fill 调用，无需循环
  screen.cells64.fill(EMPTY_CELL_VALUE, 0, size)
  screen.noSelect.fill(0, 0, size)
  screen.softWrap.fill(0, 0, height)

  // 更新尺寸
  screen.width = width
  screen.height = height

  // 共享池持续累积 — 无需清除。唯一的 char/hyperlink 集合是有界的。

  // 清除 damage 追踪
  screen.damage = undefined
}

/**
 * 将 Screen 的 char 和 hyperlink ID 重新实习到新的池中。
 * 用于代际池重置 — 迁移后，Screen 的 typed array
 * 包含新池的有效 ID，旧池可以被 GC 回收。
 *
 * 复杂度 O(width * height)，但只偶尔调用（例如对话轮次之间）。
 */
export function migrateScreenPools(
  screen: Screen,
  charPool: CharPool,
  hyperlinkPool: HyperlinkPool,
): void {
  const oldCharPool = screen.charPool
  const oldHyperlinkPool = screen.hyperlinkPool
  if (oldCharPool === charPool && oldHyperlinkPool === hyperlinkPool) return

  const size = screen.width * screen.height
  const cells = screen.cells

  // 单次遍历重新实习 char 和 hyperlink，步长为 2
  for (let ci = 0; ci < size << 1; ci += 2) {
    // 重新实习 charId（word0）
    const oldCharId = cells[ci]!
    cells[ci] = charPool.intern(oldCharPool.get(oldCharId))

    // 重新实习 hyperlinkId（打包在 word1 中）
    const word1 = cells[ci + 1]!
    const oldHyperlinkId = (word1 >>> HYPERLINK_SHIFT) & HYPERLINK_MASK
    if (oldHyperlinkId !== 0) {
      const oldStr = oldHyperlinkPool.get(oldHyperlinkId)
      const newHyperlinkId = hyperlinkPool.intern(oldStr)
      // 用新的 hyperlinkId 重新打包 word1，保留 styleId 和 width
      const styleId = word1 >>> STYLE_SHIFT
      const width = word1 & WIDTH_MASK
      cells[ci + 1] = packWord1(styleId, newHyperlinkId, width)
    }
  }

  screen.charPool = charPool
  screen.hyperlinkPool = hyperlinkPool
}

/**
 * 获取指定位置的 Cell 视图。每次调用返回新对象 —
 * 这是有意为之，因为单元格以打包格式存储，而非对象。
 */
export function cellAt(screen: Screen, x: number, y: number): Cell | undefined {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height)
    return undefined
  return cellAtIndex(screen, y * screen.width + x)
}
/**
 * 通过预先计算的数组索引获取 Cell 视图。跳过边界检查和
 * 索引计算 — 调用者必须确保索引有效。
 */
export function cellAtIndex(screen: Screen, index: number): Cell {
  const ci = index << 1
  const word1 = screen.cells[ci + 1]!
  const hid = (word1 >>> HYPERLINK_SHIFT) & HYPERLINK_MASK
  return {
    // 未写入的单元格 charIndex=0（EMPTY_CHAR_INDEX）；charPool.get(0) 返回 ' '
    char: screen.charPool.get(screen.cells[ci]!),
    styleId: word1 >>> STYLE_SHIFT,
    width: word1 & WIDTH_MASK,
    hyperlink: hid === 0 ? undefined : screen.hyperlinkPool.get(hid),
  }
}

/**
 * 获取指定索引处的 Cell，若无可见内容则返回 undefined。
 * 对间隔单元格（charId 1）、无样式的空格以及与 lastRenderedStyleId 匹配的
 * 仅前景色空格返回 undefined（cursor-forward 产生相同视觉结果，避免 Cell 分配）。
 *
 * @param lastRenderedStyleId - 此行最后一个已渲染单元格的 styleId，
 *   若无则为 -1。
 */
export function visibleCellAtIndex(
  cells: Int32Array,
  charPool: CharPool,
  hyperlinkPool: HyperlinkPool,
  index: number,
  lastRenderedStyleId: number,
): Cell | undefined {
  const ci = index << 1
  const charId = cells[ci]!
  if (charId === 1) return undefined // 间隔单元格
  const word1 = cells[ci + 1]!
  // 对于空格：0x3fffc 掩码覆盖位 2-17（hyperlinkId + styleId 可见性
  // 位）。如果为零，该空格无超链接且最多只有前景色样式。
  // 然后 word1 >>> STYLE_SHIFT 为前景样式 — 如果为零
  //（真正不可见）或与此行最后一个渲染样式匹配则跳过。
  if (charId === 0 && (word1 & 0x3fffc) === 0) {
    const fgStyle = word1 >>> STYLE_SHIFT
    if (fgStyle === 0 || fgStyle === lastRenderedStyleId) return undefined
  }
  const hid = (word1 >>> HYPERLINK_SHIFT) & HYPERLINK_MASK
  return {
    char: charPool.get(charId),
    styleId: word1 >>> STYLE_SHIFT,
    width: word1 & WIDTH_MASK,
    hyperlink: hid === 0 ? undefined : hyperlinkPool.get(hid),
  }
}

/**
 * 将单元格数据写入现有 Cell 对象以避免分配。
 * 调用者必须确保索引有效。
 */
function cellAtCI(screen: Screen, ci: number, out: Cell): void {
  const w1 = ci | 1
  const word1 = screen.cells[w1]!
  out.char = screen.charPool.get(screen.cells[ci]!)
  out.styleId = word1 >>> STYLE_SHIFT
  out.width = word1 & WIDTH_MASK
  const hid = (word1 >>> HYPERLINK_SHIFT) & HYPERLINK_MASK
  out.hyperlink = hid === 0 ? undefined : screen.hyperlinkPool.get(hid)
}

export function charInCellAt(
  screen: Screen,
  x: number,
  y: number,
): string | undefined {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height)
    return undefined
  const ci = (y * screen.width + x) << 1
  return screen.charPool.get(screen.cells[ci]!)
}
/**
 * 设置一个单元格，可选地为宽字符创建间隔单元格。
 *
 * 宽字符（CJK、emoji）在缓冲区中占用 2 个单元格：
 * 1. 第一个单元格：包含实际字符，width = Wide
 * 2. 第二个单元格：间隔单元格，width = SpacerTail（空，不渲染）
 *
 * 如果单元格的 width = Wide，此函数会在下一列自动创建
 * 对应的 SpacerTail。这种双单元格模型使
 * 缓冲区与视觉列对齐，光标定位更直观。
 *
 * TODO：实现自动换行后，SpacerHead 单元格将由
 * 换行逻辑在宽字符换行到下一行的行尾位置显式放置。
 * 此函数不需要自动处理 SpacerHead — 将由换行代码直接设置。
 */
export function setCellAt(
  screen: Screen,
  x: number,
  y: number,
  cell: Cell,
): void {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height) return
  const ci = (y * screen.width + x) << 1
  const cells = screen.cells

  // 当宽字符被窄字符覆盖时，其 SpacerTail 会残留为幽灵单元格，
  // diff/渲染管线会跳过它，导致旧帧的过时内容泄漏出来。
  const prevWidth = cells[ci + 1]! & WIDTH_MASK
  if (prevWidth === CellWidth.Wide && cell.width !== CellWidth.Wide) {
    const spacerX = x + 1
    if (spacerX < screen.width) {
      const spacerCI = ci + 2
      if ((cells[spacerCI + 1]! & WIDTH_MASK) === CellWidth.SpacerTail) {
        cells[spacerCI] = EMPTY_CHAR_INDEX
        cells[spacerCI + 1] = packWord1(
          screen.emptyStyleId,
          0,
          CellWidth.Narrow,
        )
      }
    }
  }
  // 记录已清除的 Wide 位置，供下方的 damage 扩展使用
  let clearedWideX = -1
  if (
    prevWidth === CellWidth.SpacerTail &&
    cell.width !== CellWidth.SpacerTail
  ) {
    // 覆盖 SpacerTail：清除位于 (x-1) 的孤立宽字符。
    // 如果用窄宽度保留宽字符，终端仍会以宽度 2 渲染它，
    // 导致光标模型不同步。
    if (x > 0) {
      const wideCI = ci - 2
      if ((cells[wideCI + 1]! & WIDTH_MASK) === CellWidth.Wide) {
        cells[wideCI] = EMPTY_CHAR_INDEX
        cells[wideCI + 1] = packWord1(screen.emptyStyleId, 0, CellWidth.Narrow)
        clearedWideX = x - 1
      }
    }
  }

  // 将单元格数据打包到 cells 数组中
  cells[ci] = internCharString(screen, cell.char)
  cells[ci + 1] = packWord1(
    cell.styleId,
    internHyperlink(screen, cell.hyperlink),
    cell.width,
  )

  // 追踪 damage — 原地扩展边界，不分配新对象
  // 包含主单元格位置和任何已清除的孤立单元格
  const minX = clearedWideX >= 0 ? Math.min(x, clearedWideX) : x
  const damage = screen.damage
  if (damage) {
    const right = damage.x + damage.width
    const bottom = damage.y + damage.height
    if (minX < damage.x) {
      damage.width += damage.x - minX
      damage.x = minX
    } else if (x >= right) {
      damage.width = x - damage.x + 1
    }
    if (y < damage.y) {
      damage.height += damage.y - y
      damage.y = y
    } else if (y >= bottom) {
      damage.height = y - damage.y + 1
    }
  } else {
    screen.damage = { x: minX, y, width: x - minX + 1, height: 1 }
  }

  // 如果是宽字符，在下一列创建间隔单元格
  if (cell.width === CellWidth.Wide) {
    const spacerX = x + 1
    if (spacerX < screen.width) {
      const spacerCI = ci + 2
      // 如果我们用 SpacerTail 覆盖的单元格本身是 Wide，
      // 也要清除它在 x+2 处的 SpacerTail。否则孤立的 SpacerTail
      // 会使 diffEach 将其报告为 `added`，而 log-update 的跳过间隔单元格
      // 规则会阻止清除该列之前的任何内容。
      // 场景：[a, 💻, spacer] → [本, spacer, 孤立 spacer] 当
      // yoga 将 a💻 压缩到高度 0 且 本 渲染在同一个 y 时。
      if ((cells[spacerCI + 1]! & WIDTH_MASK) === CellWidth.Wide) {
        const orphanCI = spacerCI + 2
        if (
          spacerX + 1 < screen.width &&
          (cells[orphanCI + 1]! & WIDTH_MASK) === CellWidth.SpacerTail
        ) {
          cells[orphanCI] = EMPTY_CHAR_INDEX
          cells[orphanCI + 1] = packWord1(
            screen.emptyStyleId,
            0,
            CellWidth.Narrow,
          )
        }
      }
      cells[spacerCI] = SPACER_CHAR_INDEX
      cells[spacerCI + 1] = packWord1(
        screen.emptyStyleId,
        0,
        CellWidth.SpacerTail,
      )

      // 扩展 damage 以包含 SpacerTail，使 diff() 扫描到它
      const d = screen.damage
      if (d && spacerX >= d.x + d.width) {
        d.width = spacerX - d.x + 1
      }
    }
  }
}

/**
 * 原地替换单元格的 styleId，不影响 char、width 或 hyperlink。
 * 保持空单元格不变（char 保持 ' '）。为单元格追踪 damage，
 * 使 diffEach 能检测到变化。
 */
export function setCellStyleId(
  screen: Screen,
  x: number,
  y: number,
  styleId: number,
): void {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height) return
  const ci = (y * screen.width + x) << 1
  const cells = screen.cells
  const word1 = cells[ci + 1]!
  const width = word1 & WIDTH_MASK
  // 跳过间隔单元格 — 头单元格上的反色视觉上覆盖两列
  if (width === CellWidth.SpacerTail || width === CellWidth.SpacerHead) return
  const hid = (word1 >>> HYPERLINK_SHIFT) & HYPERLINK_MASK
  cells[ci + 1] = packWord1(styleId, hid, width)
  // 扩展 damage 使 diffEach 扫描此单元格
  const d = screen.damage
  if (d) {
    screen.damage = unionRect(d, { x, y, width: 1, height: 1 })
  } else {
    screen.damage = { x, y, width: 1, height: 1 }
  }
}

/**
 * 通过 Screen 的共享 CharPool 实习一个字符字符串。
 * 支持像家庭 emoji 这样的字素簇。
 */
function internCharString(screen: Screen, char: string): number {
  return screen.charPool.intern(char)
}

/**
 * 使用 TypedArray.set() 将矩形区域从 src 批量复制到 dst。
 * 每行一次 cells.set() 调用（连续块只需一次调用）。
 * Damage 为整个区域计算一次。
 *
 * 将负的 regionX/regionY 钳制到 0（与 clearRegion 一致）—
 * 小终端中的绝对定位覆盖层可能计算出负的屏幕坐标。
 * maxX/maxY 应已由调用者钳制到屏幕边界内。
 */
export function blitRegion(
  dst: Screen,
  src: Screen,
  regionX: number,
  regionY: number,
  maxX: number,
  maxY: number,
): void {
  regionX = Math.max(0, regionX)
  regionY = Math.max(0, regionY)
  if (regionX >= maxX || regionY >= maxY) return

  const rowLen = maxX - regionX
  const srcStride = src.width << 1
  const dstStride = dst.width << 1
  const rowBytes = rowLen << 1 // 2 Int32s per cell
  const srcCells = src.cells
  const dstCells = dst.cells
  const srcNoSel = src.noSelect
  const dstNoSel = dst.noSelect

  // softWrap 是逐行的 — 无论 stride/width 如何，复制行范围。
  // 部分宽度的 blit 仍然携带行的换行来源，因为
  // blit 的内容（缓存的 ink-text 节点）设置了该位。
  dst.softWrap.set(src.softWrap.subarray(regionY, maxY), regionY)

  // 快速路径：当在相同步长下复制全宽行时，内存是连续的
  if (regionX === 0 && maxX === src.width && src.width === dst.width) {
    const srcStart = regionY * srcStride
    const totalBytes = (maxY - regionY) * srcStride
    dstCells.set(
      srcCells.subarray(srcStart, srcStart + totalBytes),
      srcStart, // 当步长匹配且 regionX === 0 时，srcStart === dstStart
    )
    // noSelect 是 1 字节/单元格，而 cells 是 8 字节 — 同一区域，不同比例
    const nsStart = regionY * src.width
    const nsLen = (maxY - regionY) * src.width
    dstNoSel.set(srcNoSel.subarray(nsStart, nsStart + nsLen), nsStart)
  } else {
    // 部分宽度或步长不匹配区域的逐行复制
    let srcRowCI = regionY * srcStride + (regionX << 1)
    let dstRowCI = regionY * dstStride + (regionX << 1)
    let srcRowNS = regionY * src.width + regionX
    let dstRowNS = regionY * dst.width + regionX
    for (let y = regionY; y < maxY; y++) {
      dstCells.set(srcCells.subarray(srcRowCI, srcRowCI + rowBytes), dstRowCI)
      dstNoSel.set(srcNoSel.subarray(srcRowNS, srcRowNS + rowLen), dstRowNS)
      srcRowCI += srcStride
      dstRowCI += dstStride
      srcRowNS += src.width
      dstRowNS += dst.width
    }
  }

  // 为整个区域计算一次 damage
  const regionRect = {
    x: regionX,
    y: regionY,
    width: rowLen,
    height: maxY - regionY,
  }
  if (dst.damage) {
    dst.damage = unionRect(dst.damage, regionRect)
  } else {
    dst.damage = regionRect
  }

  // 处理右边缘的宽字符：间隔单元格可能在 blit 区域之外，
  // 但仍在 dst 边界内。仅在边界列进行逐行检查。
  if (maxX < dst.width) {
    let srcLastCI = (regionY * src.width + (maxX - 1)) << 1
    let dstSpacerCI = (regionY * dst.width + maxX) << 1
    let wroteSpacerOutsideRegion = false
    for (let y = regionY; y < maxY; y++) {
      if ((srcCells[srcLastCI + 1]! & WIDTH_MASK) === CellWidth.Wide) {
        dstCells[dstSpacerCI] = SPACER_CHAR_INDEX
        dstCells[dstSpacerCI + 1] = packWord1(
          dst.emptyStyleId,
          0,
          CellWidth.SpacerTail,
        )
        wroteSpacerOutsideRegion = true
      }
      srcLastCI += srcStride
      dstSpacerCI += dstStride
    }
    // 如果写入了 SpacerTail，扩展 damage 以包含该列
    if (wroteSpacerOutsideRegion && dst.damage) {
      const rightEdge = dst.damage.x + dst.damage.width
      if (rightEdge === maxX) {
        dst.damage = { ...dst.damage, width: dst.damage.width + 1 }
      }
    }
  }
}

/**
 * 批量清除屏幕上的矩形区域。
 * 使用 BigInt64Array.fill() 实现快速行清除。
 * 处理区域边缘的宽字符边界清理。
 */
export function clearRegion(
  screen: Screen,
  regionX: number,
  regionY: number,
  regionWidth: number,
  regionHeight: number,
): void {
  const startX = Math.max(0, regionX)
  const startY = Math.max(0, regionY)
  const maxX = Math.min(regionX + regionWidth, screen.width)
  const maxY = Math.min(regionY + regionHeight, screen.height)
  if (startX >= maxX || startY >= maxY) return

  const cells = screen.cells
  const cells64 = screen.cells64
  const screenWidth = screen.width
  const rowBase = startY * screenWidth
  let damageMinX = startX
  let damageMaxX = maxX

  // EMPTY_CELL_VALUE (0n) 与零初始化状态一致：
  // word0=EMPTY_CHAR_INDEX(0), word1=packWord1(0,0,0)=0
  if (startX === 0 && maxX === screenWidth) {
    // 全宽：单次填充，无需边界检查
    cells64.fill(
      EMPTY_CELL_VALUE,
      rowBase,
      rowBase + (maxY - startY) * screenWidth,
    )
  } else {
    // 部分宽度：单循环处理每行的边界清理和填充。
    const stride = screenWidth << 1 // 2 Int32s per cell
    const rowLen = maxX - startX
    const checkLeft = startX > 0
    const checkRight = maxX < screenWidth
    let leftEdge = (rowBase + startX) << 1
    let rightEdge = (rowBase + maxX - 1) << 1
    let fillStart = rowBase + startX

    for (let y = startY; y < maxY; y++) {
      // 左边界：如果 startX 处的单元格是 SpacerTail，则位于
      // startX-1（区域外）的宽字符将成为孤儿。清除它。
      if (checkLeft) {
        // leftEdge 指向 startX 处单元格的 word0；+1 是它的 word1
        if ((cells[leftEdge + 1]! & WIDTH_MASK) === CellWidth.SpacerTail) {
          // startX-1 处单元格的 word1 是 leftEdge-1；word0 是 leftEdge-2
          const prevW1 = leftEdge - 1
          if ((cells[prevW1]! & WIDTH_MASK) === CellWidth.Wide) {
            cells[prevW1 - 1] = EMPTY_CHAR_INDEX
            cells[prevW1] = packWord1(screen.emptyStyleId, 0, CellWidth.Narrow)
            damageMinX = startX - 1
          }
        }
      }

      // 右边界：如果 maxX-1 处的单元格是 Wide，则它在 maxX
      //（区域外）的 SpacerTail 将成为孤儿。清除它。
      if (checkRight) {
        // rightEdge 指向 maxX-1 处单元格的 word0；+1 是它的 word1
        if ((cells[rightEdge + 1]! & WIDTH_MASK) === CellWidth.Wide) {
          // maxX 处单元格的 word1 是 rightEdge+3（+2 到下一个 word0，+1 到 word1）
          const nextW1 = rightEdge + 3
          if ((cells[nextW1]! & WIDTH_MASK) === CellWidth.SpacerTail) {
            cells[nextW1 - 1] = EMPTY_CHAR_INDEX
            cells[nextW1] = packWord1(screen.emptyStyleId, 0, CellWidth.Narrow)
            damageMaxX = maxX + 1
          }
        }
      }

      cells64.fill(EMPTY_CELL_VALUE, fillStart, fillStart + rowLen)
      leftEdge += stride
      rightEdge += stride
      fillStart += screenWidth
    }
  }

  // 为整个区域更新一次 damage
  const regionRect = {
    x: damageMinX,
    y: startY,
    width: damageMaxX - damageMinX,
    height: maxY - startY,
  }
  if (screen.damage) {
    screen.damage = unionRect(screen.damage, regionRect)
  } else {
    screen.damage = regionRect
  }
}

/**
 * 将 [top, bottom]（包含，从 0 开始）范围内的全宽行移动 n 个位置。
 * n > 0 向上移动（模拟 CSI n S）；n < 0 向下移动（CSI n T）。
 * 空出的行被清除。不更新 damage。cells 和 noSelect 位图
 * 都会被移动，以便在滚动快速路径期间将其应用到 next.screen 时，
 * 文本选择标记保持对齐。
 */
export function shiftRows(
  screen: Screen,
  top: number,
  bottom: number,
  n: number,
): void {
  if (n === 0 || top < 0 || bottom >= screen.height || top > bottom) return
  const w = screen.width
  const cells64 = screen.cells64
  const noSel = screen.noSelect
  const sw = screen.softWrap
  const absN = Math.abs(n)
  if (absN > bottom - top) {
    cells64.fill(EMPTY_CELL_VALUE, top * w, (bottom + 1) * w)
    noSel.fill(0, top * w, (bottom + 1) * w)
    sw.fill(0, top, bottom + 1)
    return
  }
  if (n > 0) {
    // SU: row top+n..bottom → top..bottom-n; clear bottom-n+1..bottom
    cells64.copyWithin(top * w, (top + n) * w, (bottom + 1) * w)
    noSel.copyWithin(top * w, (top + n) * w, (bottom + 1) * w)
    sw.copyWithin(top, top + n, bottom + 1)
    cells64.fill(EMPTY_CELL_VALUE, (bottom - n + 1) * w, (bottom + 1) * w)
    noSel.fill(0, (bottom - n + 1) * w, (bottom + 1) * w)
    sw.fill(0, bottom - n + 1, bottom + 1)
  } else {
    // SD：行 top..bottom+n → top-n..bottom；清除 top..top-n-1
    cells64.copyWithin((top - n) * w, top * w, (bottom + n + 1) * w)
    noSel.copyWithin((top - n) * w, top * w, (bottom + n + 1) * w)
    sw.copyWithin(top - n, top, bottom + n + 1)
    cells64.fill(EMPTY_CELL_VALUE, top * w, (top - n) * w)
    noSel.fill(0, top * w, (top - n) * w)
    sw.fill(0, top, top - n)
  }
}

// 匹配 OSC 8 ; ; URI BEL
const OSC8_REGEX = new RegExp(`^${ESC}\\]8${SEP}${SEP}([^${BEL}]*)${BEL}$`)
// OSC8 前缀：ESC ] 8 ; — 快速检查，跳过绝大多数样式（SGR = ESC [）的正则匹配
export const OSC8_PREFIX = `${ESC}]8${SEP}`

export function extractHyperlinkFromStyles(
  styles: AnsiCode[],
): Hyperlink | null {
  for (const style of styles) {
    const code = style.code
    if (code.length < 5 || !code.startsWith(OSC8_PREFIX)) continue
    const match = code.match(OSC8_REGEX)
    if (match) {
      return match[1] || null
    }
  }
  return null
}

export function filterOutHyperlinkStyles(styles: AnsiCode[]): AnsiCode[] {
  return styles.filter(
    style =>
      !style.code.startsWith(OSC8_PREFIX) || !OSC8_REGEX.test(style.code),
  )
}

// ---

/**
 * 返回两个屏幕之间的所有变更数组。用于测试。
 * 生产代码应使用 diffEach() 以避免分配。
 */
export function diff(
  prev: Screen,
  next: Screen,
): [point: Point, removed: Cell | undefined, added: Cell | undefined][] {
  const output: [Point, Cell | undefined, Cell | undefined][] = []
  diffEach(prev, next, (x, y, removed, added) => {
    // 复制单元格，因为 diffEach 会重用对象
    output.push([
      { x, y },
      removed ? { ...removed } : undefined,
      added ? { ...added } : undefined,
    ])
  })
  return output
}

type DiffCallback = (
  x: number,
  y: number,
  removed: Cell | undefined,
  added: Cell | undefined,
) => boolean | void

/**
 * 类似 diff()，但对每个变更调用回调而非构建数组。
 * 重用两个 Cell 对象以避免每次变更的分配。回调不能
 * 保留 Cell 对象的引用 — 它们的内容在每次调用时被覆盖。
 *
 * 如果回调曾返回 true（提前退出信号），则返回 true。
 */
export function diffEach(
  prev: Screen,
  next: Screen,
  cb: DiffCallback,
): boolean {
  const prevWidth = prev.width
  const nextWidth = next.width
  const prevHeight = prev.height
  const nextHeight = next.height

  let region: Rectangle
  if (prevWidth === 0 && prevHeight === 0) {
    region = { x: 0, y: 0, width: nextWidth, height: nextHeight }
  } else if (next.damage) {
    region = next.damage
    if (prev.damage) {
      region = unionRect(region, prev.damage)
    }
  } else if (prev.damage) {
    region = prev.damage
  } else {
    region = { x: 0, y: 0, width: 0, height: 0 }
  }

  if (prevHeight > nextHeight) {
    region = unionRect(region, {
      x: 0,
      y: nextHeight,
      width: prevWidth,
      height: prevHeight - nextHeight,
    })
  }
  if (prevWidth > nextWidth) {
    region = unionRect(region, {
      x: nextWidth,
      y: 0,
      width: prevWidth - nextWidth,
      height: prevHeight,
    })
  }

  const maxHeight = Math.max(prevHeight, nextHeight)
  const maxWidth = Math.max(prevWidth, nextWidth)
  const endY = Math.min(region.y + region.height, maxHeight)
  const endX = Math.min(region.x + region.width, maxWidth)

  if (prevWidth === nextWidth) {
    return diffSameWidth(prev, next, region.x, endX, region.y, endY, cb)
  }
  return diffDifferentWidth(prev, next, region.x, endX, region.y, endY, cb)
}

/**
 * 扫描两个 Int32Array 之间下一个差异单元格。
 * 返回第一个差异之前匹配的单元格数量，
 * 如果所有单元格都匹配，返回 `count`。小巧纯函数，适合 JIT 内联。
 */
function findNextDiff(
  a: Int32Array,
  b: Int32Array,
  w0: number,
  count: number,
): number {
  for (let i = 0; i < count; i++, w0 += 2) {
    const w1 = w0 | 1
    if (a[w0] !== b[w0] || a[w1] !== b[w1]) return i
  }
  return count
}

/**
 * 在两个屏幕都在边界内时对一行进行差异比较。
 * 使用 findNextDiff 扫描差异，解包并调用 cb。
 */
function diffRowBoth(
  prevCells: Int32Array,
  nextCells: Int32Array,
  prev: Screen,
  next: Screen,
  ci: number,
  y: number,
  startX: number,
  endX: number,
  prevCell: Cell,
  nextCell: Cell,
  cb: DiffCallback,
): boolean {
  let x = startX
  while (x < endX) {
    const skip = findNextDiff(prevCells, nextCells, ci, endX - x)
    x += skip
    ci += skip << 1
    if (x >= endX) break
    cellAtCI(prev, ci, prevCell)
    cellAtCI(next, ci, nextCell)
    if (cb(x, y, prevCell, nextCell)) return true
    x++
    ci += 2
  }
  return false
}

/**
 * 为仅存在于 prev（高度缩小）中的行发出移除事件。
 * 不能跳过空单元格 — 终端仍有上一帧的内容需要清除。
 */
function diffRowRemoved(
  prev: Screen,
  ci: number,
  y: number,
  startX: number,
  endX: number,
  prevCell: Cell,
  cb: DiffCallback,
): boolean {
  for (let x = startX; x < endX; x++, ci += 2) {
    cellAtCI(prev, ci, prevCell)
    if (cb(x, y, prevCell, undefined)) return true
  }
  return false
}

/**
 * 为仅在 next（高度增长）中存在的行发出新增事件。
 * 跳过空/未写入的单元格。
 */
function diffRowAdded(
  nextCells: Int32Array,
  next: Screen,
  ci: number,
  y: number,
  startX: number,
  endX: number,
  nextCell: Cell,
  cb: DiffCallback,
): boolean {
  for (let x = startX; x < endX; x++, ci += 2) {
    if (nextCells[ci] === 0 && nextCells[ci | 1] === 0) continue
    cellAtCI(next, ci, nextCell)
    if (cb(x, y, undefined, nextCell)) return true
  }
  return false
}

/**
 * 比较两个具有相同宽度的屏幕。
 * 将每行分发到小型、JIT 友好的函数。
 */
function diffSameWidth(
  prev: Screen,
  next: Screen,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
  cb: DiffCallback,
): boolean {
  const prevCells = prev.cells
  const nextCells = next.cells
  const width = prev.width
  const prevHeight = prev.height
  const nextHeight = next.height
  const stride = width << 1

  const prevCell: Cell = {
    char: ' ',
    styleId: 0,
    width: CellWidth.Narrow,
    hyperlink: undefined,
  }
  const nextCell: Cell = {
    char: ' ',
    styleId: 0,
    width: CellWidth.Narrow,
    hyperlink: undefined,
  }

  const rowEndX = Math.min(endX, width)
  let rowCI = (startY * width + startX) << 1

  for (let y = startY; y < endY; y++) {
    const prevIn = y < prevHeight
    const nextIn = y < nextHeight

    if (prevIn && nextIn) {
      if (
        diffRowBoth(
          prevCells,
          nextCells,
          prev,
          next,
          rowCI,
          y,
          startX,
          rowEndX,
          prevCell,
          nextCell,
          cb,
        )
      )
        return true
    } else if (prevIn) {
      if (diffRowRemoved(prev, rowCI, y, startX, rowEndX, prevCell, cb))
        return true
    } else if (nextIn) {
      if (
        diffRowAdded(nextCells, next, rowCI, y, startX, rowEndX, nextCell, cb)
      )
        return true
    }

    rowCI += stride
  }

  return false
}

/**
 * 回退方案：比较两个不同宽度（尺寸变化）的屏幕。
 * 为 prev 和 next 单元格数组使用独立的索引。
 */
function diffDifferentWidth(
  prev: Screen,
  next: Screen,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
  cb: DiffCallback,
): boolean {
  const prevWidth = prev.width
  const nextWidth = next.width
  const prevCells = prev.cells
  const nextCells = next.cells

  const prevCell: Cell = {
    char: ' ',
    styleId: 0,
    width: CellWidth.Narrow,
    hyperlink: undefined,
  }
  const nextCell: Cell = {
    char: ' ',
    styleId: 0,
    width: CellWidth.Narrow,
    hyperlink: undefined,
  }

  const prevStride = prevWidth << 1
  const nextStride = nextWidth << 1
  let prevRowCI = (startY * prevWidth + startX) << 1
  let nextRowCI = (startY * nextWidth + startX) << 1

  for (let y = startY; y < endY; y++) {
    const prevIn = y < prev.height
    const nextIn = y < next.height
    const prevEndX = prevIn ? Math.min(endX, prevWidth) : startX
    const nextEndX = nextIn ? Math.min(endX, nextWidth) : startX
    const bothEndX = Math.min(prevEndX, nextEndX)

    let prevCI = prevRowCI
    let nextCI = nextRowCI

    for (let x = startX; x < bothEndX; x++) {
      if (
        prevCells[prevCI] === nextCells[nextCI] &&
        prevCells[prevCI + 1] === nextCells[nextCI + 1]
      ) {
        prevCI += 2
        nextCI += 2
        continue
      }
      cellAtCI(prev, prevCI, prevCell)
      cellAtCI(next, nextCI, nextCell)
      prevCI += 2
      nextCI += 2
      if (cb(x, y, prevCell, nextCell)) return true
    }

    if (prevEndX > bothEndX) {
      prevCI = prevRowCI + ((bothEndX - startX) << 1)
      for (let x = bothEndX; x < prevEndX; x++) {
        cellAtCI(prev, prevCI, prevCell)
        prevCI += 2
        if (cb(x, y, prevCell, undefined)) return true
      }
    }

    if (nextEndX > bothEndX) {
      nextCI = nextRowCI + ((bothEndX - startX) << 1)
      for (let x = bothEndX; x < nextEndX; x++) {
        if (nextCells[nextCI] === 0 && nextCells[nextCI | 1] === 0) {
          nextCI += 2
          continue
        }
        cellAtCI(next, nextCI, nextCell)
        nextCI += 2
        if (cb(x, y, undefined, nextCell)) return true
      }
    }

    prevRowCI += prevStride
    nextRowCI += nextStride
  }

  return false
}

/**
 * 将矩形区域标记为 noSelect（从文本选择中排除）。
 * 钳制到屏幕边界。当 <NoSelect> 框渲染时从 output.ts 调用。
 * 无 damage 追踪 — noSelect 不影响终端输出，
 * 只有 getSelectedText/applySelectionOverlay 直接读取它。
 */
export function markNoSelectRegion(
  screen: Screen,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const maxX = Math.min(x + width, screen.width)
  const maxY = Math.min(y + height, screen.height)
  const noSel = screen.noSelect
  const stride = screen.width
  for (let row = Math.max(0, y); row < maxY; row++) {
    const rowStart = row * stride
    noSel.fill(1, rowStart + Math.max(0, x), rowStart + maxX)
  }
}
