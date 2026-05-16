import { randomUUID } from 'crypto'
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react'
import {
  createHistoryAuthCtx,
  fetchLatestEvents,
  fetchOlderEvents,
  type HistoryAuthCtx,
  type HistoryPage,
} from '../assistant/sessionHistory.js'
import type { ScrollBoxHandle } from '../ink/components/ScrollBox.js'
import type { RemoteSessionConfig } from '../remote/RemoteSessionManager.js'
import { convertSDKMessage } from '../remote/sdkMessageAdapter.js'
import type { Message, SystemInformationalMessage } from '../types/message.js'
import { logForDebugging } from '../utils/debug.js'

type Props = {
  /** 依赖于 viewerOnly——非 viewer 会话没有远程历史可供分页。 */
  config: RemoteSessionConfig | undefined
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  scrollRef: RefObject<ScrollBoxHandle | null>
  /** 在 layout effect 执行 prepend 后调用，携带消息计数 + 高度增量。
   *  让 useUnseenDivider 偏移 dividerIndex + dividerYRef。 */
  onPrepend?: (indexDelta: number, heightDelta: number) => void
}

type Result = {
  /** ScrollKeybindingHandler 的 onScroll 组合的触发器。 */
  maybeLoadOlder: (handle: ScrollBoxHandle) => void
}

/** 当滚动到离顶部这个行数以内时触发 loadOlder。 */
const PREFETCH_THRESHOLD_ROWS = 40

/** 挂载时填充视口的最大链式页面加载次数。当事件转换为零可见消息（全部被过滤）时限制循环。 */
const MAX_FILL_PAGES = 10

const SENTINEL_LOADING = '正在加载更早的消息…'
const SENTINEL_LOADING_FAILED =
  '加载更早的消息失败 — 向上滚动重试'
const SENTINEL_START = '会话开始'

/** 使用与 viewer 模式相同的选项将 HistoryPage 转换为 REPL Message[]。 */
function pageToMessages(page: HistoryPage): Message[] {
  const out: Message[] = []
  for (const ev of page.events) {
    const c = convertSDKMessage(ev, {
      convertUserTextMessages: true,
      convertToolResults: true,
    })
    if (c.type === 'message') out.push(c.message)
  }
  return out
}

/**
 * 在向上滚动时延迟加载 `claude assistant` 历史。
 *
 * 挂载时：通过 anchor_to_latest 获取最新页面，前置到消息列表。
 * 向上滚动到顶部附近：通过 before_id 获取更早的页面，使用滚动锚定
 * （视口保持不动）前置。
 *
 * 除非 config.viewerOnly，否则无操作。REPL 仅在 feature('KAIROS')
 * 门控内调用此 hook，构建时消除在该处处理。
 */
