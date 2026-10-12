package com.dogecode.mobile

/**
 * 会话连接池的**纯逻辑**部分：事件路由判据 + 失联回收判据。
 *
 * ## 为什么要抽成纯函数
 *
 * 「某条连接的事件要不要刷 UI」「哪些失联连接该回收」这两件事若写在
 * MainActivity 里（依赖 Android 的 View/Context），就只能靠真机验证 ——
 * 而它们恰恰是并行连接最容易出错的判据（路由错 → 后台消息污染当前界面；
 * 回收判据错 → 要么泄漏连接拖死 App、要么误杀正在用的会话）。
 *
 * 抽成无副作用的对象方法后，可以用 JVM 单测穷举边界，并用变异测试确认
 * 判据真的在约束行为（而不是恒真/恒假形同虚设）。
 *
 * ## 职责边界
 *
 * 本对象**只做判断，不产生副作用**：不碰 View、不发通知、不关闭连接。
 * 副作用由宿主按返回值执行 —— 这样判据可测，动作可观测。
 */
object SessionRouter {

    /**
     * 该事件是否应「作用于当前可见的对话界面」。
     *
     * 判据：事件来自**当前活动会话**。
     *
     * ## 为什么必须判（而不是一律刷 UI）
     *
     * 并行连接下，后台会话也会持续收到推送（assistant 回复、工具活动、
     * 流式增量）。若不加判断一律 append 到 adapter，用户正在看 A 会话，
     * 却会看到 B 会话的消息冒出来 —— 历史彻底串味，且是**静默**的
     *（没有报错，只是内容不对）。
     *
     * ## 连接状态类事件是例外
     *
     * Connected/Disconnected 不刷对话列表，但需要更新该会话的在线标志 ——
     * 由宿主单独处理（见 [isConnectionStateEvent]），不归此判据管。
     *
     * @param eventKey 事件来源会话的 key
     * @param activeKey 当前活动会话的 key（null 表示尚未选定任何会话）
     */
    fun affectsUi(eventKey: String, activeKey: String?): Boolean =
        activeKey != null && eventKey == activeKey

    /**
     * 是否是「连接状态」类事件 —— 这类事件即使来自非活动会话，也要更新
     * 该会话的在线标志（会话列表要显示哪些在线），故不能只按 [affectsUi] 丢。
     */
    fun isConnectionStateEvent(ev: BridgeClient.Event): Boolean = when (ev) {
        is BridgeClient.Event.Connected,
        is BridgeClient.Event.Disconnected,
        is BridgeClient.Event.AuthFailed,
        is BridgeClient.Event.SessionLimitReached,
        -> true
        else -> false
    }

    /**
     * 后台会话的入站助手消息是否该弹系统通知。
     *
     * 与前台会话的 [Notifications.notifyAssistant] 由 maybeNotify 处理不同：
     * 后台会话的消息**不经过 UI 的 append 路径**，其通知需单独发。
     * 但都要遵守同样的「什么值得提醒」规则：
     * - 只提醒 assistant 的回复（工具活动、系统提示不打扰）
     * - 文本非空
     *
     * @param role 消息角色
     * @param text 消息文本
     */
    fun shouldNotifyBackground(role: String, text: String): Boolean =
        role == "assistant" && text.isNotBlank()

    /**
     * 该连接是否应被回收（释放 WS 与内存）。
     *
     * ## 为什么需要回收（防卡死）
     *
     * 用户点了「全部会话都保持连接」，但会话列表里的条目可能长期失效
     *（电脑关机、换网段、隧道子域过期）。若不回收，map 会越来越长，
     * 每条失效连接还会按退避不断重试、刷日志、占内存 —— 最终拖死 App。
     *
     * ## 判据（三条，缺一不可）
     *
     * 1. **非活动会话** —— 当前正看着的会话即使失联也不能回收（用户
     *    可能只是网络抖动，且回收会让界面突然失去后端）。
     * 2. **未连接** —— 已连上的当然不能回收。
     * 3. **已用户主动关闭 或 超过静默阈值** —— 两种情况之一即可：
     *    · 用户主动关闭的（[userClosed]）：目的已达成，直接回收，不必等；
     *    · 其余失联连接：从最后一次活动起算超过 [idleRecycleMs] 才回收。
     *    用「最后活动时间」而非「失败次数」：失败次数受退避影响（30 秒一次
     *    的话很久才攒够），而时间阈值能覆盖「根本没在重试」的僵死连接。
     *
     * @param isActive 是否当前活动会话
     * @param connected 是否已连上
     * @param userClosed 是否用户主动关闭
     * @param lastActivityAt 最后活动时间（毫秒）
     * @param now 当前时间（毫秒）
     * @param idleRecycleMs 静默多久算僵死
     */
    fun shouldRecycle(
        isActive: Boolean,
        connected: Boolean,
        userClosed: Boolean,
        lastActivityAt: Long,
        now: Long,
        idleRecycleMs: Long,
    ): Boolean {
        if (isActive) return false
        if (connected) return false
        if (userClosed) return true
        val idle = now - lastActivityAt
        return idle >= idleRecycleMs
    }

    /** 默认静默回收阈值：5 分钟。 */
    const val DEFAULT_IDLE_RECYCLE_MS: Long = 5 * 60 * 1000L
}
