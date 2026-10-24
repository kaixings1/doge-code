package com.dogecode.mobile

import android.content.SharedPreferences
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.ConcurrentHashMap

/**
 * 会话置顶的持久化与排序逻辑测试。
 *
 * 两个易错点（本测试重点钉死）：
 * 1. 键必须用 `host:port` —— 只按端口会让「同端口换主机」置错对象
 * 2. 置顶排序必须是**稳定**的 —— 未置顶项原有顺序（可能已按活跃时间排好）
 *    不能被置顶操作打乱，否则用户会看到列表莫名重排
 */
class PinnedSessionsTest {

    private val store = PinnedSessions(InMemoryPrefs())

    private fun session(host: String, port: Int) = SessionScanner.Session(
        port = port,
        sessionId = "mobile-test-$port",
        label = "$host:$port",
        cwd = "",
        interactive = true,
        clients = 0,
        host = host,
    )

    @Test
    fun `默认未置顶`() {
        assertFalse(store.isPinned(session("10.0.0.1", 6000)))
    }

    @Test
    fun `切换后置顶、再切换取消`() {
        val s = session("10.0.0.1", 6000)
        assertTrue("首次 toggle 应置顶", store.toggle(s))
        assertTrue(store.isPinned(s))
        assertFalse("再次 toggle 应取消", store.toggle(s))
        assertFalse(store.isPinned(s))
    }

    @Test
    fun `不同主机同端口互不影响`() {
        // 这正是「只按端口」会出错的场景
        store.toggle(session("10.0.0.1", 6000))
        assertTrue(store.isPinned(session("10.0.0.1", 6000)))
        assertFalse(store.isPinned(session("10.0.0.2", 6000)))
    }

    @Test
    fun `同主机同端口的 LAN 与 TUNNEL 会话互不影响`() {
        // 实测场景：一台电脑同时以 LAN + TUNNEL 出现，两者 host/port 相同，
        // 仅 mode 不同。只按 host:port 会造成「置顶一条、两条都亮 📌」。
        val lan = session("tp-kaixings", 6000).copy(mode = "LAN")
        val tunnel = session("tp-kaixings", 6000).copy(mode = "TUNNEL")
        store.toggle(lan)
        assertTrue("LAN 应已置顶", store.isPinned(lan))
        assertFalse("TUNNEL 不应被连带置顶", store.isPinned(tunnel))
    }

    @Test
    fun `all 返回已置顶的键`() {
        store.toggle(session("10.0.0.1", 6000))
        store.toggle(session("10.0.0.2", 6001))
        // 键格式为 `mode:host:port`（mode 为空串时以冒号开头）
        assertEquals(setOf(":10.0.0.1:6000", ":10.0.0.2:6001"), store.all())
    }

    // ── 排序纯逻辑 ──

    @Test
    fun `置顶项移到最前且其余保持原序`() {
        val a = "a"; val b = "b"; val c = "c"; val d = "d"
        val list = listOf(a, b, c, d)
        // 只置顶 c 和 a —— 结果应为 a, c（相对序保持）+ b, d（原序保持）
        val out = PinnedOrder.apply(list) { it == "a" || it == "c" }
        assertEquals(listOf("a", "c", "b", "d"), out)
    }

    @Test
    fun `无置顶时顺序完全不变`() {
        val list = listOf("x", "y", "z")
        assertEquals(list, PinnedOrder.apply(list) { false })
    }

    @Test
    fun `全部置顶时保持原序`() {
        val list = listOf("x", "y", "z")
        assertEquals(list, PinnedOrder.apply(list) { true })
    }

    @Test
    fun `空列表安全`() {
        assertEquals(emptyList<String>(), PinnedOrder.apply(emptyList<String>()) { true })
    }

    /** 内存版 SharedPreferences（仅实现本测试用到的子集）。 */
    private class InMemoryPrefs : SharedPreferences {
        private val map = ConcurrentHashMap<String, Any>()
        override fun getAll(): MutableMap<String, *> = map.toMutableMap()
        override fun getString(key: String?, defValue: String?): String? = map[key] as? String ?: defValue
        override fun getStringSet(key: String?, defValues: MutableSet<String>?) = null
        override fun getInt(key: String?, defValue: Int) = map[key] as? Int ?: defValue
        override fun getLong(key: String?, defValue: Long) = map[key] as? Long ?: defValue
        override fun getFloat(key: String?, defValue: Float) = map[key] as? Float ?: defValue
        override fun getBoolean(key: String?, defValue: Boolean) = map[key] as? Boolean ?: defValue
        override fun contains(key: String?) = map.containsKey(key)
        override fun edit(): SharedPreferences.Editor = object : SharedPreferences.Editor {
            override fun putString(k: String?, v: String?) = apply { if (k != null && v != null) map[k] = v }
            override fun putStringSet(k: String?, v: MutableSet<String>?) = this
            override fun putInt(k: String?, v: Int) = apply { if (k != null) map[k] = v }
            override fun putLong(k: String?, v: Long) = apply { if (k != null) map[k] = v }
            override fun putFloat(k: String?, v: Float) = apply { if (k != null) map[k] = v }
            override fun putBoolean(k: String?, v: Boolean) = apply { if (k != null) map[k] = v }
            override fun remove(k: String?) = apply { if (k != null) map.remove(k) }
            override fun clear() = apply { map.clear() }
            override fun commit() = true
            override fun apply() {}
        }
        override fun registerOnSharedPreferenceChangeListener(l: SharedPreferences.OnSharedPreferenceChangeListener?) {}
        override fun unregisterOnSharedPreferenceChangeListener(l: SharedPreferences.OnSharedPreferenceChangeListener?) {}
    }
}
