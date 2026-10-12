package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject

/**
 * 已知会话存储的纯逻辑测试（去重 / 淘汰 / 解析容错 / 往返）。
 *
 * 直接测生产代码的 companion 纯函数（merge / parseOnePure / toJsonPure），
 * 不是复刻 —— 复刻型测试在实现变异时不会失败，等于没测。
 *
 * 为什么这段逻辑关键：会话列表的去重键写错 → 同一会话显示多条（用户困惑）；
 * 淘汰方向写反 → 刚连的会话反而被踢掉；解析不吞异常 → 一条坏记录让整个
 * 列表打不开。这些都是静默的显示问题，不会抛异常，只能靠单测锁定。
 */
class KnownSessionStoreTest {

    private fun s(
        mode: String = "LAN",
        addr: String = "http://192.168.0.5:6000",
        label: String = "会话",
        lastSeen: Long = 1000L,
    ) = KnownSessionStore.KnownSession(
        mode = mode,
        label = label,
        cwd = "/proj",
        port = 6000,
        resumeSessionId = null,
        addresses = listOf(addr),
        lastSeen = lastSeen,
    )

    // ── merge ──

    @Test
    fun `同键替换不新增`() {
        val a = s(addr = "http://1.2.3.4:6000", label = "旧", lastSeen = 1000)
        val b = s(addr = "http://1.2.3.4:6000", label = "新", lastSeen = 2000)
        val merged = KnownSessionStore.merge(listOf(a), b)
        assertEquals(1, merged.size)
        assertEquals("新", merged[0].label)
    }

    @Test
    fun `不同地址追加`() {
        val a = s(addr = "http://1.1.1.1:6000")
        val b = s(addr = "http://2.2.2.2:6000")
        assertEquals(2, KnownSessionStore.merge(listOf(a), b).size)
    }

    @Test
    fun `不同模式同地址视为不同会话`() {
        // LAN 与 TUNNEL 可能碰巧地址不同，但即使地址相同也应按模式区分
        val lan = s(mode = "LAN", addr = "http://x:6000")
        val tunnel = s(mode = "TUNNEL", addr = "http://x:6000")
        assertEquals(2, KnownSessionStore.merge(listOf(lan), tunnel).size)
    }

    @Test
    fun `结果按 lastSeen 降序`() {
        val old = s(addr = "http://a:6000", lastSeen = 100)
        val recent = s(addr = "http://b:6000", lastSeen = 900)
        val merged = KnownSessionStore.merge(listOf(old), recent)
        assertEquals("http://b:6000", merged[0].addresses[0])
    }

    @Test
    fun `超过上限时淘汰最旧的`() {
        // 造 MAX_ENTRIES+1 条，最近连的（最大 lastSeen）必须留下
        var list = emptyList<KnownSessionStore.KnownSession>()
        for (i in 0..KnownSessionStore.MAX_ENTRIES) {
            list = KnownSessionStore.merge(list, s(addr = "http://h$i:6000", lastSeen = i.toLong()))
        }
        assertEquals(KnownSessionStore.MAX_ENTRIES, list.size)
        // 最大 lastSeen 的那条在；lastSeen=0 的被淘汰
        assertTrue(list.any { it.lastSeen == KnownSessionStore.MAX_ENTRIES.toLong() })
        assertTrue(list.none { it.lastSeen == 0L })
    }

    // ── parse 容错 ──

    @Test
    fun `缺 mode 返回 null`() {
        assertNull(KnownSessionStore.parseOnePure(JSONObject("""{"addresses":["http://a:1"]}""")))
    }

    @Test
    fun `无地址返回 null`() {
        assertNull(KnownSessionStore.parseOnePure(JSONObject("""{"mode":"LAN","addresses":[]}""")))
    }

    @Test
    fun `null 返回 null`() {
        assertNull(KnownSessionStore.parseOnePure(null))
    }

    // ── 往返 ──

    @Test
    fun `toJson 与 parse 往返保留字段`() {
        val orig = KnownSessionStore.KnownSession(
            mode = "TUNNEL",
            label = "户外",
            cwd = "D:\\proj",
            port = 6003,
            resumeSessionId = "abc-123",
            addresses = listOf("wss://x.trycloudflare.com/mobile/ws"),
            lastSeen = 42L,
        )
        val back = KnownSessionStore.parseOnePure(KnownSessionStore.toJsonPure(orig))
        assertEquals(orig, back)
    }

    @Test
    fun `resumeSessionId 为 null 往返后仍为 null`() {
        val orig = s()
        val back = KnownSessionStore.parseOnePure(KnownSessionStore.toJsonPure(orig))
        assertNull(back?.resumeSessionId)
    }

    // ── toSessionOrNull：映射到会话列表可渲染的 Session ──

    @Test
    fun `映射出 host 与 port 且带上 mode`() {
        val known = KnownSessionStore.KnownSession(
            mode = "TUNNEL",
            label = "户外",
            cwd = "/proj",
            port = 6003,
            resumeSessionId = "abc",
            addresses = listOf("wss://x.trycloudflare.com/mobile/ws"),
            lastSeen = 7L,
        )
        val s = known.toSessionOrNull()
        assertEquals("x.trycloudflare.com", s?.host)
        assertEquals(6003, s?.port)
        assertEquals("TUNNEL", s?.mode)
        assertEquals("户外", s?.label)
        assertEquals(7L, s?.lastActivity)
    }

    @Test
    fun `http 地址也能解析出 host`() {
        val known = s(mode = "LAN", addr = "http://192.168.0.9:6000")
        assertEquals("192.168.0.9", known.toSessionOrNull()?.host)
    }

    @Test
    fun `无地址返回 null（不产生点不动的僵尸项）`() {
        val known = s().copy(addresses = emptyList())
        assertNull(known.toSessionOrNull())
    }

    @Test
    fun `wss 地址会填充 tunnelUrl`() {
        val known = s(mode = "TUNNEL", addr = "wss://y.trycloudflare.com/mobile/ws")
        assertEquals("wss://y.trycloudflare.com/mobile/ws", known.toSessionOrNull()?.tunnelUrl)
    }

    @Test
    fun `http 地址不填充 tunnelUrl`() {
        val known = s(mode = "LAN", addr = "http://192.168.0.9:6000")
        assertNull(known.toSessionOrNull()?.tunnelUrl)
    }
}
