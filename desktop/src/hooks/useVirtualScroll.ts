import type { RefObject } from 'react'
import {
  useCallback,
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
import type { ScrollBoxHandle } from '../ink/components/ScrollBox.js'
import type { DOMElement } from '../ink/dom.js'

/**
 * 未测量项的预估高度（行数）。故意取低值：
 * 高估会导致空白（过早停止挂载，视口底部显示空占位符），
 * 而低估只是多挂载几个项目到 overscan 中。
 * 这种不对称意味着我们宁愿低估。
 */
const DEFAULT_ESTIMATE = 3
/**
 * 在视口上方和下方额外渲染的行数。取较大值，因为对于较长的工具结果，
 * 实际高度可能达到预估值的 10 倍。
 */
const OVERSCAN_ROWS = 80
/** 在 ScrollBox 布局完成前（viewportHeight=0）渲染的项目数。 */
const COLD_START_COUNT = 30
/**
 * 用于 useSyncExternalStore 快照的 scrollTop 量化。没有这个量化，
 * 每次滚轮滚动（每个刻度 3-5 次）都会触发完整的 React 提交 +
 * Yoga calculateLayout() + Ink diff 循环——导致 CPU 峰值。
 * 视觉滚动仍然保持流畅：ScrollBox.forceRender 在每次 scrollBy 时触发，
 * Ink 从 DOM 节点读取真实的 scrollTop，独立于 React 的判断。
 * React 仅在挂载范围需要移动时重新渲染；取 OVERSCAN_ROWS 的一半
 * 是最紧的安全区间（保证在新范围启用前至少还有 40 行 overscan）。
 */
const SCROLL_QUANTUM = OVERSCAN_ROWS >> 1
/**
 * 计算覆盖率时对未测量项假设的最坏情况高度。
 * 一条 MessageRow 可以小到 1 行（单行工具调用）。此处使用 1
 * 保证无论实际项目多小，挂载的跨度都能物理到达视口底部
 * ——代价是当项目较大时会过度挂载（这没关系，overscan 可以吸收）。
 */
const PESSIMISTIC_HEIGHT = 1
/** 挂载项目的上限，用于在退化情况下限制 fiber 分配。 */
const MAX_MOUNTED_ITEMS = 300
/**
 * 单次提交中最大新项目挂载数。使用 PESSIMISTIC_HEIGHT=1 滚动到新范围
 * 会一次性挂载 194 个项目（OVERSCAN_ROWS*2 + viewportH = 194）；
 * 每条新 MessageRow 渲染耗时约 1.5ms（marked 词法分析器 + formatToken +
 * ~11 次 createInstance）= 约 290ms 同步阻塞。通过多次提交将范围滑向
 * 目标，保持每次提交的挂载成本可控。渲染时的 clamp（scrollClampMin/Max）
 * 将视口保持在已挂载内容的边缘，这样追赶过程中不会出现空白。
 */
const SLIDE_STEP = 25

const NOOP_UNSUB = () => {}

export type VirtualScrollResult = {
  /** [startIndex, endIndex) 待渲染项目的半开区间切片。 */
  range: readonly [number, number]
  /** 第一个渲染项之前的占位符高度（行数）。 */
  topSpacer: number
  /** 最后一个渲染项之后的占位符高度（行数）。 */
  bottomSpacer: number
  /**
   * 回调 ref 工厂。将 `measureRef(itemKey)` 附加到每个渲染项的根 Box；
   * Yoga 布局后，计算出的高度会被缓存。
   */
  measureRef: (key: string) => (el: DOMElement | null) => void
  /**
   * 附加到 topSpacer Box。其 Yoga computedTop 即为 listOrigin
   * （虚拟化区域的第一个子元素，因此其 top = ScrollBox 中列表之前
   * 所有已渲染内容的累计高度）。
   * 无漂移：无需减去偏移量，不依赖于渲染间变化（tmux 调整大小）
   * 的项目高度。
   */
  spacerRef: RefObject<DOMElement | null>
  /**
   * 列表包装器坐标中每个项目的累计 y 偏移量（不是 scrollbox 坐标
   * ——此列表之前的徽标/同级元素会改变原点）。
   * offsets[i] = 项目 i 上方的行数；offsets[n] = 总高度。
   * 每次渲染重新计算——不要对恒等性进行 memo。
   */
  offsets: ArrayLike<number>
  /**
   * 读取指定索引项目的 Yoga computedTop。如果项目未挂载或
   * 尚未布局则返回 -1。项目 Box 是 ScrollBox 内容包装器的直接
   * Yoga 子元素（片段在 Ink DOM 中折叠），因此这是内容包装器
   * 相对坐标——与 scrollTop 相同的坐标空间。Yoga 布局独立于
   * 滚动（转换在 renderNodeToOutput 中稍后发生），因此位置
   * 在滚动间保持有效，无需等待 Ink 重新渲染。StickyTracker
   * 使用此方法遍历挂载范围，以每个滚动刻度的粒度（比此 hook
   * 重新渲染的 40 行量子更精细）查找视口边界。
   */
  getItemTop: (index: number) => number
  /**
   * 获取指定索引项目的挂载 DOMElement，或 null。用于
   * ScrollBox.scrollToElement——通过元素 ref 锚定将 Yoga
   * 位置读取推迟到渲染时（确定性；无节流竞争）。
   */
  getItemElement: (index: number) => DOMElement | null
  /** 测量的 Yoga 高度。空值表示尚未测量；0 表示渲染为空。 */
  getItemHeight: (index: number) => number | undefined
  /**
   * 滚动使项目 `i` 进入挂载范围。设置 scrollTop =
   * offsets[i] + listOrigin。范围逻辑从 scrollTop 与 offsets[]
   * 的对比中查找起始位置——两者使用相同的偏移量值，因此无论
   * offsets[i] 是否为"真实"位置，它们都保持一致。
   * 项目 i 被挂载；其屏幕位置可能偏移几十行（估计误差的 overscan
   * 量级），但它已存在于 DOM 中。随后使用 getItemTop(i) 获取精确位置。
   */
  scrollToIndex: (i: number) => void
}

/**
 * ScrollBox 内项目的 React 级虚拟化。
 *
 * ScrollBox 已经执行了 Ink 输出级的视口裁剪
 * （render-node-to-output.ts:617 跳过可见窗口外的子元素），
 * 但所有 React fiber 和 Yoga 节点仍然被分配。每条 MessageRow
 * 约 250 KB RSS，1000 条消息的会话需要约 250 MB 只增不减的内存
 * （Ink 屏幕缓冲区、WASM 线性内存、JSC 页面驻留均为只增不减）。
 *
 * 此 hook 仅挂载视口 + overscan 内的项目。占位符盒子以 O(1) fiber
 * 成本维持其余部分的滚动高度恒定。
 *
 * 高度预估：未测量项目使用固定的 DEFAULT_ESTIMATE，首次布局后
 * 替换为真实的 Yoga 高度。无滚动锚定——overscan 吸收估计误差。
 * 如果实际使用中出现明显漂移，锚定（当 topSpacer 变化时
 * scrollBy(delta)）是一个直接的后续改进。
 *
 * stickyScroll 注意事项：render-node-to-output.ts:450 在 Ink 渲染
 * 阶段设置 scrollTop=maxScroll，这不会触发 ScrollBox.subscribe。
 * 下面的 at-bottom 检查处理了这种情况——当固定在底部时，无论
 * scrollTop 声称什么，我们都渲染最后 N 个项目。
 */
export function useVirtualScroll(
  scrollRef: RefObject<ScrollBoxHandle | null>,
  itemKeys: readonly string[],
  /**
   * 终端列数。变化时，缓存的高度会过时（文本重新换行）——
   * 按 oldCols/newCols 缩放而非清除。清除会导致悲观的覆盖率
   * 回退挂载约 190 个项目（每个未缓存项目 → PESSIMISTIC_HEIGHT=1
   * → 回退 190 以到达 viewport+2×overscan）。每次新挂载运行
   * marked.lexer + 语法高亮约 3ms；对于长对话，首次调整大小
   * 需要约 600ms React reconcile。缩放保持 heightCache 填充
   * → 回退使用近似真实的高度 → 挂载范围保持紧凑。缩放后的
   * 估计值会在下一次 useLayoutEffect 中被真实的 Yoga 高度覆盖。
   *
   * 缩放后的高度足够接近，以至于放大时黑屏的 bug（调整大小前
   * 膨胀的偏移量超过调整大小后的 scrollTop → end 循环未能到达
   * 尾部）不会触发：放大时 ratio<1 将高度缩小，使偏移量与
   * 调整大小后的 Yoga 大致对齐。
   */
  columns: number,
): VirtualScrollResult {
  const heightCache = useRef(new Map<string, number>())
  // heightCache 变化时递增，以便偏移量在下一次读取时重建。Ref
  // （非 state）——在渲染阶段检查，零额外提交。
  const offsetVersionRef = useRef(0)
  // 上次提交时的 scrollTop，用于检测快速滚动模式（滑动上限门控）。
  const lastScrollTopRef = useRef(0)
  const offsetsRef = useRef<{ arr: Float64Array; version: number; n: number }>({
    arr: new Float64Array(0),
    version: -1,
    n: -1,
  })
  const itemRefs = useRef(new Map<string, DOMElement>())
  const refCache = useRef(new Map<string, (el: DOMElement | null) => void>())
  // 内联 ref 比较：必须在下方计算偏移量之前运行。skip 标志
  // 阻止 useLayoutEffect 用调整大小前的 Yoga 高度重新填充
  // heightCache（useLayoutEffect 读取的是本次渲染 calculateLayout
  // 之前的 Yoga 帧——即旧宽度的那一帧）。
  // 下一次渲染的 useLayoutEffect 读取调整大小后的 Yoga → 正确。
  const prevColumns = useRef(columns)
  const skipMeasurementRef = useRef(false)
  // 为调整大小稳定周期冻结挂载范围。已挂载的项目拥有温暖的
  // useMemo（marked.lexer、高亮）；从缩放/悲观估计重新计算范围
  // 会导致挂载/卸载抖动（每次新挂载约 3ms = 约 150ms，视觉上
  // 表现为二次闪烁）。调整大小前的范围与其他范围一样好——旧宽度
  // 下可见的项目就是用户在新宽度下想要的。冻结 2 次渲染：
  // 渲染 #1 有 skipMeasurement（Yoga 仍为调整大小前），
  // 渲染 #2 的 useLayoutEffect 将调整大小后的 Yoga 读入 heightCache。
  // 渲染 #3 有准确的高度 → 正常重新计算。
  const prevRangeRef = useRef<readonly [number, number] | null>(null)
  const freezeRendersRef = useRef(0)
  if (prevColumns.current !== columns) {
    const ratio = prevColumns.current / columns
    prevColumns.current = columns
    for (const [k, h] of heightCache.current) {
      heightCache.current.set(k, Math.max(1, Math.round(h * ratio)))
    }
    offsetVersionRef.current++
    skipMeasurementRef.current = true
    freezeRendersRef.current = 2
  }
  const frozenRange = freezeRendersRef.current > 0 ? prevRangeRef.current : null
  // 列表原点在内容包装器坐标中的位置。scrollTop 是相对于内容包装器的，
  // 但 offsets[] 是列表本地的（0 = 第一个虚拟化项目）。
  // 在 ScrollBox 内此列表之前渲染的兄弟元素 — Logo、
  // StatusNotices、Messages.tsx 中的截断分隔线 — 会按其累计高度偏移
  // item 的 Yoga 位置。若不减去此偏移，非粘性分支的 effLo/effHi 会膨胀，
  // start 会越过实际可见的项目（当粘性模式在 scrollTop 接近最大值时
  // 被打破，点击/滚动会出现空白视口）。从 topSpacer 的 Yoga
  // computedTop 读取 — 它是虚拟化区域的第一个子元素，因此其 top 值
  // 就是列表原点。不减去 offsets → 当项目高度在渲染之间变化时不会漂移
  // （tmux 调整大小：列数变化 → 重新换行 → 高度缩小 → 旧的
  // 项目采样减法变为负数 → effLo 膨胀 → 黑屏）。一帧延迟，同 heightCache。
  const listOriginRef = useRef(0)
  const spacerRef = useRef<DOMElement | null>(null)

  // useSyncExternalStore 将重新渲染与命令式滚动绑定。快照是
  // 按 SCROLL_QUANTUM 箱量化的 scrollTop — Object.is 对于小滚动
  // （大多数滚轮刻度）看不到变化，因此 React 完全跳过 commit + Yoga
  // + Ink 周期，直到累积的增量跨越一个箱。
  // 粘性状态折叠进快照（符号位），因此 sticky→broken 也会触发：
  // scrollToBottom 在不移动 scrollTop 的情况下设置 sticky=true
  // （Ink 稍后移动它），之后第一次 scrollBy 可能落在同一个箱中。
  // NaN 哨兵 = ref 未附加。
  const subscribe = useCallback(
    (listener: () => void) =>
      scrollRef.current?.subscribe(listener) ?? NOOP_UNSUB,
    [scrollRef],
  )
  useSyncExternalStore(subscribe, () => {
    const s = scrollRef.current
    if (!s) return NaN
    // 快照使用目标值（scrollTop + pendingDelta），而非已提交的
    // scrollTop。scrollBy 仅变更 pendingDelta（渲染器跨帧排空它）；
    // 已提交的 scrollTop 滞后。使用目标值意味着
    // scrollBy 上的 notify() 实际改变了快照 → React 在 Ink 的排空帧
    // 需要它们之前，为目标位置重新挂载子元素。
    const target = s.getScrollTop() + s.getPendingDelta()
    const bin = Math.floor(target / SCROLL_QUANTUM)
    return s.isSticky() ? ~bin : bin
  })
  // 读取真实的已提交 scrollTop（未量化）用于范围计算 —
  // 量化仅是重新渲染的门控，而非位置。
  const scrollTop = scrollRef.current?.getScrollTop() ?? -1
  // 范围必须同时覆盖已提交的 scrollTop（Ink 当前渲染的位置）
  // 和目标值（pending 将排空到的位置）。排空期间，中间帧
  // 在两者之间的 scrollTop 处渲染 — 如果我们仅为目标值挂载，
  // 那些帧将找不到子元素（空白行）。
  const pendingDelta = scrollRef.current?.getPendingDelta() ?? 0
  const viewportH = scrollRef.current?.getViewportHeight() ?? 0
  // true 表示 ScrollBox 固定在底部。这是唯一稳定的"在底部"信号：
  // scrollTop/scrollHeight 都反映上一次渲染的布局，而这取决于我们
  // 渲染的内容（topSpacer + items），形成反馈循环（范围 → 布局 →
  // atBottom → 范围）。stickyScroll 由用户操作（scrollToBottom/scrollBy）、
  // 初始属性以及 render-node-to-output 在其位置跟随触发时设置
  // （scrollTop>=prevMax → 固定到新最大值 → 设置标志）。渲染器的写入是
  // 反馈安全的：它仅在已处于位置底部时将 false→true 翻转，
  // 且此处标志为 true 仅意味着"尾部遍历，清除 clamp" —
  // 行为与直接读取 scrollTop==maxScroll 相同，但没有不稳定性。
  // 默认 true：在 ref 附加之前，假定在底部（粘性将在首次 Ink 渲染时
  // 将我们固定在那里）。
  const isSticky = scrollRef.current?.isSticky() ?? true

  // GC 清理过期的缓存条目（压缩、/clear、screenToggleId 增加）。仅
  // 在 itemKeys 标识变化时运行 — 滚动不涉及键。
  // itemRefs 通过 unmount 时的 ref(null) 自清理。
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refs 稳定
  useMemo(() => {
    const live = new Set(itemKeys)
    let dirty = false
    for (const k of heightCache.current.keys()) {
      if (!live.has(k)) {
        heightCache.current.delete(k)
        dirty = true
      }
    }
    for (const k of refCache.current.keys()) {
      if (!live.has(k)) refCache.current.delete(k)
    }
    if (dirty) offsetVersionRef.current++
  }, [itemKeys])

  // 偏移量在渲染之间缓存，由 offsetVersion ref 增加失效。
  // 之前的方法每次渲染分配新 Array(n+1) + 运行 n 次 Map.get；
  // 对于 n≈27k 的按键重复滚动速率（~11 次提交/秒），那是在新分配的
  // 数组上 ~300k 次查找/秒 → GC 开销 + ~2ms/渲染。
  // 版本号由 heightCache 写入者（measureRef、resize-scale、GC）增加。
  // 没有 setState — 重建是读取端延迟的，通过渲染期间的 ref 版本检查
  // （同一提交，零额外调度）。迫使内联重新计算的闪烁来自 setState 驱动的失效。
  const n = itemKeys.length
  if (
    offsetsRef.current.version !== offsetVersionRef.current ||
    offsetsRef.current.n !== n
  ) {
    const arr =
      offsetsRef.current.arr.length >= n + 1
        ? offsetsRef.current.arr
        : new Float64Array(n + 1)
    arr[0] = 0
    for (let i = 0; i < n; i++) {
      arr[i + 1] =
        arr[i]! + (heightCache.current.get(itemKeys[i]!) ?? DEFAULT_ESTIMATE)
    }
    offsetsRef.current = { arr, version: offsetVersionRef.current, n }
  }
  const offsets = offsetsRef.current.arr
  const totalHeight = offsets[n]!

  let start: number
  let end: number

  if (frozenRange) {
    // 列刚变化。保持调整大小前的范围以避免挂载抖动。
    // 限制到 n，以防消息被移除（/clear、压缩）。
    ;[start, end] = frozenRange
    start = Math.min(start, n)
    end = Math.min(end, n)
  } else if (viewportH === 0 || scrollTop < 0) {
    // 冷启动：ScrollBox 尚未布局。渲染尾部 — 粘性
    // 滚动在首次 Ink 渲染时固定到底部，因此这些是用户实际看到的项目。
    // 此后的任何向上滚动都通过 scrollBy → subscribe 触发 →
    // 我们使用真实值重新渲染。
    start = Math.max(0, n - COLD_START_COUNT)
    end = n
  } else {
    if (isSticky) {
      // 粘性滚动回退。render-node-to-output 可能已移动 scrollTop
      // 而未通知我们，因此信任"在底部"而非过时的快照。
      // 从尾部向后遍历，直到覆盖视口 + overscan。
      const budget = viewportH + OVERSCAN_ROWS
      start = n
      while (start > 0 && totalHeight - offsets[start - 1]! < budget) {
        start--
      }
      end = n
    } else {
      // 用户已向上滚动。从偏移量计算起始位置（基于估算：
      // 可能不足，这没问题 — 我们只是稍微提前开始挂载）。
      // 然后按累计已知高度扩展结束位置，而非估算的偏移量。
      // 不变式为：
      //   topSpacer + sum(real_heights[start..end]) >= scrollTop + viewportH + overscan
      // 由于 topSpacer = offsets[start] ≤ scrollTop - overscan，我们需要：
      //   sum(real_heights) >= viewportH + 2*overscan
      // 对于未测量的项目，假设 PESSIMISTIC_HEIGHT=1 — MessageRow
      // 最小可能的高度。这会在项目较大时过度挂载，但绝不会
      // 在快速滚过未测量区域时让视口显示空白间隔。
      // 一旦高度被缓存（下次渲染），覆盖率用真实值计算，范围缩小。
      // 仅当 K 可以安全地折叠进 topSpacer 而不产生可见跳跃时，
      // 才将 start 推进过项目 K。两种情况是安全的：
      //   (a) K 当前未挂载（itemRefs 无条目）。它对偏移量的贡献
      //       始终是估算值 — 间隔已经与那里的一致。无布局变化。
      //   (b) K 已挂载且其高度已缓存。offsets[start+1] 使用真实高度，
      //       因此 topSpacer = offsets[start+1] 精确等于 K 占用的
      //       Yoga 跨度。无缝卸载。
      // 不安全的情况 — K 已挂载但未缓存 — 是挂载与 useLayoutEffect
      // 测量之间的一个渲染窗口。让 K 多挂载一次让测量能够落地。
      // 挂载范围覆盖 [committed, target]，因此每个排空帧都被覆盖。
      // 在 0 处钳制：激进的滚轮向上可能将 pendingDelta 推远超过 0
      // （MX Master 自由旋转），但 scrollTop 从不为负。没有钳制，
      // effLo 将 start 拖到 0 而 effHi 保持在当前（高）scrollTop —
      // 跨度超过 MAX_MOUNTED_ITEMS 可覆盖的范围，早期排空帧显示空白。
      // listOrigin 在对比 offsets[] 之前将 scrollTop（内容包装器坐标）
      // 转换为列表本地坐标。没有这个，列表前的兄弟元素（Messages.tsx
      // 中的 Logo+通知）会按其高度膨胀 scrollTop，start 过度推进 —
      // 先吃掉 overscan，然后一旦膨胀超过 OVERSCAN_ROWS 就吃掉可见行。
      const listOrigin = listOriginRef.current
      // 限制 [committed..target] 跨度。当输入超过渲染速度时，
      // pendingDelta 无界增长 → effLo..effHi 覆盖数百个
      // 未挂载行 → 一次提交挂载 194 条新 MessageRow → 3s+
      // 同步阻塞 → 更多输入排队 → 下次更大的增量。死亡
      // 螺旋。限制跨度约束每次提交的新挂载量；
      // clamp（setClampBounds）在追赶期间显示已挂载内容的边缘，
      // 因此没有黑屏 — 滚动在几帧内到达目标，而不是一次冻结数秒。
      const MAX_SPAN_ROWS = viewportH * 3
      const rawLo = Math.min(scrollTop, scrollTop + pendingDelta)
      const rawHi = Math.max(scrollTop, scrollTop + pendingDelta)
      const span = rawHi - rawLo
      const clampedLo =
        span > MAX_SPAN_ROWS
          ? pendingDelta < 0
            ? rawHi - MAX_SPAN_ROWS // scrolling up: keep near target (low end)
            : rawLo // scrolling down: keep near committed
          : rawLo
      const clampedHi = clampedLo + Math.min(span, MAX_SPAN_ROWS)
      const effLo = Math.max(0, clampedLo - listOrigin)
      const effHi = clampedHi - listOrigin
      const lo = effLo - OVERSCAN_ROWS
      // 二分查找起始位置 — offsets 是单调递增的。之前的
      // 线性 while(start++) 扫描在 27k 条消息的会话中每次渲染迭代约 27k 次
      // （从底部滚动，start≈27200）。O(log n)。
      {
        let l = 0
        let r = n
        while (l < r) {
          const m = (l + r) >> 1
          if (offsets[m + 1]! <= lo) l = m + 1
          else r = m
        }
        start = l
      }
      // 保护：不要推进过已挂载但未测量的项目。在挂载与
      // useLayoutEffect 测量之间的一个渲染窗口期内，卸载此类项目
      // 会在 topSpacer 中使用 DEFAULT_ESTIMATE，这与它们（未知的）
      // 实际跨度不匹配 → 闪烁。已挂载的项目在 [prevStart, prevEnd) 中；
      // 扫描该范围，而非全部 n。
      {
        const p = prevRangeRef.current
        if (p && p[0] < start) {
          for (let i = p[0]; i < Math.min(start, p[1]); i++) {
            const k = itemKeys[i]!
            if (itemRefs.current.has(k) && !heightCache.current.has(k)) {
              start = i
              break
            }
          }
        }
      }

      const needed = viewportH + 2 * OVERSCAN_ROWS
      const maxEnd = Math.min(n, start + MAX_MOUNTED_ITEMS)
      let coverage = 0
      end = start
      while (
        end < maxEnd &&
        (coverage < needed || offsets[end]! < effHi + viewportH + OVERSCAN_ROWS)
      ) {
        coverage +=
          heightCache.current.get(itemKeys[end]!) ?? PESSIMISTIC_HEIGHT
        end++
      }
    }
    // 同样的覆盖率保证也适用于 atBottom 路径（它通过估算的偏移量
    // 往回遍历 start，如果项目较小，估算可能不足）。
    const needed = viewportH + 2 * OVERSCAN_ROWS
    const minStart = Math.max(0, end - MAX_MOUNTED_ITEMS)
    let coverage = 0
    for (let i = start; i < end; i++) {
      coverage += heightCache.current.get(itemKeys[i]!) ?? PESSIMISTIC_HEIGHT
    }
    while (start > minStart && coverage < needed) {
      start--
      coverage +=
        heightCache.current.get(itemKeys[start]!) ?? PESSIMISTIC_HEIGHT
    }
    // 滑动上限：限制本次提交新挂载的项目数量。滚动到
    // 新范围否则会挂载 194 个 PESSIMISTIC_HEIGHT=1 覆盖率的项目
    // — ~290ms React 渲染阻塞。基于滚动速度门控
    // （|自上次提交以来的 scrollTop 增量| > 2×viewportH — 按键重复 PageUp
    // 每次按下移动 ~viewportH/2，3+ 次按下批量 = 快速模式）。覆盖
    //  scrollBy（pendingDelta）和 scrollTo（直接写入）。正常
    // 的单次 PageUp 或粘性断开跳转跳过此限制。clamp
    // （setClampBounds）在追赶期间将视口保持在已挂载内容的边缘。
    // 仅限制范围增长；缩小是无界的。
    const prev = prevRangeRef.current
    const scrollVelocity =
      Math.abs(scrollTop - lastScrollTopRef.current) + Math.abs(pendingDelta)
    if (prev && scrollVelocity > viewportH * 2) {
      const [pS, pE] = prev
      if (start < pS - SLIDE_STEP) start = pS - SLIDE_STEP
      if (end > pE + SLIDE_STEP) end = pE + SLIDE_STEP
      // 大的向前跳转可能将 start 推过被限制的 end（start 通过二分查找
      // 推进，而 end 被限制在 pE + SLIDE_STEP）。从新的 start 处挂载
      // SLIDE_STEP 个项目，使视口在追赶期间不会空白。
      if (start > end) end = Math.min(start + SLIDE_STEP, n)
    }
    lastScrollTopRef.current = scrollTop
  }

  // 在范围计算完成后递减 freeze。冻结期间不更新 prevRangeRef，
  // 以便两次冻结渲染都重用原始的调整大小前范围
  // （而非如果消息在冻结期间变化，限制到 n 的版本）。
  if (freezeRendersRef.current > 0) {
    freezeRendersRef.current--
  } else {
    prevRangeRef.current = [start, end]
  }
  // useDeferredValue 让 React 先用旧范围渲染（廉价 —
  // 全部缓存命中），然后过渡到新范围（昂贵 — 使用
  // marked.lexer + formatToken 的新挂载）。紧急渲染保持 Ink
  // 以输入速率绘制；新挂载在非阻塞后台渲染中发生。
  // 这是 React 的原生时间切片：62ms 的新挂载块变为可中断的。
  // clamp（setClampBounds）已处理视口固定，因此延迟范围
  // 短暂滞后于 scrollTop 不会产生视觉伪影。
  //
  // 仅延迟范围增长（start 前移 / end 后移增加新挂载）。
  // 缩小是廉价的（卸载 = 移除 fiber，无需解析），
  // 且延迟值滞后缩小会导致过时的 overscan 多挂载一次
  // — 无害但会使测试在测量驱动的收紧后检查精确范围时失败。
  const dStart = useDeferredValue(start)
  const dEnd = useDeferredValue(end)
  let effStart = start < dStart ? dStart : start
  let effEnd = end > dEnd ? dEnd : end
  // 大的跳转可能使 effStart > effEnd（start 向前跳转而 dEnd
  // 仍持有旧范围的结束）。跳过延迟以避免反转的范围。
  // 粘性时也跳过 — scrollToBottom 需要尾部立即挂载，
  // 以便 scrollTop=maxScroll 落在内容上而非 bottomSpacer。
  // 延迟的 dEnd（仍在旧范围）会渲染不完整的尾部，
  // maxScroll 保持在旧内容高度，"跳到底部"会中途停止。
  // 粘性快照是单帧的，不是连续滚动 — 时间切片的好处不适用。
  if (effStart > effEnd || isSticky) {
    effStart = start
    effEnd = end
  }
  // 向下滚动（pendingDelta > 0）：绕过 effEnd 延迟，使尾部
  // 立即挂载。否则，clamp（基于 effEnd）将 scrollTop 保持
  // 在真实底部之前 — 用户向下滚动，碰到 clampMax，
  // 停止，React 追上 effEnd，clampMax 扩大，但用户已
  // 释放。感觉卡在底部之前。effStart 保持延迟，使
  // 向上滚动保持时间切片（旧消息在挂载时解析 — 昂贵的方向）。
  if (pendingDelta > 0) {
    effEnd = end
  }
  // 最终 O(viewport) 强制执行。中间的约束（maxEnd=start+
  // MAX_MOUNTED_ITEMS、滑动上限、延迟交集）限制了 [start,end]，
  // 但上述延迟+绕过的组合可能使 [effStart,effEnd]
  // 超出范围：例如持续 PageUp 时，并发模式在多次提交间交错
  // dStart 更新与 effEnd=end 绕过，有效窗口可能漂移到比
  // 即时或单独延迟更宽的范围。在一个 10K 行的恢复会话中，
  // PageUp 快速按下时这表现为 +270MB RSS
  // （yoga Node 构造函数 + createWorkInProgress fiber 分配与
  // 滚动距离成正比）。根据视口位置修剪远端 — 以保持
  // fiber 数量为 O(viewport)，无论延迟值调度如何。
  if (effEnd - effStart > MAX_MOUNTED_ITEMS) {
    // 修剪侧由视口位置决定，而非 pendingDelta 方向。
    // pendingDelta 在帧间排空到 0，而 dStart/dEnd 在并发调度下
    // 滞后；基于方向的修剪会在稳定过程中从"修剪尾部"翻转为
    // "修剪头部"，碰撞 effStart → effTopSpacer →
    // clampMin → setClampBounds 下拉 scrollTop → 滚动回退消失。
    // 基于位置：保持视口更靠近的那一端。
    const mid = (offsets[effStart]! + offsets[effEnd]!) / 2
    if (scrollTop - listOriginRef.current < mid) {
      effEnd = effStart + MAX_MOUNTED_ITEMS
    } else {
      effStart = effEnd - MAX_MOUNTED_ITEMS
    }
  }

  // 在布局 effect 中写入渲染时的 clamp 边界（不在渲染期间 —
  // 在 React 渲染期间变更 DOM 违反纯净原则）。render-node-to-output
  // 将 scrollTop 限制到这个范围，以使超越 React 异步重新渲染的
  // 突发 scrollTo 调用显示已挂载内容的边缘（最后一个/第一个
  // 可见消息）而非空白间隔。
  //
  // Clamp 必须使用有效（延迟）范围，而非即时范围。
  // 快速滚动期间，即时 [start,end] 可能已覆盖新的
  // scrollTop 位置，但子元素仍在延迟（旧）范围渲染。
  // 如果 clamp 使用即时边界，render-node-to-output 中的
  // 排空门控看到 scrollTop 在 clamp 内 → 排空超过
  // 延迟子元素的范围 → 视口落入间隔 → 白色闪烁。
  // 使用 effStart/effEnd 使 clamp 与实际挂载的内容同步。
  //
  // 粘性时跳过 clamp — render-node-to-output 权威地固定
  // scrollTop=maxScroll。冷启动/加载期间的 clamp 会导致闪烁：
  // 首次渲染使用基于估算的偏移量，clamp 被设置，粘性跟随
  // 移动 scrollTop，测量触发，偏移量用真实高度重建，
  // 第二次渲染的 clamp 不同 → scrollTop 被 clamp 调整 → 内容移位。
  const listOrigin = listOriginRef.current
  const effTopSpacer = offsets[effStart]!
  // 在 effStart=0 时上方没有未挂载的内容 — clamp 必须允许
  // 滚动超过 listOrigin 以查看列表前的内容（logo、header）它们
  // 在 ScrollBox 中但在 VirtualMessageList 之外。仅当 topSpacer
  // 非零时才进行 clamp（上方确实有未挂载项目）。
  const clampMin = effStart === 0 ? 0 : effTopSpacer + listOrigin
  // 在 effEnd=n 时没有 bottomSpacer — 无需避免竞争。在这里使用
  // offsets[n] 会固化 heightCache（比 Yoga 晚一个渲染），当尾部
  // 项目正在流式传输时，其缓存高度比真实高度滞后自上次测量以来
  // 到达的内容量。粘性断开后会将 scrollTop 限制在真实最大值以下，
  // 将流式文本推出视口（"向上滚动后响应消失"的错误）。
  // Infinity = 无界：由 render-node-to-output 自身的 Math.min(cur, maxScroll) 替代控制。
  const clampMax =
    effEnd === n
      ? Infinity
      : Math.max(effTopSpacer, offsets[effEnd]! - viewportH) + listOrigin
  useLayoutEffect(() => {
    if (isSticky) {
      scrollRef.current?.setClampBounds(undefined, undefined)
    } else {
      scrollRef.current?.setClampBounds(clampMin, clampMax)
    }
  })

  // 从上一次 Ink 渲染测量高度。每次提交都运行（无依赖），因为 Yoga
  // 重新计算布局时 React 并不知情。挂载 ≥1 帧前的项目的 yogaNode
  // 高度是有效的；全新项目尚未布局（布局发生在 resetAfterCommit →
  // onRender 中，在此 effect 之后）。
  //
  // 区分"h=0: Yoga 尚未运行"（瞬态，跳过）与"h=0:
  // MessageRow 渲染为 null"（永久，缓存它）：getComputedWidth() > 0
  // 证明 Yoga 已布局此节点（宽度来自容器，对于列中的 Box 始终非零）。
  // 如果宽度已设置且高度为 0，则项目真正为空 — 缓存 0 以使
  // start 推进门控不会永远阻塞它。否则，起始边界处的 null 渲染
  // 消息会冻结范围（向上滚动后向下滚动时显示为空白视口）。
  //
  // 不使用 setState。这里的 setState 会安排一次偏移量移位的
  // 第二次提交，由于 Ink 在每次提交时写入 stdout
  // （reconciler.resetAfterCommit → onRender），这会产生两次
  // 不同间隔高度的写入 → 可见闪烁。高度在下一次自然渲染时
  // 传播到偏移量。一帧延迟，由 overscan 吸收。
  useLayoutEffect(() => {
    const spacerYoga = spacerRef.current?.yogaNode
    if (spacerYoga && spacerYoga.getComputedWidth() > 0) {
      listOriginRef.current = spacerYoga.getComputedTop()
    }
    if (skipMeasurementRef.current) {
      skipMeasurementRef.current = false
      return
    }
    let anyChanged = false
    for (const [key, el] of itemRefs.current) {
      const yoga = el.yogaNode
      if (!yoga) continue
      const h = yoga.getComputedHeight()
      const prev = heightCache.current.get(key)
      if (h > 0) {
        if (prev !== h) {
          heightCache.current.set(key, h)
          anyChanged = true
        }
      } else if (yoga.getComputedWidth() > 0 && prev !== 0) {
        heightCache.current.set(key, 0)
        anyChanged = true
      }
    }
    if (anyChanged) offsetVersionRef.current++
  })

  // 稳定的每键回调 ref。React 的 ref 交换舞蹈（先 old(null) 后
  // new(el)）在回调标识稳定时是无操作的，避免了每次渲染的
  // itemRefs 抖动。与上面的 heightCache 一起被 GC 清理。
  // ref(null) 路径还会在卸载时捕获高度 — 此时 yogaNode
  // 仍然有效（reconciler 在 removeChild → freeRecursive 之前
  // 调用 ref(null)），因此我们在 WASM 释放前获得最终测量值。
  const measureRef = useCallback((key: string) => {
    let fn = refCache.current.get(key)
    if (!fn) {
      fn = (el: DOMElement | null) => {
        if (el) {
          itemRefs.current.set(key, el)
        } else {
          const yoga = itemRefs.current.get(key)?.yogaNode
          if (yoga && !skipMeasurementRef.current) {
            const h = yoga.getComputedHeight()
            if (
              (h > 0 || yoga.getComputedWidth() > 0) &&
              heightCache.current.get(key) !== h
            ) {
              heightCache.current.set(key, h)
              offsetVersionRef.current++
            }
          }
          itemRefs.current.delete(key)
        }
      }
      refCache.current.set(key, fn)
    }
    return fn
  }, [])

  const getItemTop = useCallback(
    (index: number) => {
      const yoga = itemRefs.current.get(itemKeys[index]!)?.yogaNode
      if (!yoga || yoga.getComputedWidth() === 0) return -1
      return yoga.getComputedTop()
    },
    [itemKeys],
  )

  const getItemElement = useCallback(
    (index: number) => itemRefs.current.get(itemKeys[index]!) ?? null,
    [itemKeys],
  )
  const getItemHeight = useCallback(
    (index: number) => heightCache.current.get(itemKeys[index]!),
    [itemKeys],
  )
  const scrollToIndex = useCallback(
    (i: number) => {
      // offsetsRef.current 保存最新的缓存偏移量（事件处理器在渲染之间
      // 运行；渲染时的闭包会过期）。
      const o = offsetsRef.current
      if (i < 0 || i >= o.n) return
      scrollRef.current?.scrollTo(o.arr[i]! + listOriginRef.current)
    },
    [scrollRef],
  )

  const effBottomSpacer = totalHeight - offsets[effEnd]!

  return {
    range: [effStart, effEnd],
    topSpacer: effTopSpacer,
    bottomSpacer: effBottomSpacer,
    measureRef,
    spacerRef,
    offsets,
    getItemTop,
    getItemElement,
    getItemHeight,
    scrollToIndex,
  }
}
