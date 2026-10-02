package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * BridgeUrl 的测试。
 *
 * 这些是连接成败的第一道关口：normalize 少补端口、buildWsUrl 少带 secret
 * 或漏编码，都会导致连不上或 4001 认证失败，而 UI 上只表现为「连不上」，
 * 很难反查到是 URL 拼错。所以必须覆盖。
 */
class BridgeUrlTest {

    // ── normalize ──

    @Test
    fun `裸 IP 补默认端口`() {
        assertEquals("http://127.0.0.1:5680", BridgeUrl.normalize("127.0.0.1"))
    }

    @Test
    fun `IP 带端口时不重复补端口`() {
        assertEquals("http://192.168.0.106:5681", BridgeUrl.normalize("192.168.0.106:5681"))
    }

    @Test
    fun `完整 URL 原样保留`() {
        assertEquals("http://host:5680", BridgeUrl.normalize("http://host:5680"))
    }

    @Test
    fun `https 也补端口`() {
        assertEquals("https://host:5680", BridgeUrl.normalize("https://host"))
    }

    @Test
    fun `空输入回落默认地址`() {
        assertEquals("http://127.0.0.1:5680", BridgeUrl.normalize(""))
        assertEquals("http://127.0.0.1:5680", BridgeUrl.normalize("   "))
    }

    @Test
    fun `首尾空白被去除`() {
        assertEquals("http://127.0.0.1:5680", BridgeUrl.normalize("  127.0.0.1  "))
    }

    @Test
    fun `IPv6 带端口不被重复补端口`() {
        // [::1]:5680 含冒号，早期用"是否含冒号"判断会误判；URI 解析可正确处理
        val out = BridgeUrl.normalize("http://[::1]:5680")
        assertTrue("不应变成 [::1]:5680:5680", out.endsWith(":5680"))
        assertFalse(out.contains("5680:5680"))
    }

    // ── buildWsUrl ──

    @Test
    fun `http 转 ws 且路径正确`() {
        val u = BridgeUrl.buildWsUrl("http://127.0.0.1:5680", "")
        assertTrue(u.startsWith("ws://127.0.0.1:5680/mobile/ws?"))
    }

    @Test
    fun `https 转 wss`() {
        val u = BridgeUrl.buildWsUrl("https://host:5680", "")
        assertTrue(u.startsWith("wss://host:5680/mobile/ws?"))
    }

    @Test
    fun `无密钥时不带 secret 参数`() {
        val u = BridgeUrl.buildWsUrl("http://h:5680", "")
        assertFalse("空密钥不应产生 secret=", u.contains("secret="))
    }

    @Test
    fun `有密钥时带上且正确编码`() {
        val u = BridgeUrl.buildWsUrl("http://h:5680", "a b&c=d")
        assertTrue(u.contains("secret="))
        // 空格应编码为 %20 或 +，& 必须编码，否则会截断 query
        assertFalse("未编码的 & 会截断参数", u.substringAfter("secret=").contains("&"))
    }

    @Test
    fun `末尾斜杠不会产生双斜杠`() {
        val u = BridgeUrl.buildWsUrl("http://h:5680/", "")
        assertFalse("不应出现 //mobile", u.contains("//mobile"))
    }

    @Test
    fun `始终带 deviceId 与 deviceType`() {
        val u = BridgeUrl.buildWsUrl("http://h:5680", "")
        assertTrue(u.contains("deviceId="))
        assertTrue(u.contains("deviceType=android"))
    }

    // ── hostOf / portOf ──

    @Test
    fun `从各种输入取主机`() {
        assertEquals("127.0.0.1", BridgeUrl.hostOf("127.0.0.1"))
        assertEquals("192.168.0.106", BridgeUrl.hostOf("192.168.0.106:5681"))
        assertEquals("example.com", BridgeUrl.hostOf("http://example.com:5680"))
    }

    @Test
    fun `从各种输入取端口`() {
        assertEquals(5680, BridgeUrl.portOf("127.0.0.1"))
        assertEquals(5681, BridgeUrl.portOf("192.168.0.106:5681"))
        assertEquals(5680, BridgeUrl.portOf("http://example.com"))
    }

    @Test
    fun `非法输入回落而非抛异常`() {
        // 用户可能输入半截地址，绝不能因此崩溃
        assertEquals("127.0.0.1", BridgeUrl.hostOf("http://"))
        assertEquals(5680, BridgeUrl.portOf("http://"))
    }
}
