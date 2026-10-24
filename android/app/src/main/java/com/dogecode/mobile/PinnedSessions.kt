package com.dogecode.mobile

import android.content.Context
import android.content.SharedPreferences

/**
 * 会话置顶（收藏）集合的持久化与查询（纯逻辑 + 简单 KV）。
 *
 * ## 为什么需要
 *
 * 会话列表按在线状态 + 时序排序后，常用会话（主力工作目录）会被新会话
 * 挤到列表中部，每次都要翻找。置顶把它固定在组内最前。
 *
 * ## 键的选取
 *
 * 用「host:port」而非单个端口：端口会顺延/复用，同一端口换了主机就置错
 * 对象；`192.168.0.106:6000` 才唯一标识一个会话。隧道会话的 host 是域名，
 * 同样成立。
 *
 * 存在独立的 SharedPreferences 文件（`doge_pinned`），与主偏好隔离 ——
 * 置顶是纯 UI 偏好，清理主偏好时不应被连带重置。
 */
class PinnedSessions(private val prefs: SharedPreferences) {

    /**
     * 会话的置顶键：`mode:host:port`。
     *
     * **必须带 mode**：同一台电脑可能同时以 LAN 与 TUNNEL 两种方式出现在
     * 列表里（实测：两条都是 `tp-kaixings:6000`，仅 mode 不同）。只用
     * host:port 会让两者共用一个置顶键 —— 置顶其一会让两条都显示 📌，
     * 且取消任一条会把另一条也取消。
     */
    private fun keyOf(session: SessionScanner.Session): String =
        "${session.mode}:${session.host}:${session.port}"

    constructor(context: Context) : this(
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE),
    )

    /** 某会话是否已置顶。 */
    fun isPinned(session: SessionScanner.Session): Boolean =
        prefs.contains(keyFor(keyOf(session)))

    /** 切换某会话的置顶状态，返回切换后的结果（true = 已置顶）。 */
    fun toggle(session: SessionScanner.Session): Boolean {
        val key = keyFor(keyOf(session))
        val nowPinned = !prefs.contains(key)
        prefs.edit().apply {
            if (nowPinned) putBoolean(key, true) else remove(key)
        }.apply()
        return nowPinned
    }

    /** 当前置顶的全部会话键（host:port）。 */
    fun all(): Set<String> =
        prefs.all.keys
            .filter { it.startsWith(PREFIX) }
            .map { it.removePrefix(PREFIX) }
            .toSet()

    private fun keyFor(sessionKey: String): String = "$PREFIX$sessionKey"

    companion object {
        private const val PREFS = "doge_pinned"
        private const val PREFIX = "pin:"
    }
}

/**
 * 置顶排序的纯逻辑（与持久化解耦，便于单测）。
 */
object PinnedOrder {

    /**
     * 把置顶项稳定地排到最前，其余保持原序。
     *
     * 用 `sortedBy { !pinned }`（false < true）而非「拼两个列表再合并」：
     * Kotlin 的 sortedBy 是稳定排序，非置顶项的原有顺序（可能已按活跃时间
     * 排好）会被完整保留，不会因置顶而打乱。
     */
    fun <T> apply(items: List<T>, isPinned: (T) -> Boolean): List<T> =
        if (items.isEmpty()) items else items.sortedBy { !isPinned(it) }
}
