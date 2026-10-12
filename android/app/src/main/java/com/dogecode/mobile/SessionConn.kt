package com.dogecode.mobile

import android.content.Context

/**
 * 一条会话的「连接单元」——真·并行连接的承载者。
 *
 * ## 为什么需要它（而不是继续用单个 client/store 字段）
 *
 * 改造前 MainActivity 只有**一个** `client` 和**一个** `store`，切换会话
 * 是「关掉旧连接、建新连接」（见 switchToSession 的旧实现）。这让手机
 * 同一时刻只能连一个 CLI：想看另一个会话的回复必须先切过去，切回来时
 * 连接又重建了一遍，错过期间的推送。
 *
 * 真·并行要求：会话列表里的每条会话**各持一条长连接**，后台持续收推送。
 * 这就需要把「一条会话的全部状态」打包成一个对象 —— 即本类。
 *
 * ## 每会话一个 MessageStore 实例（关键，不可共享）
 *
 * [MessageStore] 的文件名由内部 `file` 字段决定，而 `useSession(key)` 会
 * **改写这个字段**。若多个会话共用一个 store 实例，后台会话在写历史时
 * 若活动会话恰好切走了，就会写到**别人的历史文件**里 —— 表现为「A 会话
 * 的回复出现在 B 会话里」。这类串味静默且难查，因此每个会话必须各持
 * 一个独立的 [MessageStore]（构造时传入自己的 sessionKey）。
 *
 * ## 与 AgentBackend 的关系
 *
 * [backend] 是 [RemoteAgentBackend]（包装一条独立的 [BridgeClient]）。
 * 它不实现「重连/切换」语义 —— 那些是宿主（MainActivity）的职责，本类
 * 只持有连接与它的回调绑定。
 */
class SessionConn(
    context: Context,
    /** 会话唯一标识（[MessageStore.keyFor] 产物，如 `192.168.0.106_5680`）。 */
    val key: String,
    /** 展示名（服务端 label / 目录名；用于通知标题区分来源）。 */
    var label: String,
    /** 该会话的连接地址（http://host:port 或 wss://域名/mobile/ws）。 */
    var address: String,
) {
    /**
     * 本会话独立的历史存储 —— **不可与其它 SessionConn 共享**（见类注释）。
     * 构造时即按 key 定位到自己的历史文件，无需再调 useSession。
     */
    val store: MessageStore = MessageStore(context, key)

    /**
     * 本会话的后端（包装一条独立 WS）。
     *
     * 用 lateinit 而非构造参数：`RemoteAgentBackend.create()` 需要一个
     * 在创建时就能捕获「事件回调」的 lambda，而该回调要转发到宿主并带上
     * 本会话的 key —— 由宿主在装配时设置 [onEvent]，见 MainActivity。
     */
    lateinit var backend: RemoteAgentBackend

    /** 当前是否已连上（由 Connected/Disconnected 事件维护）。 */
    var connected: Boolean = false

    /** 是否用户主动关闭（用于防卡死回收时区分「失联」与「用户不要了」）。 */
    var userClosed: Boolean = false

    /** 最近一次收到事件的时间（毫秒）——回收长时间无活动的失联连接用。 */
    var lastActivityAt: Long = System.currentTimeMillis()

    /**
     * 事件去向：宿主装配时注入。
     *
     * 存成字段而非构造参数，是为了让本类与宿主解耦 —— SessionConn 不知道
     * UI 的存在，只负责「把这条连接的事件转出去」。
     */
    var onEvent: ((SessionConn, BridgeClient.Event) -> Unit)? = null

    /** 释放本会话的连接资源（关 WS）。幂等。 */
    fun close() {
        userClosed = true
        if (::backend.isInitialized) runCatching { backend.close() }
        connected = false
    }
}
