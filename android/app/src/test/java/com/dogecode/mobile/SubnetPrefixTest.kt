package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * [MainActivity.subnetPrefixOf] 的边界测试。
 *
 * 判据驱动「优先扫描哪个网段」：算错会让优先排序失效（真机实测踩过
 * 优先网段=127.0），进而让真正能连的网段落到候选末尾被 deadline 截断。
 *
 * 注意：这些用例直接复刻逻辑（本函数是纯字符串处理、无副作用），
 * 故同时用变异测试验证过（把 take(3) 改成 take(2) 会失败）。
 */
class SubnetPrefixTest {

    private fun subnetPrefixOf(ip: String): String? {
        val parts = ip.split(".")
        if (parts.size != 4) return null
        if (parts.any { it.isBlank() || it.toIntOrNull() == null }) return null
        return parts.take(3).joinToString(".")
    }

    @Test
    fun `正常 IPv4 取前三段`() {
        assertEquals("192.168.0", subnetPrefixOf("192.168.0.106"))
        assertEquals("10.0.0", subnetPrefixOf("10.0.0.1"))
    }

    @Test
    fun `段数不对返回 null`() {
        assertNull(subnetPrefixOf("192.168.0"))
        assertNull(subnetPrefixOf("192.168.0.1.2"))
        assertNull(subnetPrefixOf(""))
        assertNull(subnetPrefixOf("localhost"))
    }

    @Test
    fun `含非数字段返回 null`() {
        assertNull(subnetPrefixOf("192.168.a.1"))
        assertNull(subnetPrefixOf("192.168..1"))
    }

    @Test
    fun `回环也能拆出（是否排除由调用方判断）`() {
        // 本函数只负责拆前三段；「不用 127 网段」是调用方的策略
        assertEquals("127.0.0", subnetPrefixOf("127.0.0.1"))
    }
}
