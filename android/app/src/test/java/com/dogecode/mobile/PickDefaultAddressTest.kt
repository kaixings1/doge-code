package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 「默认连接地址」选取的测试。
 *
 * 背景（用户报的「垃圾地址」）：地址栏在无历史值时曾回落到
 * `http://127.0.0.1:5680` —— 对非 USB 场景毫无意义，用户看到只会困惑。
 * 改为回落「最近连过的可用地址」后，开 App 就能直接点连接。
 */
class PickDefaultAddressTest {

    private fun rec(
        addr: String,
        lastSeen: Long = 0L,
        port: Int = 6000,
        mode: String = "LAN",
    ) = KnownSessionStore.KnownSession(
        mode = mode,
        label = "x",
        cwd = "",
        port = port,
        resumeSessionId = null,
        addresses = listOf(addr),
        lastSeen = lastSeen,
    )

    @Test
    fun `空列表返回 null（调用方再回落 DEFAULT_URL）`() {
        assertNull(KnownSessionStore.pickDefaultAddress(emptyList()))
    }

    @Test
    fun `取最近用过的地址`() {
        val list = listOf(
            rec("http://192.168.0.106:6000", lastSeen = 100),
            rec("http://tp-kaixings:6001", lastSeen = 200), // 最近
        )
        assertEquals("http://tp-kaixings:6001", KnownSessionStore.pickDefaultAddress(list))
    }

    @Test
    fun `跳过回环地址（USB 专用，当默认值会误导）`() {
        val list = listOf(
            rec("http://127.0.0.1:5680", lastSeen = 999),   // 最新但无意义
            rec("http://192.168.0.106:6000", lastSeen = 100),
        )
        assertEquals("http://192.168.0.106:6000", KnownSessionStore.pickDefaultAddress(list))
    }

    @Test
    fun `跳过 localhost`() {
        val list = listOf(
            rec("http://localhost:5680", lastSeen = 999),
            rec("http://tp-kaixings:6001", lastSeen = 1),
        )
        assertEquals("http://tp-kaixings:6001", KnownSessionStore.pickDefaultAddress(list))
    }

    @Test
    fun `全是回环时返回 null（不硬塞一个连不上的）`() {
        val list = listOf(
            rec("http://127.0.0.1:5680", lastSeen = 2),
            rec("http://localhost:6000", lastSeen = 1),
        )
        assertNull(KnownSessionStore.pickDefaultAddress(list))
    }

    @Test
    fun `隧道 wss 地址也可作为默认值`() {
        val list = listOf(
            rec("wss://abc.trycloudflare.com/mobile/ws", lastSeen = 5, mode = "TUNNEL"),
        )
        assertEquals(
            "wss://abc.trycloudflare.com/mobile/ws",
            KnownSessionStore.pickDefaultAddress(list),
        )
    }

    @Test
    fun `无地址的记录被跳过`() {
        val noAddr = KnownSessionStore.KnownSession(
            mode = "LAN", label = "z", cwd = "", port = 1,
            resumeSessionId = null, addresses = emptyList(), lastSeen = 999,
        )
        val list = listOf(noAddr, rec("http://192.168.0.106:6000", lastSeen = 1))
        assertEquals("http://192.168.0.106:6000", KnownSessionStore.pickDefaultAddress(list))
    }
}