export function useAssistantHistory({
  config,
  setMessages,
  scrollRef,
  onPrepend,
}: Props): Result {
  const enabled = config?.viewerOnly === true

  // 游标状态：仅 ref（游标变化时不重新渲染）。`null` = 没有更早的页面。
  // `undefined` = 初始页面尚未获取。
  const cursorRef = useRef<string | null | undefined>(undefined)
  const ctxRef = useRef<HistoryAuthCtx | null>(null)
  const inflightRef = useRef(false)

  // 滚动锚定：在 setMessages 前快照高度 + 前置计数；
  // 在 React 提交后通过 useLayoutEffect 补偿。getFreshScrollHeight
  // 直接读取 Yoga，因此提交后的值是正确的。
  const anchorRef = useRef<{ beforeHeight: number; count: number } | null>(null)

  // 填充视口链：初始页面提交后，如果内容尚未填满视口，
  // 则加载另一页。通过 layout effect 自链直到填满或预算耗尽。
  // 预算在初始加载时设置一次；用户向上滚动不需要它
  //（maybeLoadOlder 会在下次滚轮事件时重新触发）。
  const fillBudgetRef = useRef(0)

  // 稳定的哨兵 UUID — 在交换时复用，以便虚拟滚动将其视为
  // 一个条目（仅文本变化，而非删除+插入）。
  const sentinelUuidRef = useRef(randomUUID())

  function mkSentinel(text: string): SystemInformationalMessage {
    return {
      type: 'system',
      subtype: 'informational',
      content: text,
      isMeta: false,
      timestamp: new Date().toISOString(),
      uuid: sentinelUuidRef.current,
      level: 'info',
    }
  }

  /** 在顶部前置一页，非初始页面带滚动锚定快照。
   * 就地替换哨兵（存在时总是在索引 0）。 */
  const prepend = useCallback(
    (page: HistoryPage, isInitial: boolean) => {
      const msgs = pageToMessages(page)
      cursorRef.current = page.hasMore ? page.firstId : null

      if (!isInitial) {
        const s = scrollRef.current
        anchorRef.current = s
          ? { beforeHeight: s.getFreshScrollHeight(), count: msgs.length }
          : null
      }

      const sentinel = page.hasMore ? null : mkSentinel(SENTINEL_START)
      setMessages(prev => {
        // 丢弃现有哨兵（索引 0，已知稳定的 UUID — O(1)）。
        const base =
          prev[0]?.uuid === sentinelUuidRef.current ? prev.slice(1) : prev
        return sentinel ? [sentinel, ...msgs, ...base] : [...msgs, ...base]
      })

      logForDebugging(
        `[useAssistantHistory] ${isInitial ? 'initial' : 'older'} page: ${msgs.length} msgs (raw ${page.events.length}), hasMore=${page.hasMore}`,
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scrollRef is a stable ref; mkSentinel reads refs only
    [setMessages],
  )

  // 挂载时初始获取 — 尽力而为。
  useEffect(() => {
    if (!enabled || !config) return
    let cancelled = false
    void (async () => {
      const ctx = await createHistoryAuthCtx(config.sessionId).catch(() => null)
      if (!ctx || cancelled) return
      ctxRef.current = ctx
      const page = await fetchLatestEvents(ctx)
      if (cancelled || !page) return
      fillBudgetRef.current = MAX_FILL_PAGES
      prepend(page, true)
    })()
    return () => {
      cancelled = true
    }
    // config identity is stable (created once in main.tsx, never recreated)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const loadOlder = useCallback(async () => {
    if (!enabled || inflightRef.current) return
    const cursor = cursorRef.current
    const ctx = ctxRef.current
    if (!cursor || !ctx) return // null=exhausted, undefined=initial pending
    inflightRef.current = true
    // 将哨兵切换为"正在加载…" — O(1) 切片，因为哨兵在索引 0。
    setMessages(prev => {
      const base =
        prev[0]?.uuid === sentinelUuidRef.current ? prev.slice(1) : prev
      return [mkSentinel(SENTINEL_LOADING), ...base]
    })
    try {
      const page = await fetchOlderEvents(ctx, cursor)
      if (!page) {
        // 获取失败 — 将哨兵恢复为"start"占位符，以便用户
        // 可以在下次向上滚动时重试。游标保持不变（不会置空）。
        setMessages(prev => {
          const base =
            prev[0]?.uuid === sentinelUuidRef.current ? prev.slice(1) : prev
          return [mkSentinel(SENTINEL_LOADING_FAILED), ...base]
        })
        return
      }
      prepend(page, false)
    } finally {
      inflightRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mkSentinel reads refs only
  }, [enabled, prepend, setMessages])

  // 滚动锚定补偿 — React 提交前置项目后，
  // 按高度差移动 scrollTop 以保持视口不变。同时
  // 在此处触发 onPrepend（而非在 prepend() 中），以便 dividerIndex + baseline ref
  // 按照实际高度差（而非估计值）移动。
  // 无依赖：每次渲染都运行；当 anchorRef 为 null 时是廉价空操作。
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (anchor === null) return
    anchorRef.current = null
    const s = scrollRef.current
    if (!s || s.isSticky()) return // sticky = pinned bottom; prepend is invisible
    const delta = s.getFreshScrollHeight() - anchor.beforeHeight
    if (delta > 0) s.scrollBy(delta)
    onPrepend?.(anchor.count, delta)
  })

  // 填充视口链：绘制后，如果内容未超出视口，
  // 则加载另一页。作为 useEffect（而非 layout effect）运行，以便 Ink
  // 已完成绘制且 scrollViewportHeight 已填充。通过下次渲染的
  // effect 自链；预算限制链长度。
  //
  // ScrollBox 内容包装器具有 flexGrow:1 flexShrink:0 — 被限制为
  // ≥ 视口。因此 `content < viewport` 永远不会为真；`<=` 正确检测
  // "尚未溢出"。一旦有至少可滚动的内容即停止。
  useEffect(() => {
    if (
      fillBudgetRef.current <= 0 ||
      !cursorRef.current ||
      inflightRef.current
    ) {
      return
    }
    const s = scrollRef.current
    if (!s) return
    const contentH = s.getFreshScrollHeight()
    const viewH = s.getViewportHeight()
    logForDebugging(
      `[useAssistantHistory] fill-check: content=${contentH} viewport=${viewH} budget=${fillBudgetRef.current}`,
    )
    if (contentH <= viewH) {
      fillBudgetRef.current--
      void loadOlder()
    } else {
      fillBudgetRef.current = 0
    }
  })

  // REPL 中 onScroll 组合的触发器包装。
  const maybeLoadOlder = useCallback(
    (handle: ScrollBoxHandle) => {
      if (handle.getScrollTop() < PREFETCH_THRESHOLD_ROWS) void loadOlder()
    },
    [loadOlder],
  )

  return { maybeLoadOlder }
}
