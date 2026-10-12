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
    fun `https 不补端口（走协议默认 443）`() {
        // 旧行为补了 :5680，导致公网隧道域名连到不存在的 5680 端口而超时。
        // https 自带默认端口语义，不该被本机的 5680 覆盖。
        assertEquals("https://host", BridgeUrl.normalize("https://host"))
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

    // ── TUNNEL（公网隧道）地址：手机直接粘贴 wss://… ──
    //
    // 隧道模式能否连上的关键：桌面端 `--tunnel` 打印给手机的是
    // `wss://<子域>.trycloudflare.com/mobile/ws`。若 normalize 不识别
    // wss:// 前缀，会把它当裸主机补成 `http://wss://…:5680`——必然连不上，
    // 且失败只表现为「已断开」，用户无从判断是地址格式问题。

    @Test
    fun `wss 地址原样保留不补前缀不补端口`() {
        assertEquals(
            "wss://abc-123.trycloudflare.com/mobile/ws",
            BridgeUrl.normalize("wss://abc-123.trycloudflare.com/mobile/ws"),
        )
        assertEquals(
            "wss://abc-123.trycloudflare.com",
            BridgeUrl.normalize("wss://abc-123.trycloudflare.com"),
        )
    }

    @Test
    fun `ws 地址原样保留`() {
        assertEquals("ws://h:5680", BridgeUrl.normalize("ws://h:5680"))
    }

    @Test
    fun `https 隧道域名不被补 5680 端口`() {
        // 真机实测：用户粘 https://xxx.trycloudflare.com/mobile/ws，被补成
        // :5680 → 连隧道 5680（不存在）→ 超时。HTTPS 走 443，绝不能补端口。
        assertEquals(
            "https://abc.trycloudflare.com/mobile/ws",
            BridgeUrl.normalize("https://abc.trycloudflare.com/mobile/ws"),
        )
        assertEquals(
            "https://abc.trycloudflare.com",
            BridgeUrl.normalize("https://abc.trycloudflare.com"),
        )
    }

    @Test
    fun `https 隧道地址经 buildWsUrl 得到无端口的 wss`() {
        val u = BridgeUrl.buildWsUrl("https://abc.trycloudflare.com/mobile/ws", "")
        assertTrue("应为 wss 且无 :5680: $u", u.startsWith("wss://abc.trycloudflare.com/mobile/ws?"))
        assertFalse("不应含 :5680", u.contains(":${BridgeUrl.DEFAULT_PORT}"))
    }

    @Test
    fun `隧道域名带本地端口被自愈为无端口的 wss`() {
        // 真机实测：prefs 里存着 http://deposit-hills-regards-fees.trycloudflare.com:6003
        // （用户误加了本地端口）。隧道只经 443，绝不能带 6003 → 必须还原成
        // wss://<域名>/mobile/ws，否则连不上且无提示。
        assertEquals(
            "wss://abc.trycloudflare.com/mobile/ws",
            BridgeUrl.normalize("http://abc.trycloudflare.com:6003"),
        )
        assertEquals(
            "wss://abc.trycloudflare.com/mobile/ws",
            BridgeUrl.normalize("http://abc.trycloudflare.com:6000"),
        )
        // https 变体（带错误端口）同样自愈
        assertEquals(
            "wss://abc.trycloudflare.com/mobile/ws",
            BridgeUrl.normalize("https://abc.trycloudflare.com:5680"),
        )
        assertEquals(
            "wss://abc.trycloudflare.com/mobile/ws",
            BridgeUrl.normalize("abc.trycloudflare.com:6003"),
        )
    }

    @Test
    fun `无端口的隧道地址不被自愈改写`() {
        // 裸域名与 https 地址本就正确（buildWsUrl 会把 https 转 wss），
        // 自愈只针对"带错误端口"，不应碰这些，否则破坏既有语义。
        assertEquals(
            "https://abc.trycloudflare.com/mobile/ws",
            BridgeUrl.normalize("https://abc.trycloudflare.com/mobile/ws"),
        )
        assertEquals(
            "https://abc.trycloudflare.com",
            BridgeUrl.normalize("https://abc.trycloudflare.com"),
        )
    }

    @Test
    fun `非隧道域名不受端口自愈影响`() {
        // 自愈只针对 trycloudflare.com，普通 LAN 地址必须保持原样（补默认端口）。
        assertEquals("http://192.168.0.106:5681", BridgeUrl.normalize("192.168.0.106:5681"))
        assertEquals("http://host:6003", BridgeUrl.normalize("http://host:6003"))
    }

    @Test
    fun `历史脏数据 http 前缀包 wss 被自愈`() {
        // 老版本把 wss:// 误加前缀，真机实测存成了这种值。必须能被救回来，
        // 否则用户即便升级了 App，SharedPreferences 里的旧值仍会一直失败。
        assertEquals(
            "wss://abc.trycloudflare.com/mobile/ws",
            BridgeUrl.normalize("http://wss://abc.trycloudflare.com/mobile/ws"),
        )
        assertEquals(
            "wss://abc.trycloudflare.com/mobile/ws",
            BridgeUrl.normalize("https://wss://abc.trycloudflare.com/mobile/ws"),
        )
    }

    @Test
    fun `脏数据自愈后不再追加端口`() {
        // 曾出现无限堆积：http://wss://x/mobile/ws:5680:5680:5680...
        // 自愈成 wss:// 后必须原样返回，绝不再补端口。
        val dirty = "http://wss://abc.trycloudflare.com/mobile/ws"
        val out = BridgeUrl.normalize(dirty)
        assertFalse("不应含 :5680", out.contains(":${BridgeUrl.DEFAULT_PORT}"))
        assertTrue("应还原为 wss", out.startsWith("wss://"))
    }

    @Test
    fun `重复调用 normalize 结果是幂等的`() {
        // 旧实现每次调用都补一遍 :5680，导致历史里堆积成
        // "...:5680:5680:5680"（真机实测）。幂等是必须的不变量。
        val once = BridgeUrl.normalize("wss://abc.trycloudflare.com/mobile/ws")
        val twice = BridgeUrl.normalize(once)
        val thrice = BridgeUrl.normalize(twice)
        assertEquals(once, twice)
        assertEquals(once, thrice)
    }

    @Test
    fun `隧道完整地址经 buildWsUrl 直接可用且不重复路径`() {
        val u = BridgeUrl.buildWsUrl("wss://abc-123.trycloudflare.com/mobile/ws", "")
        assertTrue(
            "应保持 wss 且不重复路径: $u",
            u.startsWith("wss://abc-123.trycloudflare.com/mobile/ws?") &&
                !u.contains("/mobile/ws/mobile/ws"),
        )
    }

    @Test
    fun `隧道裸域名经 buildWsUrl 自动补 ws 路径`() {
        val u = BridgeUrl.buildWsUrl("wss://abc-123.trycloudflare.com", "")
        assertTrue("应自动补 /mobile/ws: $u", u.startsWith("wss://abc-123.trycloudflare.com/mobile/ws?"))
    }

    @Test
    fun `隧道地址带 secret 时正确附带`() {
        val u = BridgeUrl.buildWsUrl("wss://x.trycloudflare.com/mobile/ws", "s3cret")
        assertTrue(u.contains("secret=s3cret"))
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
