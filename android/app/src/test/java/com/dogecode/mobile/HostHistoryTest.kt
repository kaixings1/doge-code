package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 地址历史的测试（从 MainActivity 抽出后才有条件单测）。
 *
 * 边界陷阱：USB(127.0.0.1) 与局域网(192.168.x.x) 地址完全不同，
 * 用户来回切换很常见，而地址打错的表现是「连不上」——
 * 若历史里堆了重复项或丢了最近那条，用户会更困惑。
 *
 * 变异验证：把 remember 的 `filterNot` 去掉（不去重），
 * 「重复地址不堆积」用例失败。
 */
class HostHistoryTest {

    @Test
    fun `新地址置顶`() {
        val r = HostHistory.remember(listOf("http://a:5680"), "http://b:5680")
        assertEquals(listOf("http://b:5680", "http://a:5680"), r)
    }

    @Test
    fun `重复地址不堆积，只提前`() {
        // 用户在 USB 与局域网之间来回切时会反复输入同一地址
        val r = HostHistory.remember(
            listOf("http://a:5680", "http://b:5680"),
            "http://b:5680",
        )
        assertEquals(listOf("http://b:5680", "http://a:5680"), r)
        assertEquals("不应出现重复", 2, r.size)
    }

    @Test
    fun `超上限丢最旧`() {
        var hosts = emptyList<String>()
        repeat(12) { hosts = HostHistory.remember(hosts, "http://h$it:5680") }
        assertEquals(HostHistory.MAX_HOSTS, hosts.size)
        assertEquals("http://h11:5680", hosts.first())
    }

    @Test
    fun `空地址不进入历史`() {
        val r = HostHistory.remember(listOf("http://a:5680"), "")
        assertEquals(1, r.size)
        assertEquals(1, HostHistory.remember(listOf("http://a:5680"), "   ").size)
    }

    @Test
    fun `首尾空白被裁剪`() {
        val r = HostHistory.remember(emptyList(), "  http://a:5680  ")
        assertEquals(listOf("http://a:5680"), r)
    }

    @Test
    fun `不修改入参`() {
        val original = listOf("http://a:5680")
        val copy = ArrayList(original)
        HostHistory.remember(original, "http://b:5680")
        assertEquals(copy, original)
    }

    // ── 序列化往返 ──

    @Test
    fun `序列化与反序列化往返一致`() {
        val hosts = listOf("http://127.0.0.1:5680", "http://192.168.0.106:5680")
        assertEquals(hosts, HostHistory.parse(HostHistory.serialize(hosts)))
    }

    @Test
    fun `parse 容忍空行与空白`() {
        // 手工改过配置文件、或旧版本格式不同，都不该让整个列表解析失败
        val raw = "http://a:5680\n\n  http://b:5680  \n\n"
        assertEquals(listOf("http://a:5680", "http://b:5680"), HostHistory.parse(raw))
    }

    @Test
    fun `parse 处理 null 与空串`() {
        assertTrue(HostHistory.parse(null).isEmpty())
        assertTrue(HostHistory.parse("").isEmpty())
        assertTrue(HostHistory.parse("   ").isEmpty())
    }

    @Test
    fun `含查询参数的地址不被分隔符破坏`() {
        // 用逗号分隔会被 URL 里的逗号破坏；换行不会
        val url = "http://a:5680/?x=1,2&y=3"
        val r = HostHistory.remember(emptyList(), url)
        assertEquals(listOf(url), HostHistory.parse(HostHistory.serialize(r)))
    }
}
